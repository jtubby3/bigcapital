import type { BillEntryDto } from '../Bills/dtos/Bill.dto';
import type { Review } from './vendorScanTypes';

// Fixed-point math for invoice amounts and the bill's quantity/rate precision.
function scaled(value: string, places: number): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (/[^0]/.test(fraction.slice(places))) return null;
  return BigInt(whole + fraction.slice(0, places).padEnd(places, '0'));
}
const rounded = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;
const isoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

export function reconcileInvoice(review: Review) {
  const issues: string[] = [];
  const entries: BillEntryDto[] = [];
  const shipping = scaled(review.shipping, 2);
  const tax = scaled(review.tax, 2);
  const discount = scaled(review.discount, 2);
  const total = scaled(review.total, 2);
  const exchangeRate = scaled(review.exchangeRate, 8);
  if (!review.vendorId) issues.push('Choose the vendor.');
  if (!review.invoiceNumber.trim()) issues.push('Enter the vendor invoice number for duplicate checking.');
  if (!isoDate(review.billDate)) issues.push('Enter the invoice date.');
  if (review.dueDate && (!isoDate(review.dueDate) || review.dueDate < review.billDate)) {
    issues.push('The due date must be on or after the invoice date.');
  }
  if (!/^[A-Z]{3}$/.test(review.currency)) issues.push('Enter the invoice currency.');
  if (!exchangeRate) issues.push('Enter a positive exchange rate.');
  if (!review.receiptChecked) issues.push('Confirm the stock has not already been recorded.');
  if (!review.lines.length) issues.push('Add at least one inventory line.');
  if (shipping === null || tax === null || discount === null || total === null) {
    issues.push('Review all charges and enter the invoice total.');
  }
  if (shipping > 0n && !review.shippingItemId) issues.push('Choose the purchase expense item for delivery.');
  if (tax > 0n && !review.taxRateId) issues.push('Choose the purchase tax rate.');
  let merchandise = 0n;
  for (const [index, line] of review.lines.entries()) {
    const label = `Line ${index + 1}:`;
    const shipped = scaled(line.shipped, 3);
    const rate = scaled(line.unitPrice, 5);
    const amount = scaled(line.amount, 2);
    const conversion = scaled(line.casesPerUnit, 8);
    if (!line.confirmed || !line.itemId) issues.push(`${label} confirm an inventory item.`);
    if (!line.billingUnit.trim()) issues.push(`${label} enter the invoice billing unit.`);
    if (!conversion) issues.push(`${label} confirm the number of inventory cases per billed unit.`);
    if (!shipped || rate === null || amount === null) {
      issues.push(`${label} check the shipped quantity, unit cost and line total.`);
      continue;
    }
    merchandise += amount;
    if (rounded(shipped * rate, 1000000n) !== amount) {
      issues.push(`${label} shipped quantity × unit cost does not match the line total.`);
      continue;
    }
    if (!conversion || !line.itemId) continue;
    const cases = rounded(shipped * conversion, 100000000n);
    if (!cases || cases > 9999999999999n || shipped * conversion % 100000000n !== 0n) {
      issues.push(`${label} the case quantity needs to fit Big Capital’s three decimal places.`);
      continue;
    }
    const caseRate = rounded(rate * 100000000n, conversion);
    if (caseRate > 999999999999999n || rounded(cases * caseRate, 1000000n) !== amount) {
      issues.push(`${label} the cost per case does not reconcile at Big Capital’s precision.`);
      continue;
    }
    entries.push({
      index: entries.length + 1, itemId: line.itemId, quantity: Number(cases) / 1000,
      rate: Number(caseRate) / 100000, description: line.description,
      ...(tax > 0n && review.taxRateId ? { taxRateId: review.taxRateId } : {}),
    });
  }
  if ([shipping, tax, discount, total].every((value) => value !== null)) {
    if (discount > merchandise || total !== merchandise + shipping + tax - discount) {
      issues.push('The reviewed invoice total does not match its lines and charges.');
    }
  }
  if (shipping > 0n && review.shippingItemId) {
    entries.push({
      index: entries.length + 1, itemId: review.shippingItemId, quantity: 1,
      rate: Number(shipping) / 100, description: 'Delivery charge',
    });
  }
  return { issues, entries, total: Number(total) / 100 };
}
