export interface InvoiceAddress {
  displayName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export const defaultInvoiceAddressFormat =
  '{CONTACT_NAME}\n{ADDRESS_1}\n{ADDRESS_2}\n{CITY} {STATE} {POSTAL_CODE}\n{COUNTRY}\n{PHONE}';

export const invoiceAddressTokens: Record<string, keyof InvoiceAddress> = {
  CONTACT_NAME: 'displayName',
  ADDRESS_1: 'address1',
  ADDRESS_2: 'address2',
  CITY: 'city',
  STATE: 'state',
  POSTAL_CODE: 'postalCode',
  COUNTRY: 'country',
  PHONE: 'phone',
  EMAIL: 'email',
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );

/** Address formats are plain text with tokens, never user-supplied HTML. */
export function formatInvoiceAddress(
  address: InvoiceAddress,
  format: string = defaultInvoiceAddressFormat,
): string {
  const text = format.replace(
    /\{([A-Z][A-Z0-9_]*)\}/g,
    (token, key: string) => {
      const field = Object.prototype.hasOwnProperty.call(
        invoiceAddressTokens,
        key,
      )
        ? invoiceAddressTokens[key]
        : undefined;
      return field ? address[field] || '' : token;
    },
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br />');
}

/** Only editor previews use these examples; invoice PDFs receive customer data. */
export const invoicePreviewAddresses = {
  billingAddress: {
    displayName: 'Sample Customer',
    address1: '100 Billing Avenue',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'United States',
  },
  shippingAddress: {
    displayName: 'Sample Customer',
    address1: '200 Delivery Street',
    address2: 'Receiving dock 2',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    country: 'United States',
  },
};
