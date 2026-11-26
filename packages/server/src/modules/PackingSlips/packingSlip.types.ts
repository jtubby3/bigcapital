export interface RecognizedLine {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ScanPage {
  page: number;
  lines: RecognizedLine[];
}
export interface InvoiceCandidate {
  id: number;
  invoiceNo: string;
  customerId: number;
  customerName: string;
  shippingAddress: string;
  referenceNo: string;
  trackingNo: string;
  shippingDate: string;
  invoiceDate: string;
  eligible: boolean;
  entries: {
    code: string;
    name: string;
    description: string;
    quantity: number;
    unit?: string;
  }[];
}
export interface MatchResult {
  invoiceId?: number;
  route: 'invoice-number' | 'reference' | 'contents' | 'review';
  verified: boolean;
  reasons: string[];
  candidates: {
    invoiceId: number;
    invoiceNo: string;
    customerName: string;
    reasons: string[];
  }[];
}
export interface SlipProposal {
  pages: number[];
  result: MatchResult;
}
export interface PackingSlipSelection {
  id: number;
  version: number;
}
