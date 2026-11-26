import Foundation
import AppKit
import PDFKit
import ImageIO

let out = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
let size = CGSize(width: 612, height: 792)
func draw(_ text: String, at point: CGPoint, size: CGFloat = 24) {
    (text as NSString).draw(at: point, withAttributes: [.font: NSFont.systemFont(ofSize: size), .foregroundColor: NSColor.black])
}
func raster() -> NSImage {
    let image = NSImage(size: size)
    image.lockFocus()
    NSColor.white.setFill(); NSRect(origin: .zero, size: size).fill()
    draw("PACKING SLIP", at: CGPoint(x: 40, y: 710))
    draw("Invoice INV-2002", at: CGPoint(x: 40, y: 660))
    draw("BETA CUSTOMER", at: CGPoint(x: 40, y: 610))
    draw("SKU-BETA", at: CGPoint(x: 40, y: 500), size: 19)
    draw("12", at: CGPoint(x: 480, y: 500), size: 19)
    image.unlockFocus()
    return image
}
let image = raster()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("scan.png"))
try bitmap.representation(using: .jpeg, properties: [:])!.write(to: out.appendingPathComponent("scan.jpg"))
let oversized = CGContext(data: nil, width: 6400, height: 6400, bitsPerComponent: 8,
                          bytesPerRow: 6400, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0)!
let oversizedURL = out.appendingPathComponent("oversize.png")
let pngDestination = CGImageDestinationCreateWithURL(oversizedURL as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(pngDestination, oversized.makeImage()!, nil)
precondition(CGImageDestinationFinalize(pngDestination))
let mutable = NSMutableData()
var mediaBox = CGRect(origin: .zero, size: size)
let ctx = CGContext(consumer: CGDataConsumer(data: mutable)!, mediaBox: &mediaBox, nil)!
for n in 1...3 {
    ctx.beginPDFPage(nil)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    if n == 2 { image.draw(in: CGRect(origin: .zero, size: size)) }
    else {
        draw("PACKING SLIP", at: CGPoint(x: 40, y: 710))
        draw(n == 1 ? "Invoice INV-1001" : "Invoice INV-3003", at: CGPoint(x: 40, y: 660))
        draw(n == 1 ? "ALPHA CUSTOMER" : "GAMMA CUSTOMER", at: CGPoint(x: 40, y: 610))
    }
    // Original vector handwriting must survive extraction, rather than an OCR reconstruction.
    ctx.setStrokeColor(NSColor.blue.cgColor); ctx.setLineWidth(4)
    ctx.move(to: CGPoint(x: 50, y: 100)); ctx.addCurve(to: CGPoint(x: 270, y: 100), control1: CGPoint(x: 100, y: 180), control2: CGPoint(x: 160, y: 40)); ctx.strokePath()
    NSGraphicsContext.restoreGraphicsState(); ctx.endPDFPage()
}
ctx.closePDF()
try mutable.write(to: out.appendingPathComponent("mixed.pdf"))
let doc = PDFDocument(data: mutable as Data)!
precondition(doc.write(to: out.appendingPathComponent("encrypted.pdf"), withOptions: [.userPasswordOption: "secret", .ownerPasswordOption: "owner"]))
let many = PDFDocument()
for i in 0..<201 { many.insert(doc.page(at: 0)!.copy() as! PDFPage, at: i) }
precondition(many.write(to: out.appendingPathComponent("201-pages.pdf")))
