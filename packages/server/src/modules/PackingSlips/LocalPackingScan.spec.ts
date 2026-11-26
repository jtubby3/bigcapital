import { execFileSync } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { compilePackingScanSwift, LocalPackingScan } from './LocalPackingScan';

const fixturesSource = join(__dirname, 'LocalPackingScan.fixture.swift');
const nativeTests = process.platform === 'darwin' ? describe : describe.skip;
const coldStartTimeout = 11 * 60 * 1000;

nativeTests('LocalPackingScan native integration', () => {
  let dir: string;
  let scan: LocalPackingScan;
  const input = (name: string) => readFile(join(dir, name));
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'packing-fixtures-'));
    const fixture = await compilePackingScanSwift(
      await readFile(fixturesSource),
    );
    execFileSync(fixture, [dir], { timeout: 30000 });
    scan = new LocalPackingScan();
  }, coldStartTimeout);
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it(
    'reports an available compiled native helper',
    async () => {
      expect(await scan.health()).toEqual({
        available: true,
        message: expect.any(String),
      });
    },
    coldStartTimeout,
  );
  it('recognizes every mixed PDF page and preserves normalized row/column coordinates', async () => {
    const pages = await scan.scan(await input('mixed.pdf'), 'application/pdf');
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages.map((p) => p.textLines)).toEqual([undefined, undefined, undefined]);
    for (const [i, invoice] of ['1001', '2002', '3003'].entries()) {
      expect(pages[i].lines.map((l) => l.text).join(' ')).toContain(invoice);
      for (const line of pages[i].lines) {
        for (const key of ['x', 'y', 'width', 'height', 'confidence']) {
          expect(line[key]).toBeGreaterThanOrEqual(0);
          expect(line[key]).toBeLessThanOrEqual(1);
        }
      }
    }
    const lines = pages[1].lines;
    const title = lines.find((line) => line.text.includes('PACKING SLIP'));
    const invoice = lines.find((line) => line.text.includes('2002'));
    const sku = lines.find((line) => line.text.includes('SKU-BETA'));
    const quantity = lines.find((line) => line.text === '12');
    expect(title.y).toBeLessThan(invoice.y);
    expect(invoice.y).toBeLessThan(sku.y);
    expect(sku.x).toBeLessThan(quantity.x);
    expect(lines.indexOf(sku)).toBeLessThan(lines.indexOf(quantity));
  }, 180000);
  it('provides optional PDF text while retaining OCR for image pages', async () => {
    const pages = await scan.scan(await input('mixed.pdf'), 'application/pdf', {
      preferTextLayer: true,
    });
    expect(pages[0].textLines?.map((line) => line.text).join(' ')).toContain('1001');
    expect(pages[1].textLines).toBeUndefined();
    expect(pages[1].lines.map((line) => line.text).join(' ')).toContain('2002');
  }, 180000);
  it('extracts only selected original PDF pages and retains drawn signature pixels', async () => {
    const pdf = await input('mixed.pdf');
    const extracted = await scan.extract(pdf, 'application/pdf', [2]);
    const pages = await scan.scan(extracted, 'application/pdf');
    expect(pages).toHaveLength(1);
    const text = pages[0].lines.map((l) => l.text).join(' ');
    expect(text).toContain('2002');
    expect(text).not.toContain('1001');
    expect(text).not.toContain('3003');
    const original = await scan.preview(pdf, 'application/pdf', 2);
    const selected = await scan.preview(extracted, 'application/pdf', 1);
    expect(selected).toEqual(original);
    const reordered = await scan.extract(pdf, 'application/pdf', [3, 1]);
    expect(await scan.preview(reordered, 'application/pdf', 1)).toEqual(
      await scan.preview(pdf, 'application/pdf', 3),
    );
    expect(await scan.preview(reordered, 'application/pdf', 2)).toEqual(
      await scan.preview(pdf, 'application/pdf', 1),
    );
    await expect(scan.preview(reordered, 'application/pdf', 3)).rejects.toThrow(
      /page/i,
    );
    if (process.env.PACKING_SCAN_TEST_PREVIEW) {
      await writeFile(process.env.PACKING_SCAN_TEST_PREVIEW, selected);
    }
  }, 180000);
  it.each(['scan.png', 'scan.jpg'])(
    'recognizes and wraps image %s into a previewable PDF',
    async (name) => {
      const image = await input(name);
      const mime = name.endsWith('png') ? 'image/png' : 'image/jpeg';
      expect(
        (await scan.scan(image, mime))[0].lines.map((l) => l.text).join(' '),
      ).toContain('2002');
      const wrapped = await scan.extract(image, mime, [1]);
      expect(wrapped.subarray(0, 5).toString()).toBe('%PDF-');
      expect(
        (await scan.preview(wrapped, 'application/pdf', 1))
          .subarray(0, 8)
          .toString('hex'),
      ).toBe('89504e470d0a1a0a');
    },
    180000,
  );
  it('rejects malformed, encrypted and over-limit documents', async () => {
    await expect(
      scan.scan(Buffer.from('%PDF-broken'), 'application/pdf'),
    ).rejects.toThrow();
    await expect(
      scan.scan(await input('encrypted.pdf'), 'application/pdf'),
    ).rejects.toThrow(/encrypted|locked/i);
    await expect(
      scan.scan(await input('201-pages.pdf'), 'application/pdf'),
    ).rejects.toThrow(/200/);
    await expect(
      scan.scan(await input('oversize.png'), 'image/png'),
    ).rejects.toThrow(/40|pixel/i);
    await expect(
      scan.scan(Buffer.alloc(25 * 1024 * 1024 + 1), 'image/png'),
    ).rejects.toThrow(/25/);
    await expect(
      scan.scan(await input('scan.png'), 'application/pdf'),
    ).rejects.toThrow(/signature|type/i);
    await expect(
      scan.scan(await input('scan.png'), 'image/gif'),
    ).rejects.toThrow(/type|supported/i);
  }, 180000);
  it('rejects empty, duplicate, fractional and out-of-range page assignments', async () => {
    const pdf = await input('mixed.pdf');
    for (const pages of [[], [0], [4], [1, 1], [1.5], [NaN]]) {
      await expect(scan.extract(pdf, 'application/pdf', pages)).rejects.toThrow(
        /page/i,
      );
    }
    await expect(scan.preview(pdf, 'application/pdf', 4)).rejects.toThrow(
      /page/i,
    );
    await expect(
      scan.extract(await input('scan.png'), 'image/png', [2]),
    ).rejects.toThrow(/page/i);
  }, 180000);
});

it('validates MIME before executing native code', async () => {
  await expect(
    new LocalPackingScan().scan(Buffer.from('not a document'), 'text/plain'),
  ).rejects.toThrow(/supported|type/i);
});
