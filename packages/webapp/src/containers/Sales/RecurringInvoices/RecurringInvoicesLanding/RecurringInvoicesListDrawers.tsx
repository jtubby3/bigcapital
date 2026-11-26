import { DRAWERS } from '@/constants/drawers';
import { index as InvoiceDetailDrawer } from '@/containers/Drawers/InvoiceDetailDrawer';
import { index as RecurringInvoiceDetailDrawer } from '@/containers/Drawers/RecurringInvoiceDetailDrawer';

export function RecurringInvoicesListDrawers() {
  return (
    <>
      <RecurringInvoiceDetailDrawer name={DRAWERS.RECURRING_INVOICE_DETAILS} />
      <InvoiceDetailDrawer name={DRAWERS.INVOICE_DETAILS} />
    </>
  );
}
