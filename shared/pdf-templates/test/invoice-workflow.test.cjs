const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  renderInvoicePaperTemplateHtml,
  renderPackingSlipPaperTemplateHtml,
} = require('../dist/components.umd.js');
const details = {
  invoiceNumber: 'INV-WORKFLOW',
  billingAddressText: 'ACCOUNTS\n10 Billing Lane',
  shippingAddressText: 'RECEIVING\n20 Shipping Road',
  shippingMethod: 'Local truck',
  shippingDate: '11/12/2026',
  trackingNo: 'TRACK-100',
  referenceNo: 'PO-200',
  paymentInstructions: 'INSTRUCTIONS-PRIVATE-TO-INVOICE',
  statement: 'MESSAGE-PRIVATE-TO-INVOICE',
  termsConditions: 'TERMS-PRIVATE-TO-INVOICE',
  total: '$123.45',
  subtotal: '$121.45',
  shippingCharge: '$2.00',
  adjustment: '$3.00',
  discount: '$4.00',
  paymentMade: '$5.00',
  dueAmount: '$118.45',
  taxes: [{ label: 'TAX-MONEY', amount: '$6.00' }],
  showTotal: true,
  showSubtotal: true,
  showLineRate: true,
  showLineTotal: true,
  lines: [
    {
      item: 'Paper towels',
      description: 'Case of 12',
      quantity: '0.5',
      rate: '$242.90',
      total: '$121.45',
      discount: '$4.00',
    },
  ],
};
test('invoice renders address snapshots, shipment and payment instructions with escaped text', () => {
  const html = renderInvoicePaperTemplateHtml({
    ...details,
    billingAddressText: '<script>alert(1)</script>\n10 Billing Lane',
  });
  for (const text of [
    '20 Shipping Road',
    'Local truck',
    'TRACK-100',
    'PO-200',
    '$2.00',
    'INSTRUCTIONS-PRIVATE-TO-INVOICE',
    '&lt;script&gt;',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<script>'));
});
for (const layoutMode of ['standard', 'designer', 'distribution'])
  test(`packing slip excludes all financial values in ${layoutMode} layout`, () => {
    const html = renderPackingSlipPaperTemplateHtml({ ...details, layoutMode });
    for (const text of [
      'Packing Slip',
      '10 Billing Lane',
      '20 Shipping Road',
      'Paper towels',
      'Case of 12',
      '0.5',
      'TRACK-100',
      'INSTRUCTIONS-PRIVATE-TO-INVOICE',
      'MESSAGE-PRIVATE-TO-INVOICE',
    ])
      assert.ok(html.includes(text), text);
    for (const text of [
      '$123.45',
      '$121.45',
      '$2.00',
      '$3.00',
      '$4.00',
      '$5.00',
      '$118.45',
      '$6.00',
      '$242.90',
      'TERMS-PRIVATE-TO-INVOICE',
    ])
      assert.ok(!html.includes(text), text);
  });

test('distributor design supports replaceable top-right logo, independent footer image and alternating row colors', () => {
  const html = renderInvoicePaperTemplateHtml({
    ...details,
    layoutMode: 'distribution',
    companyAddressOverride: 'JCS PATEL LLC\n1047 Woodruff St.',
    paymentTerms: 'Net 15',
    companyLogoUri: 'https://example.test/logo-one.png',
    footerImageUri: 'https://example.test/payment-qr.png',
    footerImageCaption: 'Scan to pay',
    alternateRowColors: true,
    evenRowColor: '#e8f1e5',
    lines: [...details.lines, { ...details.lines[0], item: 'Second item' }],
  });
  for (const expected of [
    'data-distribution-invoice',
    'data-invoice-logo',
    'logo-one.png',
    'data-invoice-footer-image',
    'payment-qr.png',
    'JCS PATEL LLC',
    'Net 15',
    '#e8f1e5',
    'Second item',
    'Scan to pay',
  ])
    assert.ok(html.includes(expected), expected);
  const replacement = renderInvoicePaperTemplateHtml({
    ...details,
    layoutMode: 'distribution',
    companyLogoUri: 'https://example.test/logo-two.png',
    footerImageUri: 'https://example.test/hidden.png',
    showFooterImage: false,
  });
  assert.ok(replacement.includes('logo-two.png'));
  assert.ok(!replacement.includes('hidden.png'));
});

test('packing slips include customer-facing notes and footer images but keep all monetary output hidden', () => {
  const html = renderPackingSlipPaperTemplateHtml({
    ...details,
    layoutMode: 'distribution',
    footerImageUri: 'https://example.test/qr.png',
    footerImageCaption: 'Scan to pay',
  });
  for (const expected of [
    'INSTRUCTIONS-PRIVATE-TO-INVOICE',
    'MESSAGE-PRIVATE-TO-INVOICE',
    'qr.png',
    'Scan to pay',
  ])
    assert.ok(html.includes(expected), expected);
  for (const hidden of ['$123.45', '$242.90', 'TERMS-PRIVATE-TO-INVOICE'])
    assert.ok(!html.includes(hidden), hidden);
});

test('recorded designer settings control printable margins, column widths, fonts and header visibility', () => {
  const html = renderInvoicePaperTemplateHtml({
    ...details,
    layoutMode: 'distribution',
    designVariant: 'modern',
    primaryColor: '#366534',
    fontFamily: 'Times New Roman',
    documentFontSize: 32,
    pageMarginTop: 0.4,
    pageMarginRight: 0.5,
    pageMarginBottom: 0.6,
    pageMarginLeft: 0.7,
    showBusinessEmail: false,
    showDocumentTitle: false,
    invoiceTitle: 'HIDDEN TITLE',
    companyAddressOverride:
      'Business\n10 Street\n5551234567\nhidden@example.test\nwww.example.test',
    lineColumnWidths: {
      item: 20,
      description: 40,
      quantity: 15,
      rate: 10,
      total: 15,
      discount: 8,
    },
    lineDescriptionLabel: 'Details',
    emailSubject: 'PRIVATE EMAIL SUBJECT',
    emailMessage: 'PRIVATE EMAIL MESSAGE',
  });
  for (const expected of [
    '0.4in 0.5in 0.6in 0.7in',
    'Times New Roman',
    'font-size:32px',
    'width:40%',
    'Details',
    '#366534',
    'www.example.test',
  ])
    assert.ok(html.includes(expected), expected);
  for (const hidden of [
    'HIDDEN TITLE',
    'hidden@example.test',
    'PRIVATE EMAIL SUBJECT',
    'PRIVATE EMAIL MESSAGE',
  ])
    assert.ok(!html.includes(hidden), hidden);
});
