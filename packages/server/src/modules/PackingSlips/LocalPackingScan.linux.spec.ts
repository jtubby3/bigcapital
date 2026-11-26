import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalPackingScan } from './LocalPackingScan';

describe('LocalPackingScan Linux interpreter', () => {
  let dir: string;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'packing-linux-test-'));
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', platform);
    await rm(dir, { recursive: true, force: true });
  });

  it('executes a non-executable Python helper and reports Linux availability', async () => {
    const helper = join(dir, 'scanner.py');
    await writeFile(
      helper,
      'import json\nprint(json.dumps({"available": True}))\n',
      { mode: 0o600 },
    );
    const scanner = new LocalPackingScan();
    jest.spyOn(scanner as any, 'helper').mockResolvedValue(helper);
    expect(await scanner.health()).toEqual({
      available: true,
      message: expect.stringMatching(/Tesseract.*Poppler/),
    });
  });

  it('reports missing Linux tools without exposing helper paths', async () => {
    const scanner = new LocalPackingScan();
    jest
      .spyOn(scanner as any, 'helper')
      .mockResolvedValue(join(dir, 'customer-secret.py'));
    const health = await scanner.health();
    expect(health.available).toBe(false);
    expect(health.message).toMatch(/Python 3.*Tesseract.*Poppler/);
    expect(health.message).not.toContain(dir);
  });
});
