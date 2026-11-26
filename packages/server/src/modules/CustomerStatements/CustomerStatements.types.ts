export type StatementType = 'balance-forward' | 'open-item' | 'transaction';

export interface StatementDraft {
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  includePaymentLinks: boolean;
  recipients: { customerId: number; email?: string }[];
}

export interface StatementLine {
  date: string;
  type: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  originalAmount?: number;
  openAmount?: number;
  paymentUrl?: string;
}

export interface StatementSnapshot {
  transactionPresentation?: 'invoice-receipts';
  customerId: number;
  customerName: string;
  email: string;
  currencyCode: string;
  billingAddress: string;
  organizationName: string;
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalCharges: number;
  totalPayments: number;
  includePaymentLinks: boolean;
  lines: StatementLine[];
}

export interface SavedStatement {
  id: number;
  customerId: number;
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  email: string;
  status: 'saved' | 'sent';
  createdAt: string;
  sentAt?: string;
  snapshot: StatementSnapshot;
}
