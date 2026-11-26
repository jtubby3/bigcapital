import { BadRequestException } from '@nestjs/common';
import * as moment from 'moment';
import { z } from 'zod';
import { snakeToCamel } from '@/common/interceptors/serialize.interceptor';
import {
  StatementDraft,
  StatementLine,
  StatementSnapshot,
} from './CustomerStatements.types';

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => moment(value, 'YYYY-MM-DD', true).isValid(),
    'Expected a real ISO date',
  );
const normalizeStatementDates = (draft: StatementDraft): StatementDraft =>
  draft.statementType === 'open-item'
    ? { ...draft, fromDate: draft.statementDate, toDate: draft.statementDate }
    : draft;

const draftSchema = z
  .object({
    statementType: z.enum(['balance-forward', 'open-item', 'transaction']),
    statementDate: isoDay,
    fromDate: isoDay,
    toDate: isoDay,
    includePaymentLinks: z.boolean(),
    recipients: z
      .array(
        z.preprocess(
          (value) => snakeToCamel(value),
          z.object({
            customerId: z.number().int().positive().safe(),
            email: z
              .union([z.literal(''), z.string().trim().email()])
              .optional(),
          }),
        ),
      )
      .min(1)
      .max(100),
  })
  .transform((value) => normalizeStatementDates(value as StatementDraft))
  .refine(
    (value) => value.fromDate <= value.toDate,
    'Start date must be on or before end date',
  );

export function validateStatementDraft(input: unknown): StatementDraft {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return {
    ...parsed.data,
    recipients: parsed.data.recipients.filter(
      (recipient, index, all) =>
        all.findIndex((other) => other.customerId === recipient.customerId) ===
        index,
    ),
  } as StatementDraft;
}

export interface StatementCustomer {
  id: number;
  displayName: string;
  currencyCode: string;
  email?: string;
  billingAddress1?: string;
  billingAddress2?: string;
  billingAddressCity?: string;
  billingAddressState?: string;
  billingAddressPostcode?: string;
  billingAddressCountry?: string;
}
export interface StatementLedgerEntry {
  id: number;
  contactId: number;
  date: Date | string;
  debit: number;
  credit: number;
  exchangeRate: number;
  currencyCode: string;
  referenceType: string;
  referenceId: number;
  transactionNumber?: string;
  note?: string;
  index?: number;
}
export interface StatementInvoice {
  id: number;
  customerId: number;
  invoiceDate: Date | string;
  dueDate?: Date | string;
  deliveredAt?: Date | string;
  total: number;
  invoiceNo: string;
  currencyCode: string;
  writtenoffAt?: Date | string;
  writtenoffAmount?: number;
  statementMemo?: string;
  paymentUrl?: string;
}
export interface StatementReceipt {
  id: number;
  customerId: number;
  receiptDate: Date | string;
  receiptNumber: string;
  total: number;
  currencyCode: string;
  closedAt?: Date | string;
}
export interface StatementSettlement {
  kind?: 'payment' | 'credit';
  invoiceId: number;
  date: Date | string;
  amount: number;
}

export const statementDay = (value: Date | string) =>
  moment(value).format('YYYY-MM-DD');
// Match the tenant's three-decimal accounting amounts without binary rounding noise.
const money = (amount: number) =>
  Math.round((amount + Number.EPSILON) * 1000) / 1000;
const labels: Record<string, string> = {
  SaleInvoice: 'Invoice',
  PaymentReceive: 'Payment',
  PaymentReceived: 'Payment',
  CreditNote: 'Credit note',
  CustomerOpeningBalance: 'Opening balance',
  SaleReceipt: 'Sales receipt',
  ManualJournal: 'Journal',
  InvoiceWriteOff: 'Write-off',
  RefundCreditNote: 'Credit refund',
};

export function buildStatementSnapshot(
  draft: StatementDraft,
  customer: StatementCustomer,
  ledger: StatementLedgerEntry[],
  invoices: StatementInvoice[],
  settlements: StatementSettlement[],
  organizationName: string,
  receipts: StatementReceipt[] = [],
  baseCurrencyCode?: string,
): StatementSnapshot {
  draft = normalizeStatementDates(draft);
  const recipient = draft.recipients.find(
    (value) => value.customerId === customer.id,
  );
  const snapshot: StatementSnapshot = {
    customerId: customer.id,
    customerName: customer.displayName,
    email: recipient?.email ?? customer.email ?? '',
    currencyCode: customer.currencyCode,
    billingAddress: [
      customer.billingAddress1,
      customer.billingAddress2,
      customer.billingAddressCity,
      customer.billingAddressState,
      customer.billingAddressPostcode,
      customer.billingAddressCountry,
    ]
      .filter(Boolean)
      .join('\n'),
    organizationName,
    statementType: draft.statementType,
    statementDate: draft.statementDate,
    fromDate: draft.fromDate,
    toDate: draft.toDate,
    includePaymentLinks: draft.includePaymentLinks,
    openingBalance: 0,
    closingBalance: 0,
    totalCharges: 0,
    totalPayments: 0,
    lines: [],
  };
  const customerInvoices = invoices.filter(
    (invoice) => invoice.customerId === customer.id,
  );
  const invoiceById = new Map(
    customerInvoices.map((invoice) => [invoice.id, invoice]),
  );
  if (draft.statementType === 'open-item') {
    let balance = 0;
    snapshot.lines = customerInvoices
      .filter(
        (invoice) =>
          invoice.deliveredAt &&
          statementDay(invoice.invoiceDate) <= draft.toDate,
      )
      .sort(
        (a, b) =>
          statementDay(a.invoiceDate).localeCompare(
            statementDay(b.invoiceDate),
          ) || a.id - b.id,
      )
      .flatMap((invoice) => {
        if (invoice.currencyCode !== customer.currencyCode)
          throw new BadRequestException(
            'Invoice currency differs from customer currency',
          );
        const applied = settlements
          .filter(
            (value) =>
              value.invoiceId === invoice.id &&
              statementDay(value.date) <= draft.toDate,
          )
          .reduce((sum, value) => sum + Number(value.amount), 0);
        const writtenoff =
          invoice.writtenoffAt &&
          statementDay(invoice.writtenoffAt) <= draft.toDate
            ? Number(invoice.writtenoffAmount || 0)
            : 0;
        const originalAmount = money(Number(invoice.total));
        const openAmount = money(
          Math.max(0, originalAmount - applied - writtenoff),
        );
        if (!openAmount) return [];
        balance = money(balance + openAmount);
        return [
          {
            date: statementDay(invoice.invoiceDate),
            type: 'Invoice',
            number: invoice.invoiceNo,
            description:
              invoice.statementMemo ||
              (invoice.dueDate ? `Due ${statementDay(invoice.dueDate)}` : ''),
            debit: originalAmount,
            credit: money(applied + writtenoff),
            balance,
            originalAmount,
            openAmount,
            ...(draft.includePaymentLinks && invoice.paymentUrl
              ? { paymentUrl: invoice.paymentUrl }
              : {}),
          },
        ];
      });
    snapshot.closingBalance = balance;
    snapshot.totalCharges = money(
      snapshot.lines.reduce((sum, line) => sum + line.originalAmount, 0),
    );
    snapshot.totalPayments = money(
      snapshot.lines.reduce((sum, line) => sum + line.credit, 0),
    );
    return snapshot;
  }
  if (draft.statementType === 'transaction') {
    snapshot.transactionPresentation = 'invoice-receipts';
    const periodInvoices: StatementLine[] = customerInvoices
      .filter(
        (invoice) =>
          invoice.deliveredAt &&
          statementDay(invoice.invoiceDate) >= draft.fromDate &&
          statementDay(invoice.invoiceDate) <= draft.toDate,
      )
      .map((invoice) => {
        if (invoice.currencyCode !== customer.currencyCode)
          throw new BadRequestException(
            'Invoice currency differs from customer currency',
          );
        const received = money(
          settlements
            .filter(
              (value) =>
                value.invoiceId === invoice.id &&
                value.kind !== 'credit' &&
                statementDay(value.date) <= draft.toDate,
            )
            .reduce((sum, value) => sum + Number(value.amount), 0),
        );
        return {
          date: statementDay(invoice.invoiceDate),
          type: 'Invoice',
          number: invoice.invoiceNo,
          description: invoice.statementMemo || '',
          debit: money(Number(invoice.total)),
          credit: received,
          balance: 0,
          ...(draft.includePaymentLinks && invoice.paymentUrl
            ? { paymentUrl: invoice.paymentUrl }
            : {}),
        };
      });
    const periodReceipts: StatementLine[] = receipts
      .filter(
        (receipt) =>
          receipt.customerId === customer.id &&
          receipt.closedAt &&
          statementDay(receipt.receiptDate) >= draft.fromDate &&
          statementDay(receipt.receiptDate) <= draft.toDate,
      )
      .map((receipt) => {
        if (receipt.currencyCode !== customer.currencyCode)
          throw new BadRequestException(
            'Receipt currency differs from customer currency',
          );
        const amount = money(Number(receipt.total));
        return {
          date: statementDay(receipt.receiptDate),
          type: 'Sales receipt',
          number: receipt.receiptNumber,
          description: '',
          debit: amount,
          credit: amount,
          balance: 0,
        };
      });
    let balance = 0;
    snapshot.lines = [...periodInvoices, ...periodReceipts]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.number.localeCompare(b.number),
      )
      .map((line) => {
        balance = money(balance + line.debit - line.credit);
        snapshot.totalCharges = money(snapshot.totalCharges + line.debit);
        snapshot.totalPayments = money(snapshot.totalPayments + line.credit);
        return { ...line, balance };
      });
    snapshot.closingBalance = balance;
    return snapshot;
  }
  const receiptEntries: StatementLedgerEntry[] = receipts
    .filter(
      (receipt) =>
        receipt.customerId === customer.id &&
        receipt.closedAt &&
        !ledger.some(
          (entry) =>
            entry.referenceType === 'SaleReceipt' &&
            entry.referenceId === receipt.id,
        ),
    )
    .map((receipt) => ({
      id: -receipt.id,
      contactId: customer.id,
      date: receipt.receiptDate,
      debit: Number(receipt.total),
      credit: Number(receipt.total),
      exchangeRate: 1,
      currencyCode: receipt.currencyCode,
      referenceType: 'SaleReceipt',
      referenceId: receipt.id,
      transactionNumber: receipt.receiptNumber,
    }));
  const entries = [...ledger, ...receiptEntries]
    .filter((entry) => entry.contactId === customer.id)
    .flatMap((entry) => {
      const invoice = invoiceById.get(entry.referenceId);
      if (
        (entry.referenceType === 'SaleInvoice' ||
          entry.referenceType === 'InvoiceWriteOff') &&
        !invoice?.deliveredAt
      )
        return [];
      // Legacy write-off entries use invoiceDate; the document retains the actual effective day.
      const date =
        entry.referenceType === 'InvoiceWriteOff'
          ? invoice.writtenoffAt
          : entry.date;
      if (!date || statementDay(date) > draft.toDate) return [];
      // Payment FX adjustments reconcile base A/R; they do not change the customer's foreign debt.
      if (
        entry.referenceType === 'PaymentReceive' &&
        entry.index === 3 &&
        Number(entry.exchangeRate) === 1 &&
        entry.currencyCode === baseCurrencyCode &&
        entry.currencyCode !== customer.currencyCode
      )
        return [];
      if (entry.currencyCode && entry.currencyCode !== customer.currencyCode)
        throw new BadRequestException(
          'Ledger currency differs from customer currency',
        );
      const rate = Number(entry.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0)
        throw new BadRequestException('Invalid ledger exchange rate');
      return [
        {
          ...entry,
          date: statementDay(date),
          debit: money(Number(entry.debit) / rate),
          credit: money(Number(entry.credit) / rate),
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  if (draft.statementType === 'balance-forward') {
    snapshot.openingBalance = money(
      entries
        .filter((entry) => entry.date < draft.fromDate)
        .reduce((sum, entry) => sum + entry.debit - entry.credit, 0),
    );
  }
  let balance = snapshot.openingBalance;
  snapshot.lines = entries
    .filter((entry) => entry.date >= draft.fromDate)
    .map((entry): StatementLine => {
      balance = money(balance + entry.debit - entry.credit);
      snapshot.totalCharges = money(snapshot.totalCharges + entry.debit);
      snapshot.totalPayments = money(snapshot.totalPayments + entry.credit);
      return {
        date: entry.date,
        type: labels[entry.referenceType] || entry.referenceType,
        number: entry.transactionNumber || '',
        description: entry.note || '',
        debit: entry.debit,
        credit: entry.credit,
        balance,
        ...(draft.includePaymentLinks &&
        entry.referenceType === 'SaleInvoice' &&
        invoiceById.get(entry.referenceId)?.paymentUrl
          ? { paymentUrl: invoiceById.get(entry.referenceId).paymentUrl }
          : {}),
      };
    });
  snapshot.closingBalance = balance;
  return snapshot;
}

export function validateSavedStatementIds(input: unknown): number[] {
  const parsed = z
    .object({
      ids: z.array(z.number().int().positive().safe()).min(1).max(100),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Select between 1 and 100 valid saved statement ids',
    );
  return [...new Set(parsed.data.ids)];
}
