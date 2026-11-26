export type CustomerSalesReportType = 'summary' | 'detail' | 'income';
export interface CustomerSalesQuery {
  reportType: CustomerSalesReportType;
  fromDate: string;
  toDate: string;
  basis: 'cash' | 'accrual';
  customerIds?: number[];
}
export interface CustomerSalesLine {
  index: number;
  itemId: number;
  product: string;
  description: string;
  quantity: number;
  rate: number;
}
export interface CustomerSalesDocument {
  referenceType: string;
  referenceId: number;
  customerId?: number;
  posted: boolean;
  lines: CustomerSalesLine[];
}
export interface CustomerSalesEntry {
  id: number;
  referenceType: string;
  referenceId: number;
  contactId?: number;
  date: string | Date;
  transactionNumber?: string;
  referenceNumber?: string;
  index: number;
  indexGroup?: number;
  itemId?: number;
  note?: string;
  credit: number | string;
  debit: number | string;
  basis?: string;
  account: { accountType: string; name?: string; slug?: string };
}
export interface CustomerSalesRow {
  id: string;
  kind: 'detail' | 'customer' | 'subtotal' | 'total';
  customerId?: number;
  referenceId?: number;
  referenceType?: string;
  cells: Record<string, string | number | null>;
}
export interface CustomerSalesReport {
  meta: {
    title: string;
    fromDate: string;
    toDate: string;
    basis: string;
    currencyCode: string;
    formattedDateRange: string;
  };
  columns: Array<{
    key: string;
    label: string;
    kind: 'text' | 'money' | 'number';
  }>;
  rows: CustomerSalesRow[];
  warnings: string[];
}
