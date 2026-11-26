const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  defaultInvoiceLayout,
  normalizeInvoiceLayout,
  normalizeInvoiceColumns,
  moveInvoiceSection,
  renderInvoicePaperTemplateHtml,
} = require('../dist/components.umd.js');

test('old templates keep the standard invoice and actual invoice values', () => {
  const html = renderInvoicePaperTemplateHtml({
    invoiceNumber: 'INV-42',
    total: '$123.45',
  });
  assert.match(html, /INV-42/);
  assert.match(html, /\$123\.45/);
  assert.doesNotMatch(html, /<div data-invoice-layout/);
  assert.match(html, /size: A4/);
});

test('custom title, paper, typography and plain text render in the PDF HTML', () => {
  const html = renderInvoicePaperTemplateHtml({
    invoiceTitle: 'Paper supply invoice',
    pageSize: 'letter',
    fontFamily: 'Georgia',
    documentFontSize: 16,
    headerText: 'Your paper partner',
    footerText: '<script>alert(1)</script>',
  });
  assert.match(html, /Paper supply invoice/);
  assert.match(html, /Your paper partner/);
  assert.match(html, /size: letter/);
  assert.match(html, /font-family:Georgia/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('columns can be reordered, relabeled and hidden without changing values', () => {
  const html = renderInvoicePaperTemplateHtml({
    lineColumns: ['total', 'item', 'quantity', 'rate', 'discount'],
    lineItemLabel: 'Product',
    lineQuantityLabel: 'Cases',
    showLineRate: false,
    showLineDescription: false,
    lines: [
      {
        item: 'Paper towels',
        description: 'PRIVATE DESCRIPTION',
        quantity: '8',
        rate: 'HIDDEN RATE',
        total: '$80.00',
      },
    ],
  });
  assert.ok(html.indexOf('>Total</') < html.indexOf('>Product</'));
  assert.match(html, /Cases/);
  assert.match(html, /Paper towels/);
  assert.match(html, /\$80\.00/);
  assert.doesNotMatch(html, /PRIVATE DESCRIPTION|HIDDEN RATE/);
});

test('layouts reject unknown sections and normalize unsafe positions', () => {
  const result = normalizeInvoiceLayout([
    { id: 'items', width: Infinity, row: -5, column: 90 },
    { id: 'unknown', width: 12, row: 1, column: 1 },
  ]);
  assert.equal(result.length, 9);
  assert.equal(new Set(result.map((entry) => entry.id)).size, 9);
  for (const entry of result) {
    assert.ok(
      Number.isFinite(entry.width) && entry.width >= 3 && entry.width <= 12,
    );
    assert.ok(
      entry.row >= 1 && entry.column >= 1 && entry.column + entry.width <= 13,
    );
  }
  assert.deepEqual(normalizeInvoiceColumns(['bad', 'item', 'item']), [
    'item',
    'quantity',
    'rate',
    'discount',
    'total',
  ]);
});

test('moving a section preserves its requested position and resolves collisions without mutating defaults', () => {
  const before = JSON.stringify(defaultInvoiceLayout);
  const result = moveInvoiceSection(defaultInvoiceLayout, 'totals', {
    row: 3,
    column: 1,
    width: 12,
  });
  assert.equal(result.find((entry) => entry.id === 'totals').row, 3);
  assert.ok(result.find((entry) => entry.id === 'items').row > 3);
  for (const a of result)
    for (const b of result) {
      if (a.id !== b.id && a.row === b.row) {
        assert.ok(
          a.column + a.width <= b.column || b.column + b.width <= a.column,
        );
      }
    }
  assert.equal(JSON.stringify(defaultInvoiceLayout), before);
});

test('designer renders all invoice lines once and preserves custom positions in printable HTML', () => {
  const lines = Array.from({ length: 80 }, (_, index) => ({
    item: `Product-${index}-END`,
    quantity: '2',
    rate: '$10.00',
    total: '$20.00',
  }));
  const html = renderInvoicePaperTemplateHtml({
    layoutMode: 'designer',
    lines,
    footerText: 'Please remit payment',
    sectionLayout: moveInvoiceSection(defaultInvoiceLayout, 'customerAddress', {
      column: 1,
      row: 3,
    }),
  });
  assert.match(html, /data-invoice-layout/);
  assert.match(html, /grid-column:1 \/ span 4;grid-row:3/);
  assert.match(html, /Please remit payment/);
  for (let index = 0; index < 80; index++) {
    assert.equal(html.split(`Product-${index}-END`).length - 1, 1);
  }
  assert.doesNotMatch(html, /draggable=|tabindex=|Invoice layout reference/);
});

test('Bill To and Ship To headings, field order, and visibility are independent', () => {
  const addresses = {
    billingAddress: {
      displayName: 'Accounts Department',
      address1: '10 Billing Lane',
      city: 'New York',
      state: 'NY',
    },
    shippingAddress: {
      displayName: 'Receiving Team',
      address1: '20 Delivery Road',
      city: 'Brooklyn',
      state: 'NY',
    },
    billedToLabel: 'Invoice To',
    shipToLabel: 'Deliver To',
    billToAddressFormat: '{CONTACT_NAME}\n{ADDRESS_1}',
    shipToAddressFormat: '{CITY} {STATE}\n{ADDRESS_1}\n{CONTACT_NAME}',
  };
  const html = renderInvoicePaperTemplateHtml(addresses);
  assert.match(html, /Invoice To/);
  assert.match(html, /Accounts Department<br \/>10 Billing Lane/);
  assert.match(html, /Deliver To/);
  assert.match(html, /Brooklyn NY<br \/>20 Delivery Road<br \/>Receiving Team/);
  const noBilling = renderInvoicePaperTemplateHtml({
    ...addresses,
    showCustomerAddress: false,
  });
  assert.doesNotMatch(noBilling, /10 Billing Lane/);
  assert.match(noBilling, /20 Delivery Road/);
  const noShipping = renderInvoicePaperTemplateHtml({
    ...addresses,
    showShippingAddress: false,
  });
  assert.match(noShipping, /10 Billing Lane/);
  assert.doesNotMatch(noShipping, /20 Delivery Road/);
});

test('shipping has no fabricated fallback and address tokens cannot inject HTML', () => {
  const html = renderInvoicePaperTemplateHtml({
    billingAddress: { address1: 'Only a billing address' },
  });
  assert.match(html, /Only a billing address/);
  assert.doesNotMatch(html, /<strong>Ship To<|200 Delivery Street/);
  const { formatInvoiceAddress } = require('../dist/components.umd.js');
  assert.equal(
    formatInvoiceAddress(
      { displayName: 'A & B', address1: '<script>bad()</script>' },
      '{CONTACT_NAME}\n{ADDRESS_1}\n{ADDRESS_2}',
    ),
    'A &amp; B<br />&lt;script&gt;bad()&lt;/script&gt;',
  );
  assert.equal(
    formatInvoiceAddress(
      { address1: '{CITY}', city: 'Brooklyn' },
      '{ADDRESS_1}\n{CITY}',
    ),
    '{CITY}<br />Brooklyn',
  );
  assert.equal(
    formatInvoiceAddress({ city: 'Boston' }, '<img src=x>\n{CITY}'),
    '&lt;img src=x&gt;<br />Boston',
  );
});

test('existing layouts gain a separate Ship To section without overlapping or dropping Bill To', () => {
  const oldLayout = [
    { id: 'header', column: 1, row: 1, width: 12 },
    { id: 'companyAddress', column: 1, row: 2, width: 6 },
    { id: 'customerAddress', column: 7, row: 2, width: 6 },
    { id: 'items', column: 1, row: 3, width: 12 },
    { id: 'totals', column: 7, row: 4, width: 6 },
    { id: 'terms', column: 1, row: 5, width: 12 },
    { id: 'statement', column: 1, row: 6, width: 12 },
    { id: 'footer', column: 1, row: 7, width: 12 },
  ];
  const result = normalizeInvoiceLayout(oldLayout);
  assert.deepEqual(
    result.find((section) => section.id === 'customerAddress'),
    oldLayout[2],
  );
  assert.ok(result.find((section) => section.id === 'shippingAddress'));
  for (const a of result)
    for (const b of result) {
      if (a.id !== b.id && a.row === b.row)
        assert.ok(
          a.column + a.width <= b.column || b.column + b.width <= a.column,
        );
    }
});
