"""Local-only Linux scanner. Requires Poppler utilities and Tesseract English data."""
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import resource
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

MAX_OUTPUT = 16 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
MAX_PIXELS = 40_000_000
TOOLS = ('pdfinfo', 'pdftoppm', 'pdftotext', 'pdfseparate', 'pdfunite', 'tesseract')
DEADLINE = time.monotonic() + 165


class ScanError(Exception):
    pass


def fail(message='Local document processing failed.'):
    raise ScanError(message)


def limits():
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_FILE, MAX_FILE))
    resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run(command, *args):
    executable = shutil.which(command, path='/usr/bin:/bin')
    if not executable:
        fail('Local scanning requires Python 3, Tesseract English data and Poppler tools.')
    remaining = DEADLINE - time.monotonic()
    if remaining <= 0:
        fail('Local document processing timed out.')
    # Files avoid unbounded pipe buffering; child limits also bound generated files.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            result = subprocess.run([executable, *map(str, args)], stdin=subprocess.DEVNULL,
                                    stdout=out, stderr=err, timeout=min(60, remaining),
                                    preexec_fn=limits, env={**os.environ, 'OMP_THREAD_LIMIT': '2', 'LC_ALL': 'C'})
        except subprocess.TimeoutExpired:
            fail('Local document processing timed out.')
        if result.returncode:
            fail()
        if out.tell() > MAX_OUTPUT:
            fail('Local recognition output exceeds the limit.')
        out.seek(0)
        return out.read().decode('utf-8', errors='strict')


def selection(value, page_count):
    parts = value.split(',')
    if (not 1 <= len(parts) <= 200 or any(not re.fullmatch(r'[1-9][0-9]{0,2}', p) for p in parts)):
        fail('Invalid page selection.')
    pages = list(map(int, parts))
    if len(set(pages)) != len(pages) or any(p > page_count or p > 200 for p in pages):
        fail('Requested page is outside the document or duplicated.')
    return pages


def box(text, left, top, width, height, confidence, page_width, page_height):
    values = (left, top, width, height, confidence, page_width, page_height)
    if (not all(math.isfinite(v) for v in values) or page_width <= 0 or page_height <= 0
            or left < 0 or top < 0 or width <= 0 or height <= 0
            or left + width > page_width + .01 or top + height > page_height + .01
            or not 0 <= confidence <= 1 or len(text) > 20000):
        fail('Local scanner returned invalid recognition data.')
    return dict(text=text, x=min(1, left / page_width), y=min(1, top / page_height),
                width=min(1, width / page_width), height=min(1, height / page_height), confidence=confidence)


def merge_words(words, width, height):
    fragments = []
    for word in sorted(words, key=lambda item: item['x']):
        previous = fragments[-1] if fragments else None
        # Keep natural phrases intact; large whitespace remains a table-column boundary.
        if previous and (word['x'] - previous['x'] - previous['width']) * width <= 2 * min(previous['height'], word['height']) * height:
            right = max(previous['x'] + previous['width'], word['x'] + word['width'])
            bottom = max(previous['y'] + previous['height'], word['y'] + word['height'])
            previous['y'] = min(previous['y'], word['y'])
            previous['width'] = right - previous['x']
            previous['height'] = bottom - previous['y']
            previous['text'] += ' ' + word['text']
            previous['confidence'] = min(previous['confidence'], word['confidence'])
            if len(previous['text']) > 20000:
                fail('Local recognition output exceeds the limit.')
        else:
            fragments.append(word)
    return fragments


def parse_tsv(text, width, height):
    try:
        rows = csv.DictReader(io.StringIO(text), delimiter='\t', quoting=csv.QUOTE_NONE)
        required = {'level', 'block_num', 'par_num', 'line_num', 'left', 'top', 'width', 'height', 'conf', 'text'}
        if not rows.fieldnames or not required.issubset(rows.fieldnames):
            fail('Local scanner returned invalid recognition data.')
        groups = {}
        word_count = 0
        for row in rows:
            if None in row or any(v is None for v in row.values()):
                fail('Local scanner returned invalid recognition data.')
            if row['level'] != '5':
                continue
            word = row['text'].strip()
            if not word:
                continue
            key = tuple(row[k] for k in ('block_num', 'par_num', 'line_num'))
            groups.setdefault(key, []).append(box(word, *[float(row[k]) for k in ('left', 'top', 'width', 'height')],
                                                  float(row['conf']) / 100, width, height))
            word_count += 1
            if word_count > 20000:
                fail('Local recognition output exceeds the limit.')
        return [fragment for group in groups.values() for fragment in merge_words(group, width, height)]
    except (ValueError, KeyError, csv.Error, OverflowError):
        fail('Local scanner returned invalid recognition data.')


def parse_text(text):
    try:
        root = ET.fromstring(text)
        pages = [node for node in root.iter() if node.tag.split('}')[-1] == 'page']
        if len(pages) != 1:
            fail('Local scanner returned invalid text data.')
        page = pages[0]
        width, height = float(page.attrib['width']), float(page.attrib['height'])
        if not all(math.isfinite(v) and v > 0 for v in (width, height)):
            fail('Local scanner returned invalid text data.')
        lines = []
        for row in page.iter():
            if row.tag.split('}')[-1] != 'line':
                continue
            words = []
            for word in row.iter():
                if word.tag.split('}')[-1] != 'word':
                    continue
                value = ''.join(word.itertext()).strip()
                if not value:
                    continue
                x, y, right, bottom = [float(word.attrib[k]) for k in ('xMin', 'yMin', 'xMax', 'yMax')]
                words.append(box(value, x, y, right - x, bottom - y, 1, width, height))
                if len(words) > 20000:
                    fail('Local recognition output exceeds the limit.')
            lines.extend(merge_words(words, width, height))
            if len(lines) > 20000:
                fail('Local recognition output exceeds the limit.')
        return lines
    except (ET.ParseError, ValueError, KeyError, OverflowError):
        fail('Local scanner returned invalid text data.')


def image_dimensions(path, mime):
    with open(path, 'rb') as source:
        if mime == 'image/png':
            header = source.read(29)
            if len(header) != 29 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
                fail('Invalid image data.')
            width, height = struct.unpack('>II', header[16:24])
        elif mime == 'image/jpeg':
            if source.read(2) != b'\xff\xd8':
                fail('Invalid image data.')
            width = height = 0
            # Read JPEG markers before handing compressed data to a decoder.
            while source.tell() < 25 * 1024 * 1024:
                if source.read(1) != b'\xff':
                    fail('Invalid image data.')
                marker = source.read(1)
                while marker == b'\xff':
                    marker = source.read(1)
                if not marker or marker in (b'\xda', b'\xd9'):
                    break
                if marker == b'\x01' or 0xd0 <= marker[0] <= 0xd7:
                    continue
                length = source.read(2)
                if len(length) != 2:
                    fail('Invalid image data.')
                size = struct.unpack('>H', length)[0]
                if size < 2:
                    fail('Invalid image data.')
                if marker[0] in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                    frame = source.read(5)
                    if len(frame) != 5:
                        fail('Invalid image data.')
                    height, width = struct.unpack('>HH', frame[1:])
                    break
                source.seek(size - 2, 1)
        else:
            fail('Unsupported image type.')
    if width <= 0 or height <= 0:
        fail('Invalid image dimensions.')
    if width > MAX_PIXELS // height:
        fail('Image exceeds 40 million decoded pixels.')
    return width, height


def pdf_count(path):
    info = run('pdfinfo', path)
    if re.search(r'^Encrypted:\s+yes', info, re.M):
        fail('Encrypted or locked PDFs are not supported.')
    pages = re.search(r'^Pages:\s+([0-9]+)\s*$', info, re.M)
    if not pages or not 1 <= int(pages[1]) <= 200:
        fail('PDF must contain between 1 and 200 pages.')
    return int(pages[1])


def render(path, page, directory):
    prefix = Path(directory, 'rendered')
    run('pdftoppm', '-f', page, '-l', page, '-singlefile', '-scale-to', '2800', '-png', path, prefix)
    image = prefix.with_suffix('.png')
    image_dimensions(image, 'image/png')
    return image


def check_output(path):
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_FILE:
        fail('Generated document exceeds the output limit.')


def main(args):
    if args == ['health']:
        for command in TOOLS:
            if not shutil.which(command, path='/usr/bin:/bin'):
                fail('Local scanning requires Python 3, Tesseract English data and Poppler tools.')
        if 'eng' not in run('tesseract', '--list-langs').splitlines():
            fail('Local scanning requires Tesseract English data.')
        return {'available': True}
    if len(args) < 3 or args[0] not in ('info', 'scan', 'text', 'extract', 'preview'):
        fail('Unsupported operation or missing document arguments.')
    operation, filename, mime = args[:3]
    path = Path(filename).resolve(strict=True)
    if not path.is_file() or not 0 < path.stat().st_size <= 25 * 1024 * 1024:
        fail('Document must be between 1 byte and 25 MiB.')
    is_pdf = mime == 'application/pdf'
    dimensions = None if is_pdf else image_dimensions(path, mime)
    count = pdf_count(path) if is_pdf else 1
    if operation == 'info' and len(args) == 3:
        return {'pageCount': count}
    if len(args) != (5 if operation in ('extract', 'preview') else 4):
        fail('Missing page selection or output file.')
    pages = selection(args[3], count)
    if operation != 'extract' and len(pages) != 1:
        fail('Invalid page number.')
    page = pages[0]
    with tempfile.TemporaryDirectory(prefix='bigcapital-packing-linux-') as directory:
        if operation == 'text':
            return {'page': page, 'lines': parse_text(run('pdftotext', '-f', page, '-l', page, '-bbox-layout', path, '-')) if is_pdf else []}
        if operation == 'scan':
            image = render(path, page, directory) if is_pdf else path
            width, height = image_dimensions(image, 'image/png') if is_pdf else dimensions
            return {'page': page, 'lines': parse_tsv(run('tesseract', image, 'stdout', '-l', 'eng', 'tsv'), width, height)}
        output = Path(args[4]).resolve()
        if operation == 'extract' and is_pdf:
            selected = []
            selected_bytes = 0
            for index, number in enumerate(pages):
                prefix = Path(directory, f'selected-{index}-%d.pdf')
                run('pdfseparate', '-f', number, '-l', number, path, prefix)
                selected.append(Path(directory, f'selected-{index}-{number}.pdf'))
                check_output(selected[-1])
                selected_bytes += selected[-1].stat().st_size
                if selected_bytes > MAX_FILE:
                    fail('Generated document exceeds the output limit.')
            run('pdfunite', *selected, output)
        else:
            document = path
            if not is_pdf:
                prefix = Path(directory, 'wrapped')
                run('tesseract', path, prefix, '-l', 'eng', 'pdf')
                document = prefix.with_suffix('.pdf')
                check_output(document)
            if operation == 'extract':
                shutil.copyfile(document, output)
            else:
                shutil.copyfile(render(document, page, directory), output)
        check_output(output)
    return None


if __name__ == '__main__':
    os.umask(0o077)
    try:
        result = main(sys.argv[1:])
        if result is not None:
            encoded = json.dumps(result, ensure_ascii=False)
            if len(encoded.encode('utf-8')) > MAX_OUTPUT:
                fail('Local recognition output exceeds the limit.')
            print(encoded)
    except ScanError as error:
        print('PACKING_SCAN_ERROR: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('PACKING_SCAN_ERROR: Local document processing failed.', file=sys.stderr)
        sys.exit(1)
