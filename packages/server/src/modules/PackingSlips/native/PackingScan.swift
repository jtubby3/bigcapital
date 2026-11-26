import Foundation
import AppKit
import PDFKit
import Vision
import ImageIO

struct ScanError: Error { let message: String }
func fail(_ message: String) throws -> Never { throw ScanError(message: message) }
let maxPixels = 40_000_000
let maxRenderPixels = 8_000_000.0

struct Line: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct Page: Codable { let page: Int; let lines: [Line] }
func json<T: Encodable>(_ value: T) throws {
    FileHandle.standardOutput.write(try JSONEncoder().encode(value))
}

final class Source {
    let pdf: PDFDocument?
    let image: CGImage?
    let pageCount: Int
    init(_ path: String, _ mime: String) throws {
        let url = URL(fileURLWithPath: path)
        if mime == "application/pdf" {
            guard let document = PDFDocument(url: url) else { try fail("Invalid PDF document.") }
            if document.isEncrypted || document.isLocked { try fail("Encrypted or locked PDFs are not supported.") }
            if document.pageCount < 1 || document.pageCount > 200 { try fail("PDF must contain between 1 and 200 pages.") }
            self.pdf = document; self.image = nil; self.pageCount = document.pageCount
        } else {
            guard mime == "image/png" || mime == "image/jpeg" else { try fail("Unsupported image type.") }
            guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary), CGImageSourceGetCount(source) == 1,
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int,
                  let height = properties[kCGImagePropertyPixelHeight] as? Int,
                  width > 0, height > 0 else { try fail("Invalid single-page image.") }
            if width > maxPixels / height { try fail("Image exceeds 40 million decoded pixels.") }
            guard let decoded = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { try fail("Invalid image data.") }
            self.pdf = nil; self.image = decoded; self.pageCount = 1
        }
    }
    func check(_ page: Int) throws {
        if page < 1 || page > pageCount { try fail("Requested page is outside the document.") }
    }
    func bitmap(_ page: Int) throws -> CGImage {
        try check(page)
        if let image = image { return image }
        guard let p = pdf?.page(at: page - 1) else { try fail("PDF page is unavailable.") }
        let bounds = p.bounds(for: .mediaBox)
        guard bounds.width.isFinite, bounds.height.isFinite, bounds.width > 0, bounds.height > 0,
              bounds.width <= 100000, bounds.height <= 100000 else { try fail("PDF page dimensions are invalid.") }
        let scale = min(2.0, sqrt(maxRenderPixels / (bounds.width * bounds.height)))
        let rotated = abs(p.rotation % 180) == 90
        let size = CGSize(width: (rotated ? bounds.height : bounds.width) * scale, height: (rotated ? bounds.width : bounds.height) * scale)
        let thumbnail = p.thumbnail(of: size, for: .mediaBox)
        guard let result = thumbnail.cgImage(forProposedRect: nil, context: nil, hints: nil), result.width > 0, result.height > 0,
              result.width <= maxPixels / result.height else { try fail("PDF rendering failed.") }
        return result
    }
    func extract(_ pages: [Int], _ output: String) throws {
        guard !pages.isEmpty, pages.count <= 200, Set(pages).count == pages.count else { try fail("Page selection must be nonempty and unique.") }
        let selected = PDFDocument()
        for page in pages {
            try check(page)
            if let document = pdf {
                // Copy the original page objects, including vector handwriting and annotations.
                guard let copy = document.page(at: page - 1)?.copy() as? PDFPage else { try fail("PDF page copy failed.") }
                selected.insert(copy, at: selected.pageCount)
            } else if let image = image {
                let native = NSImage(cgImage: image, size: CGSize(width: image.width, height: image.height))
                guard let wrapped = PDFPage(image: native) else { try fail("Image wrapping failed.") }
                selected.insert(wrapped, at: selected.pageCount)
            }
        }
        guard selected.write(to: URL(fileURLWithPath: output)) else { try fail("PDF extraction failed.") }
    }
}

func embeddedText(_ source: Source, _ number: Int) throws -> Page {
    try source.check(number)
    guard let page = source.pdf?.page(at: number - 1),
          page.rotation == 0, page.numberOfCharacters <= 100000 else {
        return Page(page: number, lines: [])
    }
    let b = page.bounds(for: .mediaBox)
    guard b.width.isFinite, b.height.isFinite, b.width > 0, b.height > 0,
          let fragments = page.selection(for: b)?.selectionsByLine(),
          fragments.count <= 20000 else {
        return Page(page: number, lines: [])
    }
    let lines: [Line] = fragments.compactMap { selection in
        guard let text = selection.string?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty, text.utf16.count <= 20000 else { return nil }
        let box = selection.bounds(for: page).intersection(b)
        guard !box.isNull, box.width > 0, box.height > 0 else { return nil }
        func clamp(_ n: Double) -> Double { min(1, max(0, n)) }
        return Line(text: text, confidence: 1,
                    x: clamp((box.minX - b.minX) / b.width),
                    y: clamp(1 - Double((box.maxY - b.minY) / b.height)),
                    width: clamp(box.width / b.width), height: clamp(box.height / b.height))
    }
    return Page(page: number, lines: lines)
}

func recognize(_ image: CGImage, _ page: Int) throws -> Page {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([request]) }
    catch { try fail("Local text recognition failed.") }
    var lines: [Line] = []
    for observation in request.results ?? [] {
        guard let text = observation.topCandidates(1).first, !text.string.isEmpty else { continue }
        let b = observation.boundingBox
        func clamp(_ n: Double) -> Double { min(1, max(0, n)) }
        lines.append(Line(text: text.string, confidence: min(1, max(0, text.confidence)), x: clamp(b.minX), y: clamp(1 - b.maxY), width: clamp(b.width), height: clamp(b.height)))
    }
    // Group by overlapping text row, then read columns left to right. Avoid a nontransitive pairwise sort.
    lines.sort { $0.y == $1.y ? $0.x < $1.x : $0.y < $1.y }
    var rows: [[Line]] = []
    for line in lines {
        if let last = rows.last, let anchor = last.first,
           abs((anchor.y + anchor.height / 2) - (line.y + line.height / 2)) <= min(anchor.height, line.height) * 0.45 {
            rows[rows.count - 1].append(line)
        } else { rows.append([line]) }
    }
    return Page(page: page, lines: rows.flatMap { $0.sorted { $0.x < $1.x } })
}

func main() throws {
    let args = CommandLine.arguments
    guard args.count >= 2 else { try fail("Missing operation.") }
    if args[1] == "health" { try json(["available": true]); return }
    guard args.count >= 4 else { try fail("Missing document arguments.") }
    let source = try Source(args[2], args[3])
    if args[1] == "info" { try json(["pageCount": source.pageCount]); return }
    guard args.count >= 5 else { try fail("Missing page selection.") }
    if args[1] == "extract" {
        guard args.count == 6 else { try fail("Missing output file.") }
        let components = args[4].split(separator: ",", omittingEmptySubsequences: false)
        let pages = components.compactMap { Int($0) }
        guard pages.count == components.count else { try fail("Invalid page selection.") }
        try source.extract(pages, args[5]); return
    }
    guard let page = Int(args[4]) else { try fail("Invalid page number.") }
    if args[1] == "text" { try json(embeddedText(source, page)); return }
    let bitmap = try source.bitmap(page)
    if args[1] == "scan" { try json(recognize(bitmap, page)); return }
    if args[1] == "preview", args.count == 6 {
        guard let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[5]) as CFURL, "public.png" as CFString, 1, nil) else { try fail("Preview creation failed.") }
        CGImageDestinationAddImage(destination, bitmap, nil)
        guard CGImageDestinationFinalize(destination) else { try fail("Preview creation failed.") }
        return
    }
    try fail("Unsupported operation.")
}

do { try autoreleasepool { try main() } }
catch let error as ScanError {
    FileHandle.standardError.write(Data("PACKING_SCAN_ERROR: \(error.message)\n".utf8)); exit(1)
} catch {
    FileHandle.standardError.write(Data("PACKING_SCAN_ERROR: Local document processing failed.\n".utf8)); exit(1)
}
