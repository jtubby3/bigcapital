import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InvoiceCandidate, PackingSlipSelection } from './packingSlip.types';
export const MAX_SCAN_BYTES = 25 * 1024 * 1024;
export const MAX_MAIL_BYTES = 18 * 1024 * 1024;
export function validateScanFile(bytes: Buffer, name: string): string {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > MAX_SCAN_BYTES ||
    typeof name !== 'string' ||
    name.length > 255
  )
    throw new BadRequestException('Choose a PDF, PNG or JPEG up to 25 MiB.');
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  throw new BadRequestException('File contents must be PDF, PNG or JPEG.');
}
export function validateGroups(value: unknown, pageCount: number): number[][] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 200 ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > 200
  )
    throw new BadRequestException('Group every source page exactly once.');
  const seen = new Set<number>();
  for (const group of value) {
    if (!Array.isArray(group) || !group.length)
      throw new BadRequestException('Empty page groups are not allowed.');
    let previous = 0;
    for (const page of group) {
      if (
        !Number.isInteger(page) ||
        page <= previous ||
        page > pageCount ||
        seen.has(page)
      )
        throw new BadRequestException(
          'Groups must contain every page once, in source order.',
        );
      seen.add(page);
      previous = page;
    }
  }
  if (seen.size !== pageCount)
    throw new BadRequestException('A source page is missing from the groups.');
  return value.map((group) => [...group]);
}
export function validateSelections(
  value: unknown,
  max = 40,
): PackingSlipSelection[] {
  if (!Array.isArray(value) || value.length > max)
    throw new BadRequestException(`Select at most ${max} packing slips.`);
  const seen = new Set<number>();
  for (const row of value) {
    if (
      !row ||
      !Number.isSafeInteger(row.id) ||
      row.id < 1 ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1 ||
      seen.has(row.id)
    )
      throw new BadRequestException(
        'Each packing slip needs a unique id and current version.',
      );
    seen.add(row.id);
  }
  return value.map(({ id, version }) => ({ id, version }));
}
export function invoiceFingerprint(invoice: InvoiceCandidate): string {
  return createHash('sha256').update(JSON.stringify(invoice)).digest('hex');
}
export function assertMailSize(buffers: Buffer[]): void {
  if (buffers.reduce((sum, b) => sum + b.length, 0) > MAX_MAIL_BYTES)
    throw new BadRequestException(
      'Invoice and packing slips exceed the 18 MiB email limit. Deselect slips or send them separately.',
    );
}
export function requireVersion(actual: number, expected: unknown): void {
  if (!Number.isSafeInteger(expected) || actual !== expected)
    throw new ConflictException(
      'This packing slip changed. Refresh before continuing.',
    );
}
