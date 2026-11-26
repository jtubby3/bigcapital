import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

HELPER = pathlib.Path(__file__).with_name('packing_scan_linux.py')
TSV_HEADER = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'


class ParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not HELPER.is_file():
            raise AssertionError('Linux scanner helper is missing')
        spec = importlib.util.spec_from_file_location('packing_scan_linux', HELPER)
        cls.scan = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.scan)

    def test_tsv_preserves_word_columns_and_normalizes_top_left_boxes(self):
        rows = ('5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t95\tSKU-BETA\n'
                '5\t1\t1\t1\t1\t2\t80\t20\t10\t10\t80\t12\n')
        self.assertEqual(self.scan.parse_tsv(TSV_HEADER + rows, 100, 200), [
            {'text': 'SKU-BETA', 'x': .1, 'y': .1, 'width': .3, 'height': .05, 'confidence': .95},
            {'text': '12', 'x': .8, 'y': .1, 'width': .1, 'height': .05, 'confidence': .8},
        ])

    def test_tsv_keeps_multiword_labels_together_for_existing_matcher(self):
        rows = ('5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t96\tPACKING\n'
                '5\t1\t1\t1\t1\t2\t45\t20\t20\t10\t94\tSLIP\n')
        fragments = self.scan.parse_tsv(TSV_HEADER + rows, 100, 200)
        self.assertEqual(len(fragments), 1)
        self.assertEqual(fragments[0]['text'], 'PACKING SLIP')
        for field, expected in [('x', .1), ('y', .1), ('width', .55), ('height', .05), ('confidence', .94)]:
            self.assertAlmostEqual(fragments[0][field], expected)

    def test_tsv_rejects_malformed_or_out_of_bounds_data(self):
        for row in ['broken', '5\t1\t1\t1\t1\t1\t0\t0\t1\t1\tnan\tsecret',
                    '5\t1\t1\t1\t1\t1\t-1\t0\t1\t1\t90\tsecret',
                    '5\t1\t1\t1\t1\t1\t99\t0\t2\t1\t90\tsecret']:
            with self.subTest(row=row), self.assertRaises(self.scan.ScanError):
                self.scan.parse_tsv(TSV_HEADER + row, 100, 200)
        with self.assertRaises(self.scan.ScanError):
            self.scan.parse_tsv(TSV_HEADER + '5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t90\t' + 'x' * 20001, 100, 200)

    def test_embedded_text_reads_word_boxes_and_rejects_nonfinite_dimensions(self):
        xml = '<html><body><doc><page width="100" height="200"><flow><block><line><word xMin="10" yMin="20" xMax="40" yMax="30">Invoice &amp; 1001</word></line></block></flow></page></doc></body></html>'
        self.assertEqual(self.scan.parse_text(xml), [
            {'text': 'Invoice & 1001', 'x': .1, 'y': .1, 'width': .3, 'height': .05, 'confidence': 1},
        ])
        for bad in [xml.replace('width="100"', 'width="nan"'), xml.replace('xMax="40"', 'xMax="1000"'), '<broken', '<html/>']:
            with self.subTest(bad=bad), self.assertRaises(self.scan.ScanError):
                self.scan.parse_text(bad)

    def test_page_selection_rejects_duplicates_bad_numbers_and_document_overflow(self):
        self.assertEqual(self.scan.selection('3,1', 3), [3, 1])
        for pages in ['', '0', '4', '1,1', '1.5', 'NaN', '1,', '-1', ' 1', '201']:
            with self.subTest(pages=pages), self.assertRaises(self.scan.ScanError):
                self.scan.selection(pages, 3)

    def test_image_dimensions_reject_decompression_bombs_before_decoding(self):
        import struct
        png = b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', 100000, 100000) + b'\x08\x02\x00\x00\x00'
        with tempfile.TemporaryDirectory() as directory:
            image = pathlib.Path(directory, 'input.png')
            image.write_bytes(png)
            with self.assertRaisesRegex(self.scan.ScanError, '40 million'):
                self.scan.image_dimensions(image, 'image/png')


def pdf_fixture():
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    for invoice in ['1001', '2002', '3003']:
        content = ('BT /F1 28 Tf 50 700 Td (PACKING SLIP) Tj 0 -60 Td (Invoice ' + invoice + ') Tj 0 -60 Td (SKU-BETA    12) Tj ET').encode()
        stream = len(objects) + 2
        objects.extend([f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream} 0 R >>'.encode(),
                        b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream'])
    data = b'%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += str(i).encode() + b' 0 obj\n' + obj + b'\nendobj\n'
    xref = len(data)
    data += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    data += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])
    return data + f'trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


@unittest.skipUnless(sys.platform == 'linux' and all(shutil.which(c) for c in ['pdfinfo', 'pdftoppm', 'pdftotext', 'pdfseparate', 'pdfunite', 'tesseract']), 'Linux OCR tools required')
class LinuxSmokeTests(unittest.TestCase):
    def test_real_commands_scan_select_preview_and_wrap_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            pdf = root / 'source.pdf'
            pdf.write_bytes(pdf_fixture())

            def run(op, source=pdf, mime='application/pdf', *args):
                return subprocess.check_output([sys.executable, str(HELPER), op, str(source), mime, *map(str, args)], timeout=180)

            subprocess.check_call([sys.executable, str(HELPER), 'health'])
            self.assertEqual(json.loads(run('info'))['pageCount'], 3)
            recognized = json.loads(run('scan', pdf, 'application/pdf', 2))
            self.assertIn('2002', ' '.join(line['text'] for line in recognized['lines']))
            self.assertIn('2002', ' '.join(line['text'] for line in json.loads(run('text', pdf, 'application/pdf', 2))['lines']))
            selected = root / 'selected.pdf'
            run('extract', pdf, 'application/pdf', '3,1', selected)
            self.assertEqual(json.loads(run('info', selected))['pageCount'], 2)
            self.assertIn('3003', ' '.join(line['text'] for line in json.loads(run('text', selected, 'application/pdf', 1))['lines']))
            for extension, option, mime in [('png', '-png', 'image/png'), ('jpg', '-jpeg', 'image/jpeg')]:
                prefix = root / ('image-' + extension)
                subprocess.check_call(['pdftoppm', '-f', '2', '-l', '2', '-singlefile', '-scale-to', '1600', option, str(pdf), str(prefix)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                image = prefix.with_suffix('.' + extension)
                self.assertEqual(json.loads(run('info', image, mime))['pageCount'], 1)
                self.assertIn('2002', ' '.join(line['text'] for line in json.loads(run('scan', image, mime, 1))['lines']))
                wrapped = root / ('wrapped-' + extension + '.pdf')
                run('extract', image, mime, 1, wrapped)
                preview = root / ('preview-' + extension + '.png')
                run('preview', wrapped, 'application/pdf', 1, preview)
                self.assertTrue(preview.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
            failed = subprocess.run([sys.executable, str(HELPER), 'scan', '/private/customer-secret', 'application/pdf', '1'], capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertNotIn(b'customer-secret', failed.stderr)
            self.assertTrue(failed.stderr.startswith(b'PACKING_SCAN_ERROR: '))


if __name__ == '__main__':
    unittest.main()
