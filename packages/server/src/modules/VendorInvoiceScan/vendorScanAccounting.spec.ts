import { reconcileInvoice } from './vendorScanAccounting';
import { Review } from './vendorScanTypes';

const review: Review = {
  vendorId: 1, vendorName: 'Vendor', invoiceNumber: '0012', billDate: '2026-11-22',
  dueDate: '', currency: 'USD', exchangeRate: '1', total: '28.00', tax: '0',
  shipping: '0', discount: '0', receiptChecked: true, warnings: [],
  lines: [{
    code: '001', description: 'Cups', billingUnit: 'CS', pack: '100/case',
    shipped: '2', unitPrice: '14.00', amount: '28.00', page: 1, fileId: 1,
    confirmed: true, remember: false, casesPerUnit: '1', itemId: 10,
  }],
};
describe('vendor invoice accounting', () => {
  it('records shipped cases and the invoice cost per case', () => {
    expect(reconcileInvoice(review)).toMatchObject({
      issues: [], entries: [{ itemId: 10, quantity: 2, rate: 14 }],
    });
  });
  it('converts a confirmed non-case unit while preserving total', () => {
    const line = { ...review.lines[0], billingUnit: 'EA', casesPerUnit: '0.5' };
    expect(reconcileInvoice({ ...review, lines: [line] })).toMatchObject({
      issues: [], entries: [{ itemId: 10, quantity: 1, rate: 28 }],
    });
    expect(reconcileInvoice({ ...review, lines: [{...line, casesPerUnit: ''}] }).issues)
      .toContain('Line 1: confirm the number of inventory cases per billed unit.');
  });
  it('blocks mismatched totals and unconfirmed matches or prior receipts', () => {
    const result = reconcileInvoice({
      ...review, total: '27.99', receiptChecked: false,
      lines: [{ ...review.lines[0], confirmed: false }],
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      'Line 1: confirm an inventory item.',
      'Confirm the stock has not already been recorded.',
      'The reviewed invoice total does not match its lines and charges.',
    ]));
  });
});
