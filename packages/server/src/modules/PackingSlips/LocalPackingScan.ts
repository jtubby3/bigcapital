import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import { constants } from 'fs';
import { tmpdir, release } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { ScanPage } from './packingSlip.types';

const MAX_BYTES = 25 * 1024 * 1024;
const CALL_MS = 180000;
const FILE_MS = 18 * 60 * 1000;
const COMPILE_MS = 10 * 60 * 1000;
const exec = promisify(execFile);
type PageWithText = ScanPage & { textLines?: ScanPage['lines'] };

function readScanPage(stdout: string, page: number): ScanPage {
  const result = JSON.parse(stdout);
  if (
    result.page !== page ||
    !Array.isArray(result.lines) ||
    result.lines.length > 20000 ||
    result.lines.some(
      (line) =>
        typeof line.text !== 'string' ||
        line.text.length > 20000 ||
        ['x', 'y', 'width', 'height', 'confidence'].some(
          (key) =>
            !Number.isFinite(line[key]) || line[key] < 0 || line[key] > 1,
        ),
    )
  ) {
    throw new Error('Local scanner returned invalid recognition data.');
  }
  return result;
}

export async function compilePackingScanSwift(source: Buffer): Promise<string> {
  const uid = process.getuid();
  const cache = join(tmpdir(), `bigcapital-packing-cache-${uid}`);
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const info = await lstat(cache);
  if (!info.isDirectory() || info.uid !== uid || info.mode & 0o077) {
    throw new Error('Unsafe scanner cache directory.');
  }
  const hash = createHash('sha256')
    .update(source)
    .update(process.arch + release())
    .digest('hex');
  const binary = join(cache, hash);
  try {
    await access(binary, constants.X_OK);
    return binary;
  } catch {
    /* Compile to a private staging path. */
  }

  const staging = await mkdtemp(join(cache, 'compile-'));
  try {
    const sourcePath = join(staging, 'PackingScan.swift');
    const built = join(staging, 'PackingScan');
    const compiler = (
      await exec('/usr/bin/xcrun', ['--find', 'swiftc'], { timeout: CALL_MS })
    ).stdout.trim();
    const headers = resolve(compiler, '../../include/swift');
    const oldMap = join(headers, 'module.modulemap');
    const newMap = join(headers, 'bridging.modulemap');
    const moduleDeclaration = /module SwiftBridging\s*\{[\s\S]*?\}/;
    const declarations = await Promise.all(
      [oldMap, newMap].map(async (file) => {
        const text = await readFile(file, 'utf8').catch(() => '');
        return text.match(moduleDeclaration)?.[0];
      }),
    );
    const args = ['-O', '-module-cache-path', join(cache, 'modules')];
    if (declarations[0] && declarations[0] === declarations[1]) {
      // Upgraded Command Line Tools can contain duplicate maps for the same SwiftBridging header.
      const empty = join(cache, 'empty.modulemap');
      const overlay = join(cache, 'swift-bridging-overlay.json');
      const stagedOverlay = join(staging, 'overlay.json');
      await writeFile(empty, '', { mode: 0o600 });
      await writeFile(
        stagedOverlay,
        JSON.stringify({
          version: 0,
          roots: [{ name: oldMap, type: 'file', 'external-contents': empty }],
        }),
        { mode: 0o600 },
      );
      await rename(stagedOverlay, overlay);
      args.push(
        '-vfsoverlay',
        overlay,
        '-Xcc',
        '-ivfsoverlay',
        '-Xcc',
        overlay,
      );
    }
    await writeFile(sourcePath, source, { mode: 0o600 });
    await exec('/usr/bin/swiftc', [...args, sourcePath, '-o', built], {
      timeout: COMPILE_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    await chmod(built, 0o700);
    await rename(built, binary);
    return binary;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

@Injectable()
export class LocalPackingScan {
  private compiling?: Promise<string>;

  async health(): Promise<{ available: boolean; message: string }> {
    try {
      const binary = await this.helper();
      await this.run(binary, ['health']);
      return {
        available: true,
        message:
          process.platform === 'linux'
            ? 'Local Tesseract/Poppler is available.'
            : 'Local Apple Vision/PDFKit is available.',
      };
    } catch {
      return {
        available: false,
        message:
          process.platform === 'linux'
            ? 'Local scanning requires Python 3, Tesseract English data and Poppler tools.'
            : 'Local scanning requires macOS and the Swift command line tools.',
      };
    }
  }

  async scan(
    input: Buffer,
    mime: string,
    options: { preferTextLayer?: boolean } = {},
  ): Promise<PageWithText[]> {
    const deadline = Date.now() + FILE_MS;
    return this.withInput(input, mime, async (binary, file) => {
      // One bounded native call per page keeps a 200-page source from exceeding a single call's budget.
      const meta = JSON.parse(await this.run(binary, ['info', file, mime]));
      if (
        !Number.isInteger(meta.pageCount) ||
        meta.pageCount < 1 ||
        meta.pageCount > 200
      )
        throw new Error('Invalid page count (maximum 200).');
      const pages: PageWithText[] = [];
      for (let page = 1; page <= meta.pageCount; page++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error('Local scanning exceeded the 18-minute file limit.');
        const result: PageWithText = readScanPage(
          await this.run(
            binary,
            ['scan', file, mime, String(page)],
            Math.min(CALL_MS, remaining),
          ),
          page,
        );
        const textBudget = Math.min(10000, deadline - Date.now());
        if (
          options.preferTextLayer &&
          mime === 'application/pdf' &&
          textBudget > 0
        ) {
          const textPage = await this.run(
            binary,
            ['text', file, mime, String(page)],
            textBudget,
          )
            .then((stdout) => readScanPage(stdout, page))
            .catch(() => undefined);
          if (textPage?.lines.length) result.textLines = textPage.lines;
        }
        pages.push(result);
      }
      return pages;
    });
  }

  async extract(input: Buffer, mime: string, pages: number[]): Promise<Buffer> {
    this.validatePages(pages);
    return this.withInput(input, mime, (binary, file, dir) =>
      this.output(
        binary,
        ['extract', file, mime, pages.join(',')],
        dir,
        'selected.pdf',
      ),
    );
  }

  async preview(input: Buffer, mime: string, page: number): Promise<Buffer> {
    this.validatePages([page]);
    return this.withInput(input, mime, (binary, file, dir) =>
      this.output(
        binary,
        ['preview', file, mime, String(page)],
        dir,
        'preview.png',
      ),
    );
  }

  private validatePages(pages: number[]) {
    if (
      !Array.isArray(pages) ||
      !pages.length ||
      pages.length > 200 ||
      new Set(pages).size !== pages.length ||
      pages.some((page) => !Number.isInteger(page) || page < 1 || page > 200)
    ) {
      throw new Error(
        'Pages must be unique whole page numbers between 1 and 200.',
      );
    }
  }

  private validateInput(input: Buffer, mime: string) {
    if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES)
      throw new Error('Document must be between 1 byte and 25 MiB.');
    const valid =
      mime === 'application/pdf'
        ? input.subarray(0, 5).toString() === '%PDF-'
        : mime === 'image/png'
          ? input.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
          : mime === 'image/jpeg'
            ? input.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : false;
    if (!valid)
      throw new Error(
        'Unsupported document type or mismatched content signature.',
      );
  }

  private async withInput<T>(
    input: Buffer,
    mime: string,
    task: (binary: string, file: string, dir: string) => Promise<T>,
  ): Promise<T> {
    this.validateInput(input, mime);
    const binary = await this.helper();
    const dir = await mkdtemp(join(tmpdir(), 'bigcapital-packing-input-'));
    try {
      const file = join(dir, 'input');
      await writeFile(file, input, { mode: 0o600 });
      return await task(binary, file, dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async output(
    binary: string,
    args: string[],
    dir: string,
    name: string,
  ) {
    const output = join(dir, name);
    await this.run(binary, [...args, output]);
    const info = await stat(output);
    if (!info.isFile() || !info.size || info.size > 64 * 1024 * 1024)
      throw new Error('Generated document exceeds the output limit.');
    return readFile(output);
  }

  private run(
    binary: string,
    args: string[],
    timeout = CALL_MS,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        process.platform === 'linux' ? '/usr/bin/python3' : binary,
        process.platform === 'linux' ? [binary, ...args] : args,
        {
          timeout,
          maxBuffer: 16 * 1024 * 1024,
          encoding: 'utf8',
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout);
          // Native errors are a fixed allowlisted message, never document text, metadata or filesystem paths.
          const safe = stderr
            .trim()
            .match(/^PACKING_SCAN_ERROR: ([a-zA-Z0-9 .,-]+)$/m);
          reject(
            new Error(
              safe ? safe[1] : 'Local document processing failed or timed out.',
            ),
          );
        },
      );
    });
  }

  private async helper(): Promise<string> {
    if (process.platform === 'linux') {
      const relative = 'modules/PackingSlips/native/packing_scan_linux.py';
      for (const location of [
        join(__dirname, 'native/packing_scan_linux.py'),
        resolve(process.cwd(), 'src', relative),
        resolve(process.cwd(), 'packages/server/src', relative),
      ]) {
        try {
          await access(location, constants.R_OK);
          return location;
        } catch {
          /* Try the source layout when running built JavaScript. */
        }
      }
      throw new Error('Local scanner source is unavailable.');
    }
    if (process.platform !== 'darwin')
      throw new Error('Local scanning requires macOS or Linux.');
    if (!this.compiling)
      this.compiling = this.compile().catch((error) => {
        this.compiling = undefined;
        throw error;
      });
    return this.compiling;
  }

  private async compile() {
    const locations = [
      join(__dirname, 'native/PackingScan.swift'),
      resolve(
        process.cwd(),
        'src/modules/PackingSlips/native/PackingScan.swift',
      ),
      resolve(
        process.cwd(),
        'packages/server/src/modules/PackingSlips/native/PackingScan.swift',
      ),
    ];
    let source: Buffer;
    for (const location of locations) {
      try {
        source = await readFile(location);
        break;
      } catch {
        /* Try the source layout when running built JavaScript. */
      }
    }
    if (!source) throw new Error('Local scanner source is unavailable.');
    return compilePackingScanSwift(source);
  }
}
