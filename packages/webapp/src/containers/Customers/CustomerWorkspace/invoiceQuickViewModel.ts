type InvoiceState = {
  isDelivered?: boolean;
  isWrittenoff?: boolean;
  isFullyPaid?: boolean;
  isOverdue?: boolean;
  isPartiallyPaid?: boolean;
  dueAmount?: number;
  paymentAmount?: number;
  createdAt?: string;
  deliveredAt?: string;
};
type Payment = {
  paymentReceiveId?: number;
  paymentDate?: string;
  paymentNumber?: string;
  formattedPaymentAmount?: string;
};
type Audit = {
  id?: number;
  createdAt?: string;
  action?: string;
  summary?: string;
  userName?: string | null;
};
export type InvoiceTimelineEvent = {
  key: string;
  label: string;
  at: string;
  detail?: string;
};

export function quickInvoiceStatus(invoice: InvoiceState) {
  if (!invoice.isDelivered) return 'Draft';
  if (invoice.isWrittenoff) return 'Closed';
  if (invoice.isFullyPaid || invoice.dueAmount === 0)
    return invoice.paymentAmount ? 'Paid' : 'Closed';
  if (invoice.isOverdue) return 'Overdue';
  if (invoice.isPartiallyPaid) return 'Partial';
  return 'Open';
}

/** Only persisted invoice milestones, audit records and linked payments. */
export function invoiceTimeline(
  invoice: InvoiceState,
  payments: Payment[],
  audits: Audit[],
): InvoiceTimelineEvent[] {
  const events: InvoiceTimelineEvent[] = audits
    .filter((a) => a.createdAt)
    .map((a) => ({
      key: `audit-${a.id}`,
      label: a.action ? `Invoice ${a.action.toLowerCase()}` : 'Invoice updated',
      at: a.createdAt!,
      detail: [a.summary, a.userName].filter(Boolean).join(' · ') || undefined,
    }));
  if (invoice.createdAt && !audits.some((a) => /creat/i.test(a.action || '')))
    events.push({
      key: 'created',
      label: 'Invoice created',
      at: invoice.createdAt,
    });
  if (
    invoice.deliveredAt &&
    !audits.some((a) => /deliver|issu/i.test(a.action || ''))
  )
    events.push({
      key: 'delivered',
      label: 'Invoice issued',
      at: invoice.deliveredAt,
    });
  payments.forEach((payment, i) => {
    if (payment.paymentDate)
      events.push({
        key: `payment-${payment.paymentReceiveId ?? i}`,
        label: `Payment ${payment.paymentNumber || ''} received`.replace(
          '  ',
          ' ',
        ),
        at: payment.paymentDate,
        detail: payment.formattedPaymentAmount,
      });
  });
  return events.sort(
    (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0),
  );
}
