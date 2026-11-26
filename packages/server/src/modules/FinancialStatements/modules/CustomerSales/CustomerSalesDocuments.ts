import { bignumber } from 'mathjs';
import {
  CustomerSalesDocument,
  CustomerSalesLine,
} from './CustomerSales.types';

interface SourceLine {
  itemId: number;
  description: string;
  quantity: number;
  rate: number;
  item?: { name: string };
}
interface SourceDocument {
  id: number;
  customerId: number;
  exchangeRate: number;
  totalLocal?: number;
  deliveredAt?: Date | string;
  closedAt?: Date | string;
  openedAt?: Date | string;
  entries?: SourceLine[];
}
interface SourcePayment {
  id: number;
  customerId: number;
  exchangeRate: number;
  entries?: Array<{ paymentAmount: number; invoice?: SourceDocument }>;
}
interface SourceRefund {
  id: number;
  amount: number;
  creditNote?: SourceDocument;
}

const linesOf = (doc: SourceDocument, ratio = 1): CustomerSalesLine[] =>
  (doc.entries || []).map((entry, index) => ({
    index: index + 2,
    itemId: entry.itemId,
    product: entry.item?.name || '',
    description: entry.description || '',
    quantity: Number(
      bignumber(String(entry.quantity || 0))
        .times(ratio)
        .toFixed(6),
    ),
    rate: Number(
      bignumber(String(entry.rate || 0))
        .times(String(doc.exchangeRate ?? 1))
        .toFixed(5),
    ),
  }));

export function customerSalesDocuments(
  invoices: SourceDocument[],
  receipts: SourceDocument[],
  credits: SourceDocument[],
  payments: SourcePayment[],
  refunds: SourceRefund[],
  refundPostings: Array<{ referenceId: number; contactId: number }> = [],
): CustomerSalesDocument[] {
  return [
    ...invoices.map((doc) => ({
      referenceType: 'SaleInvoice',
      referenceId: doc.id,
      customerId: doc.customerId,
      posted: !!doc.deliveredAt,
      lines: linesOf(doc),
    })),
    ...receipts.map((doc) => ({
      referenceType: 'SaleReceipt',
      referenceId: doc.id,
      customerId: doc.customerId,
      posted: !!doc.closedAt,
      lines: linesOf(doc),
    })),
    ...credits.map((doc) => ({
      referenceType: 'CreditNote',
      referenceId: doc.id,
      customerId: doc.customerId,
      posted: !!doc.openedAt,
      lines: linesOf(doc),
    })),
    ...payments.map((doc) => ({
      referenceType: 'PaymentReceive',
      referenceId: doc.id,
      customerId: doc.customerId,
      posted: true,
      lines: (doc.entries || []).flatMap((allocation) => {
        if (!allocation.invoice?.totalLocal) return [];
        const ratio = Number(
          bignumber(String(allocation.paymentAmount))
            .times(String(doc.exchangeRate ?? 1))
            .div(String(allocation.invoice.totalLocal)),
        );
        return linesOf(allocation.invoice, ratio);
      }),
    })),
    ...refunds.map((doc) => {
      const contacts = [
        ...new Set(
          refundPostings
            .filter((posting) => posting.referenceId === doc.id)
            .map((posting) => posting.contactId),
        ),
      ];
      return {
        referenceType: 'RefundCreditNote',
        referenceId: doc.id,
        customerId: contacts.length === 1 ? contacts[0] : undefined,
        posted: true,
        // Credit notes remain editable after refund; their current lines are not a historical snapshot.
        lines: [],
      };
    }),
  ];
}
