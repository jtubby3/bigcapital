import {
  validateScanFile,
  validateGroups,
  validateSelections,
  invoiceFingerprint,
  assertMailSize,
} from './packingSlipValidation';
import { InvoiceCandidate } from './packingSlip.types';
const invoice: InvoiceCandidate = {
  id: 1,
  invoiceNo: '0001',
  customerId: 2,
  customerName: 'Cafe',
  shippingAddress: '12 Main St',
  referenceNo: 'PO-1',
  trackingNo: '',
  shippingDate: '2026-11-16',
  invoiceDate: '2026-11-15',
  eligible: true,
  entries: [{ code: 'C1', name: 'Cups', description: '', quantity: 2 }],
};
describe('packing slip trust boundaries', () => {
  it('validates file bytes instead of trusting extension or MIME', () => {
    expect(validateScanFile(Buffer.from('%PDF-1.7\n'), 'receipt.exe')).toBe(
      'application/pdf',
    );
    expect(() =>
      validateScanFile(Buffer.from('<script>bad</script>'), 'scan.pdf'),
    ).toThrow();
    expect(() =>
      validateScanFile(Buffer.alloc(25 * 1024 * 1024 + 1), 'scan.pdf'),
    ).toThrow();
  });
  it('requires a complete nonoverlapping partition in source page order', () => {
    expect(validateGroups([[1, 2], [3]], 3)).toEqual([[1, 2], [3]]);
    for (const groups of [
      [[1], [1, 2, 3]],
      [[1], [3]],
      [[2, 1], [3]],
      [[0, 1, 2, 3]],
      [],
      [[1.5], [2, 3]],
    ])
      expect(() => validateGroups(groups, 3)).toThrow();
  });
  it('rejects unbounded, duplicate, malformed and unversioned mail selections', () => {
    expect(validateSelections([{ id: 1, version: 2 }])).toEqual([
      { id: 1, version: 2 },
    ]);
    expect(validateSelections([])).toEqual([]);
    for (const value of [
      null,
      {},
      [{ id: 1 }],
      [
        { id: 1, version: 1 },
        { id: 1, version: 2 },
      ],
      [{ id: '1', version: 1 }],
      [{ id: 1, version: -1 }],
    ])
      expect(() => validateSelections(value)).toThrow();
  });
  it('invalidates a confirmation when customer, references, delivery or line quantities change', () => {
    const original = invoiceFingerprint(invoice);
    for (const changed of [
      { customerId: 3 },
      { invoiceNo: '0002' },
      { shippingAddress: 'Elsewhere' },
      { referenceNo: 'Other' },
      { entries: [{ ...invoice.entries[0], quantity: 3 }] },
    ])
      expect(invoiceFingerprint({ ...invoice, ...changed })).not.toBe(original);
    expect(invoiceFingerprint({ ...invoice })).toBe(original);
  });
  it('rejects a combined mail payload even when individual files fit', () => {
    expect(() =>
      assertMailSize([
        Buffer.alloc(10 * 1024 * 1024),
        Buffer.alloc(9 * 1024 * 1024),
      ]),
    ).toThrow();
    expect(() => assertMailSize([Buffer.alloc(1024)])).not.toThrow();
  });
});
