import { BadRequestException } from '@nestjs/common';
import type { Review } from './vendorScanTypes';

function invalid(): never {
  throw new BadRequestException('The invoice review contains invalid fields.');
}
function str(value: unknown, size: number, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value !== 'string' || value.length > size || value.includes('\0')) invalid();
  return value.trim();
}
function id(value: unknown, allowZero = false): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) invalid();
  return value;
}
export function normalizeReview(value: Review): Review {
  if (!value || typeof value !== 'object' || !Array.isArray(value.lines) || value.lines.length > 300) invalid();
  return {
    vendorId: id(value.vendorId),
    vendorName: str(value.vendorName, 255),
    invoiceNumber: str(value.invoiceNumber, 120),
    billDate: str(value.billDate, 10),
    dueDate: str(value.dueDate, 10),
    currency: str(value.currency, 3).toUpperCase(),
    exchangeRate: str(value.exchangeRate, 32),
    warehouseId: id(value.warehouseId),
    branchId: id(value.branchId),
    shippingItemId: id(value.shippingItemId),
    taxRateId: id(value.taxRateId),
    total: str(value.total, 32),
    shipping: str(value.shipping, 32),
    tax: str(value.tax, 32),
    discount: str(value.discount, 32),
    receiptChecked: value.receiptChecked === true,
    warnings: [],
    lines: value.lines.map((line) => {
      if (!line || typeof line !== 'object') invalid();
      return {
        code: str(line.code, 120),
        description: str(line.description, 1000),
        billingUnit: str(line.billingUnit, 30).toUpperCase(),
        pack: str(line.pack, 250),
        shipped: str(line.shipped, 32),
        unitPrice: str(line.unitPrice, 32),
        amount: str(line.amount, 32),
        page: id(line.page, true) ?? 0,
        fileId: id(line.fileId, true) ?? 0,
        itemId: id(line.itemId),
        confirmed: line.confirmed === true,
        remember: line.remember === true,
        casesPerUnit: str(line.casesPerUnit, 32),
      };
    }),
  };
}

export const emptyReview = (): Review => ({
  vendorName: '', invoiceNumber: '', billDate: '', dueDate: '', currency: '',
  exchangeRate: '', total: '', shipping: '', tax: '', discount: '',
  receiptChecked: false, lines: [], warnings: [],
});
