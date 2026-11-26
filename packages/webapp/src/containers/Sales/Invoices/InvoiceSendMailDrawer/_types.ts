import type { PackingSlipSelection } from '@/hooks/query/invoices';

export interface InvoiceSendMailFormValues {
  subject: string;
  message: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachPdf: boolean;
  packingSlips: PackingSlipSelection[];
}
