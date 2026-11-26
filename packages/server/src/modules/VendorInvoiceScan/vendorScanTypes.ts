export interface ReviewLine {
  code: string;
  description: string;
  billingUnit: string;
  pack: string;
  shipped: string;
  unitPrice: string;
  amount: string;
  page: number;
  fileId: number;
  attention?: string;
  itemId?: number | null;
  itemName?: string;
  confirmed: boolean;
  remember: boolean;
  casesPerUnit: string;
}

export interface Review {
  vendorId?: number | null;
  vendorName: string;
  invoiceNumber: string;
  billDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: string;
  warehouseId?: number | null;
  branchId?: number | null;
  shippingItemId?: number | null;
  taxRateId?: number | null;
  total: string;
  shipping: string;
  tax: string;
  discount: string;
  receiptChecked: boolean;
  lines: ReviewLine[];
  warnings: string[];
}

export interface Scan {
  id: number;
  status: 'queued' | 'processing' | 'review' | 'failed' | 'posted' | 'cancelled';
  name: string;
  version: number;
  billId: number | null;
  error: string | null;
  files: { id: number; name: string; pageCount: number }[];
  review: Review;
}

export type OptionKind = 'item' | 'vendor' | 'warehouse' | 'branch' | 'charge' | 'tax';
export interface ScanFileInput {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}
