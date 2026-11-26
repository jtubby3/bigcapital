import { statementPdfHtml } from './statementPdfHtml';
import { StatementSnapshot } from './CustomerStatements.types';

const snapshot = (
  changes: Partial<StatementSnapshot> = {},
): StatementSnapshot => ({
  customerId: 1,
  customerName: 'Acme Supply',
  email: 'billing@example.com',
  currencyCode: 'USD',
  billingAddress: '123 Main Street\nNew York, NY',
  organizationName: 'Bigcapital Example',
  statementType: 'balance-forward',
  statementDate: '2026-11-15',
  fromDate: '2026-11-01',
  toDate: '2026-11-15',
  openingBalance: 20,
  closingBalance: 105,
  totalCharges: 100,
  totalPayments: 15,
  includePaymentLinks: false,
  lines: [
    {
      date: '2026-11-03',
      type: 'Invoice',
      number: 'INV-1001',
      description: 'November supplies',
      debit: 100,
      credit: 15,
      balance: 105,
      originalAmount: 100,
      openAmount: 85,
      paymentUrl: 'https://pay.example.com/invoice/1001?token=abc&currency=USD',
    },
  ],
  ...changes,
});

const htmlFor = (changes: Partial<StatementSnapshot> = {}) =>
  statementPdfHtml([snapshot(changes)]).replace(/\u00a0/g, ' ');

describe('statementPdfHtml', () => {
  it('renders balance forward opening, running and ending balances in customer currency', () => {
    const html = htmlFor();
    expect(html).toContain('Balance Forward');
    expect(html).toContain('Beginning balance');
    expect(html).toContain('Running balance');
    expect(html).toContain('Amount due');
    expect(html).toContain('USD 20.00');
    expect(html).toContain('USD 100.00');
    expect(html).toContain('USD 15.00');
    expect(html).toContain('USD 105.00');
    expect(html).not.toContain('Original amount');
  });

  it('places the opening balance before period transactions in balance forward only', () => {
    const html = htmlFor();
    const openingRow = html.match(
      /<tr class="opening-row">[\s\S]*?<\/tr>/,
    )?.[0];
    expect(openingRow).toBeDefined();
    expect(openingRow).toContain('2026-10-31');
    expect(openingRow).toContain('Balance forward');
    expect(openingRow).toContain('USD 20.00');
    expect(openingRow?.match(/class="amount">-/g)).toHaveLength(2);
    expect(html.indexOf('Balance forward')).toBeLessThan(
      html.indexOf('INV-1001'),
    );
    expect(htmlFor({ statementType: 'open-item' })).not.toContain(
      'opening-row',
    );
    expect(htmlFor({ statementType: 'transaction' })).not.toContain(
      'opening-row',
    );
  });

  it.each([
    ['2026-10-15', '2026-10-14'],
    ['2026-11-01', '2026-10-31'],
    ['2026-01-01', '2025-12-31'],
    ['2024-03-01', '2024-02-29'],
    ['2026-03-01', '2026-02-28'],
  ])(
    'dates the opening balance the calendar day before %s',
    (fromDate, expected) => {
      const html = htmlFor({ fromDate });
      const openingRow = html.match(
        /<tr class="opening-row">[\s\S]*?<\/tr>/,
      )?.[0];
      expect(openingRow).toContain(`<td>${expected}</td>`);
      expect(openingRow).toContain('USD 20.00');
      expect(html).toContain(`${fromDate} to 2026-11-15`);
      expect(html).toContain('<td>2026-11-03</td>');
    },
  );

  it('renders open item original and outstanding amounts without running balances', () => {
    const html = htmlFor({ statementType: 'open-item', closingBalance: 85 });
    expect(html).toContain('Open Item');
    expect(html).toContain('Original amount');
    expect(html).toContain('Open amount');
    expect(html).toContain('Amount due');
    expect(html).toContain('USD 100.00');
    expect(html).toContain('USD 85.00');
    expect(html).not.toContain('USD 105.00');
    expect(html).not.toContain('Beginning balance');
    expect(html).not.toContain('Running balance');
  });

  it('renders transaction original amounts and received totals without presenting an amount due', () => {
    const html = htmlFor({
      statementType: 'transaction',
      transactionPresentation: 'invoice-receipts',
    });
    expect(html).toContain('Transaction Statement');
    expect(html).toContain('Total amount');
    expect(html).toContain('>Amount</th>');
    expect(html).toContain('Total received');
    expect(html).toContain('>Received</th>');
    expect(html).not.toContain('Total charges');
    expect(html).not.toContain('Total payments');
    expect(html).toContain('USD 100.00');
    expect(html).toContain('USD 15.00');
    expect(html).not.toContain('USD 20.00');
    expect(html).not.toContain('USD 105.00');
    expect(html).not.toContain('Amount due');
    expect(html).not.toContain('Beginning balance');
    expect(html).not.toContain('Running balance');
    expect(html).not.toContain('Open amount');
  });

  it('keeps unmarked invoice-only transaction snapshots on their legacy labels', () => {
    const html = htmlFor({ statementType: 'transaction' });
    expect(html).toContain('INV-1001');
    expect(html).toContain('>Charges</th>');
    expect(html).toContain('>Payments</th>');
    expect(html).toContain('Total charges');
    expect(html).toContain('Total payments');
    expect(html).not.toContain('>Received</th>');
    expect(html).not.toContain('Total received');
  });

  it('keeps legacy transaction credit notes labeled as payments instead of received cash', () => {
    const base = snapshot();
    const html = htmlFor({
      statementType: 'transaction',
      lines: [
        base.lines[0],
        {
          ...base.lines[0],
          type: 'Credit note',
          number: 'CN-1001',
          debit: 0,
          credit: 15,
        },
      ],
    });
    expect(html).toContain('CN-1001');
    expect(html).toContain('>Charges</th>');
    expect(html).toContain('>Payments</th>');
    expect(html).toContain('Total charges');
    expect(html).toContain('Total payments');
    expect(html).not.toContain('>Received</th>');
    expect(html).not.toContain('Total received');
    expect(html).not.toContain('Amount due');
  });

  it('renders every recipient with their dates, currency, billing address and company', () => {
    const html = statementPdfHtml([
      snapshot(),
      snapshot({
        customerId: 2,
        customerName: 'Euro Customer',
        currencyCode: 'EUR',
      }),
    ]).replace(/\u00a0/g, ' ');
    expect(html.match(/<section\b/g)).toHaveLength(2);
    for (const value of [
      'Acme Supply',
      'Euro Customer',
      '2026-11-01',
      '2026-11-15',
      '123 Main Street',
      'New York, NY',
      'Bigcapital Example',
      'EUR 105.00',
    ])
      expect(html).toContain(value);
  });

  it('escapes customer, company, address, email and all transaction text', () => {
    const unsafe = '<script>alert("x")</script> & \'value\'';
    const base = snapshot();
    const html = htmlFor({
      customerName: unsafe,
      organizationName: unsafe,
      billingAddress: unsafe,
      email: unsafe,
      statementDate: unsafe,
      fromDate: unsafe,
      toDate: unsafe,
      lines: [
        {
          ...base.lines[0],
          date: unsafe,
          type: unsafe,
          number: unsafe,
          description: unsafe,
        },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(unsafe);
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;value&#39;',
    );
  });

  it('omits payment links unless explicitly enabled', () => {
    expect(htmlFor()).not.toContain('href=');
    const html = htmlFor({ includePaymentLinks: true });
    expect(html).toContain(
      'href="https://pay.example.com/invoice/1001?token=abc&amp;currency=USD"',
    );
    expect(html).toContain('Pay invoice');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '//pay.example.com/invoice/1',
    'https://user:secret@pay.example.com/invoice/1',
    'not a URL',
    'https://pay.example.com/\ninvoice/1',
  ])('rejects unsafe or invalid payment URL %s', (paymentUrl) => {
    const base = snapshot();
    expect(
      htmlFor({
        includePaymentLinks: true,
        lines: [{ ...base.lines[0], paymentUrl }],
      }),
    ).not.toContain('href=');
  });

  it('retains clear empty statements and all long line content', () => {
    expect(htmlFor({ lines: [] })).toContain('No transactions in this period.');
    expect(htmlFor({ statementType: 'open-item', lines: [] })).toContain(
      'No open items as of this date.',
    );
    const base = snapshot();
    const description = 'Very long invoice memo '.repeat(400);
    const html = htmlFor({ lines: [{ ...base.lines[0], description }] });
    expect(html).toContain(description);
    expect(html).toContain('display: table-header-group');
    expect(html).toContain('break-before: page');
    expect(html).not.toContain('overflow: hidden');
  });

  it('uses each currency minor unit precision and preserves negative values', () => {
    const base = snapshot();
    const html = htmlFor({
      currencyCode: 'JPY',
      openingBalance: -2000,
      closingBalance: -1950,
      lines: [{ ...base.lines[0], debit: 50, credit: 0, balance: -1950 }],
    });
    expect(html).toContain('-JPY 2,000');
    expect(html).toContain('-JPY 1,950');
    expect(html).toContain('JPY 50');
    expect(html).not.toContain('1,950.00');
  });
});
