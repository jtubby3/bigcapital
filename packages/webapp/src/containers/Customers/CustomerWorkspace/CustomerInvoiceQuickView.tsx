import {
  Button,
  Callout,
  Drawer,
  Menu,
  MenuItem,
  Popover,
  Spinner,
} from '@blueprintjs/core';
import styles from './CustomerInvoiceQuickView.module.scss';
import { invoiceTimeline, quickInvoiceStatus } from './invoiceQuickViewModel';
import { money } from './useCustomerWorkspace';
import {
  AbilitySubject,
  PaymentReceiveAction,
  SaleInvoiceAction,
} from '@/constants/abilityOption';
import { DRAWERS } from '@/constants/drawers';
import { useAuditLogsInfinityQuery } from '@/hooks/query/audit-logs';
import {
  useInvoice,
  useInvoicePaymentTransactions,
} from '@/hooks/query/invoices';
import { useDialogActions, useDrawerActions } from '@/hooks/state';
import { useAbilityContext } from '@/hooks/utils';

type Props = { invoiceId: number; onClose: () => void; onEdit: () => void };
const date = (value?: string) =>
  value
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value,
      ).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';
export function CustomerInvoiceQuickView({
  invoiceId,
  onClose,
  onEdit,
}: Props) {
  const ability = useAbilityContext();
  const query = useInvoice(invoiceId);
  const canReadPayments = ability.can('View', AbilitySubject.PaymentReceive);
  const payments = useInvoicePaymentTransactions(invoiceId, {
    enabled: canReadPayments,
  });
  const canReadAudit = ability.can('View', AbilitySubject.AuditLog);
  const activity = useAuditLogsInfinityQuery(
    { subject: 'SaleInvoice', subjectId: invoiceId, pageSize: 20 },
    { enabled: canReadAudit },
  );
  const { openDialog } = useDialogActions();
  const { openDrawer } = useDrawerActions();
  const invoice = query.data;
  const timeline = invoice
    ? invoiceTimeline(
        invoice,
        (payments.data || []).map((payment) => ({
          ...payment,
          formattedPaymentAmount: money(
            payment.paymentAmount,
            invoice.currencyCode,
          ),
        })),
        activity.data?.pages.flatMap((page) => page.data) || [],
      )
    : [];
  const dialog = (name: string) => {
    onClose();
    openDialog(name, { invoiceId });
  };
  const send = () => {
    onClose();
    openDrawer(DRAWERS.INVOICE_SEND_MAIL, { invoiceId });
  };
  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.invoiceNo}` : 'Invoice quick view'}
      size="min(540px, 100vw)"
      className={styles.drawer}
    >
      <div className={styles.body}>
        {query.isLoading ? (
          <Spinner size={26} />
        ) : query.isError || !invoice ? (
          <Callout intent="warning">
            Unable to load this invoice.{' '}
            <Button onClick={() => query.refetch()}>Try again</Button>
          </Callout>
        ) : (
          <>
            <section className={styles.summary}>
              <span className={styles.status}>
                {quickInvoiceStatus(invoice)}
              </span>
              <label>Balance due</label>
              <strong>{invoice.dueAmountFormatted}</strong>
              <div className={styles.dates}>
                <div>
                  <label>Invoice date</label>
                  {invoice.invoiceDateFormatted || date(invoice.invoiceDate)}
                </div>
                <div>
                  <label>Due date</label>
                  {invoice.dueDateFormatted || date(invoice.dueDate)}
                </div>
              </div>
            </section>
            <details className={styles.section}>
              <summary>Customer details</summary>
              <h3>{invoice.customer?.displayName}</h3>
              {invoice.customer?.email && <p>{invoice.customer.email}</p>}
              <label>Billing address</label>
              <p className={styles.address}>
                {invoice.billingAddressText || 'No billing address added'}
              </p>
              {invoice.shippingAddressText && (
                <>
                  <label>Shipping address</label>
                  <p className={styles.address}>
                    {invoice.shippingAddressText}
                  </p>
                </>
              )}
            </details>
            <details className={styles.section} open>
              <summary>Invoice activity</summary>
              {(canReadAudit && activity.isLoading) ||
              (canReadPayments && payments.isLoading) ? (
                <Spinner size={18} />
              ) : null}
              {(activity.isError || payments.isError) && (
                <Callout intent="warning">
                  Some activity could not be loaded.{' '}
                  <Button
                    small
                    onClick={() => {
                      if (canReadAudit) activity.refetch();
                      if (canReadPayments) payments.refetch();
                    }}
                  >
                    Retry
                  </Button>
                </Callout>
              )}
              {timeline.length ? (
                <ol className={styles.timeline}>
                  {timeline.map((event) => (
                    <li key={event.key}>
                      <div>{event.label}</div>
                      {event.detail && <small>{event.detail}</small>}
                      <time>{date(event.at)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No recorded activity yet.</p>
              )}
              {activity.hasNextPage && (
                <Button
                  small
                  minimal
                  loading={activity.isFetchingNextPage}
                  onClick={() => activity.fetchNextPage()}
                >
                  Load earlier activity
                </Button>
              )}
            </details>
            <section className={styles.section}>
              <h2>Products and services</h2>
              <div className={styles.items}>
                {invoice.entries?.map((entry, i) => (
                  <div className={styles.item} key={`${entry.index}-${i}`}>
                    <div>
                      <b>{entry.item?.name || 'Item'}</b>
                      {entry.description && <p>{entry.description}</p>}
                      <small>
                        {entry.quantityFormatted || entry.quantity} ×{' '}
                        {money(entry.rate, invoice.currencyCode)}
                      </small>
                    </div>
                    <strong>
                      {entry.totalFormatted} {invoice.currencyCode}
                    </strong>
                  </div>
                ))}
              </div>
              <div className={styles.total}>
                <span>
                  Subtotal{invoice.isInclusiveTax ? ' (tax included)' : ''}
                </span>
                <b>{money(invoice.subtotal, invoice.currencyCode)}</b>
              </div>
              {invoice.taxes?.map((tax) => (
                <div className={styles.total} key={tax.id}>
                  <span>
                    {tax.name} ({tax.taxRate}%)
                    {invoice.isInclusiveTax ? ' · included' : ''}
                  </span>
                  <b>{tax.taxRateAmountFormatted}</b>
                </div>
              ))}
              {Number(invoice.discountAmount) > 0 && (
                <div className={styles.total}>
                  <span>Discount</span>
                  <b>−{invoice.discountAmountFormatted}</b>
                </div>
              )}
              {Number(invoice.adjustment) !== 0 && (
                <div className={styles.total}>
                  <span>Adjustment</span>
                  <b>{invoice.adjustmentFormatted}</b>
                </div>
              )}
              {Number(invoice.shippingCharge) > 0 && (
                <div className={styles.total}>
                  <span>Shipping</span>
                  <b>
                    {money(
                      Number(invoice.shippingCharge),
                      invoice.currencyCode,
                    )}
                  </b>
                </div>
              )}
              <div className={styles.total}>
                <span>Invoice total</span>
                <b>{invoice.totalFormatted}</b>
              </div>
              {Number(invoice.paymentAmount) > 0 && (
                <div className={styles.total}>
                  <span>Payments received</span>
                  <b>{money(invoice.paymentAmount, invoice.currencyCode)}</b>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {invoice && (
        <footer className={styles.footer}>
          <Popover
            minimal
            position="top-left"
            content={
              <Menu>
                <MenuItem text="Send invoice" icon="envelope" onClick={send} />
                <MenuItem
                  text="Preview / print"
                  icon="print"
                  onClick={() => dialog('invoice-pdf-preview')}
                />
              </Menu>
            }
          >
            <Button rightIcon="chevron-down">More actions</Button>
          </Popover>
          <div>
            {invoice.isDelivered &&
              Number(invoice.dueAmount) > 0 &&
              ability.can(
                PaymentReceiveAction.Create,
                AbilitySubject.PaymentReceive,
              ) && (
                <Button onClick={() => dialog('quick-payment-receive')}>
                  Receive payment
                </Button>
              )}
            {ability.can(SaleInvoiceAction.Edit, AbilitySubject.Invoice) && (
              <Button intent="primary" onClick={onEdit}>
                Edit invoice
              </Button>
            )}
          </div>
        </footer>
      )}
    </Drawer>
  );
}
