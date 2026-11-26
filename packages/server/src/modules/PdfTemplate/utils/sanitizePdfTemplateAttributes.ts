import * as sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'br',
    'b',
    'i',
    'u',
    'strong',
    'em',
    'p',
    'span',
    'a',
    'ul',
    'ol',
    'li',
  ],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
};

export function sanitizePdfTemplateAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  // Labels and custom text are escaped by React; HTML encoding them here
  // would print entities such as &amp; literally on the invoice.
  for (const [key, value] of Object.entries(attributes)) {
    sanitized[key] =
      typeof value === 'string' &&
      !key.endsWith('Label') &&
      ![
        'invoiceTitle',
        'headerText',
        'footerText',
        'companyAddressOverride',
        'footerImageCaption',
        'defaultInvoiceMessage',
        'defaultPaymentInstructions',
        'emailSubject',
        'emailMessage',
        'lineDescriptionLabel',
        'billToAddressFormat',
        'shipToAddressFormat',
      ].includes(key)
        ? sanitizeHtml(value, SANITIZE_OPTIONS)
        : value;
  }
  return sanitized;
}
