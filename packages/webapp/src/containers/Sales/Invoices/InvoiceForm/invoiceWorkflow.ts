import moment from 'moment';
import type { Customer } from '@bigcapital/sdk-ts';

export type InvoiceAfterSaveAction =
  | 'review-email'
  | 'invoice-pdf'
  | 'invoice-preview'
  | 'packing-slip'
  | 'packing-slip-preview';

export function customerAddressText(
  customer: Customer,
  kind: 'billing' | 'shipping',
): string {
  const read = (suffix: string) =>
    String(
      (customer as unknown as Record<string, unknown>)[
        `${kind}Address${suffix}`
      ] || '',
    ).trim();
  const parts = [
    read('1'),
    read('2'),
    [read('City'), read('State'), read('Postcode')].filter(Boolean).join(' '),
    read('Country'),
    read('Phone'),
  ];
  if (kind === 'shipping' && !parts.some(Boolean)) return '';
  return [customer.displayName, ...parts].filter(Boolean).join('\n');
}

export function invoiceDueDate(
  invoiceDate: string,
  days: string,
): string | null {
  const date = moment(invoiceDate, 'YYYY-MM-DD', true);
  if (
    !date.isValid() ||
    days === '' ||
    !Number.isInteger(Number(days)) ||
    Number(days) < 0 ||
    Number(days) > 3650
  )
    return null;
  return date.add(Number(days), 'days').format('YYYY-MM-DD');
}

export async function downloadInvoiceDocument(
  id: number,
  kind: 'invoice-pdf' | 'packing-slip',
  token: string,
  organizationId: string,
): Promise<void> {
  const suffix = kind === 'packing-slip' ? '/packing-slip' : '';
  const response = await fetch(`/api/sale-invoices/${id}${suffix}`, {
    headers: {
      accept: 'application/pdf',
      Authorization: `Bearer ${token}`,
      'organization-id': organizationId,
    },
  });
  if (!response.ok)
    throw new Error(
      'The document could not be generated. Your invoice has been saved.',
    );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${kind === 'packing-slip' ? 'Packing-Slip' : 'Invoice'}-${id}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
