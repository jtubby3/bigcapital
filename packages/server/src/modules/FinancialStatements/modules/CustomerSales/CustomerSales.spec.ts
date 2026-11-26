import { buildCustomerSalesReport } from './CustomerSales';
import { validateCustomerSalesQuery } from './CustomerSalesQuery.dto';

const query = {
  reportType: 'summary',
  fromDate: '2026-01-01',
  toDate: '2026-12-31',
  basis: 'accrual',
};
const income = { accountType: 'income', name: 'Sales', slug: 'sales' };
const expense = { accountType: 'cost-of-goods-sold', name: 'COGS' };
const metadata = { baseCurrency: 'USD', dateFormat: 'MMM D, YYYY' };
const customers = [{ id: 7, displayName: 'Acme' }];
const invoice = {
  referenceType: 'SaleInvoice',
  referenceId: 1,
  customerId: 7,
  posted: true,
  lines: [
    {
      index: 2,
      itemId: 4,
      product: 'Widget',
      description: 'Original description',
      quantity: 2,
      rate: 50,
    },
  ],
};
const credit = {
  ...invoice,
  referenceType: 'CreditNote',
  referenceId: 2,
  lines: [
    {
      index: 2,
      itemId: 4,
      product: 'Widget',
      description: 'Returned',
      quantity: 0.2,
      rate: 50,
    },
  ],
};
const entry = (id, extra = {}) => ({
  id,
  referenceType: 'SaleInvoice',
  referenceId: 1,
  date: '2026-02-01',
  transactionNumber: 'INV-1',
  index: 2,
  itemId: 4,
  note: 'Original description',
  credit: 100,
  debit: 0,
  basis: 'accrual',
  exchangeRate: 2,
  account: income,
  ...extra,
});
const build = (
  q: any = {},
  entries: any[] = [],
  documents: any[] = [invoice, credit],
) =>
  buildCustomerSalesReport(
    { ...query, ...q },
    entries,
    documents,
    customers,
    metadata,
  );

describe('customer sales accounting', () => {
  it('reports 100 sales less 10 credit, excluding tax, draft and invoice settlement', () => {
    const report = build(
      {},
      [
        entry(1),
        entry(2, {
          referenceType: 'CreditNote',
          referenceId: 2,
          credit: 0,
          debit: 10,
        }),
        entry(3, { credit: 8, account: { accountType: 'tax-payable' } }),
        entry(4, { referenceId: 3, credit: 999 }),
        entry(5, {
          referenceType: 'PaymentReceive',
          referenceId: 4,
          credit: 108,
          account: { accountType: 'accounts-receivable' },
        }),
      ],
      [invoice, credit, { ...invoice, referenceId: 3, posted: false }],
    );
    expect(report.rows.map((r) => r.cells)).toEqual([
      { customer: 'Acme', total: 90 },
      { customer: 'TOTAL', total: 90 },
    ]);
    expect(report.meta.currencyCode).toBe('USD');
  });

  it('uses original line quantities/prices and posted base amounts once, with discounts and running balances', () => {
    const report = build({ reportType: 'detail' }, [
      entry(1),
      entry(2, {
        index: 1,
        itemId: null,
        debit: 5,
        credit: 0,
        account: {
          accountType: 'other-income',
          slug: 'discount',
          name: 'Discount',
        },
      }),
      entry(3, {
        referenceType: 'CreditNote',
        referenceId: 2,
        credit: 0,
        debit: 10,
        date: '2026-02-02',
        note: 'Returned',
      }),
    ]);
    const lines = report.rows.filter((r) => r.kind === 'detail');
    expect(lines.map((r) => r.cells.amount)).toEqual([-5, 100, -10]);
    expect(lines.map((r) => r.cells.balance)).toEqual([-5, 95, 85]);
    expect(lines[1].cells).toMatchObject({
      product: 'Widget',
      description: 'Original description',
      quantity: 2,
      salesPrice: 50,
    });
    expect(lines[2].cells.quantity).toBe(-0.2);
    expect(report.rows.at(-1).cells.amount).toBe(85);
  });

  it('uses actual historical 60 COGS and leaves unrelated expenses visibly unassigned', () => {
    const report = build({ reportType: 'income' }, [
      entry(1),
      entry(2, {
        referenceType: 'CreditNote',
        referenceId: 2,
        credit: 0,
        debit: 10,
      }),
      entry(3, { credit: 0, debit: 60, account: expense }),
      entry(4, {
        referenceType: 'Expense',
        referenceId: 9,
        contactId: 99,
        credit: 0,
        debit: 5,
        account: { accountType: 'expense' },
      }),
    ]);
    expect(report.rows.map((r) => r.cells)).toEqual([
      { customer: 'Acme', income: 90, expenses: -60, netIncome: 30 },
      { customer: 'Unassigned', income: 0, expenses: -5, netIncome: -5 },
      { customer: 'TOTAL', income: 90, expenses: -65, netIncome: 25 },
    ]);
    expect(report.warnings.join(' ')).toMatch(/Unassigned/);
  });

  it('recognizes only posted cash revenue for split payments and refunds', () => {
    const documents = [
      invoice,
      credit,
      {
        ...invoice,
        referenceType: 'PaymentReceive',
        referenceId: 10,
        lines: [],
      },
      {
        ...invoice,
        referenceType: 'PaymentReceive',
        referenceId: 11,
        lines: [],
      },
      { ...credit, referenceType: 'RefundCreditNote', referenceId: 12 },
    ];
    const report = build(
      { basis: 'cash' },
      [
        entry(1),
        entry(2, {
          referenceType: 'PaymentReceive',
          referenceId: 10,
          basis: 'cash',
          credit: 40,
        }),
        entry(3, {
          referenceType: 'PaymentReceive',
          referenceId: 11,
          basis: 'cash',
          credit: 60,
        }),
        entry(4, {
          referenceType: 'RefundCreditNote',
          referenceId: 12,
          basis: 'cash',
          credit: 0,
          debit: 10,
        }),
      ],
      documents,
    );
    expect(report.rows.at(-1).cells.total).toBe(90);
  });

  it('excludes accrual payment exchange gains from sales', () => {
    expect(
      build(
        {},
        [
          entry(1),
          entry(2, {
            referenceType: 'PaymentReceive',
            referenceId: 10,
            credit: 5,
            account: { accountType: 'other-income' },
          }),
        ],
        [
          invoice,
          { ...invoice, referenceType: 'PaymentReceive', referenceId: 10 },
        ],
      ).rows.at(-1).cells.total,
    ).toBe(100);
  });

  it.each([
    [-1, 20, -1],
    [1, -20, 1],
  ])(
    'preserves signed invoice quantity %s and rate %s',
    (quantity, rate, expected) => {
      const report = build(
        { reportType: 'detail' },
        [entry(1, { debit: 20, credit: 0 })],
        [{ ...invoice, lines: [{ ...invoice.lines[0], quantity, rate }] }],
      );
      expect(
        report.rows.find((row) => row.kind === 'detail').cells,
      ).toMatchObject({ quantity: expected, salesPrice: rate, amount: -20 });
    },
  );

  it('sums decimals precisely and returns an empty period total', () => {
    expect(
      build({}, [
        entry(1, { credit: '0.1' }),
        entry(2, { credit: '0.2' }),
      ]).rows.at(-1).cells.total,
    ).toBe(0.3);
    expect(build().rows).toEqual([
      { id: 'total', kind: 'total', cells: { customer: 'TOTAL', total: 0 } },
    ]);
  });

  it('preserves posted fractional cents until presentation', () => {
    expect(
      build({}, [
        entry(1, { credit: '0.004' }),
        entry(2, { credit: '0.004' }),
        entry(3, { credit: '0.004' }),
      ]).rows.at(-1).cells.total,
    ).toBe(0.012);
  });

  it('filters customer IDs, dates, and keeps deterministic ordering', () => {
    const report = build({ customerIds: [7] }, [
      entry(9, { date: '2025-12-31' }),
      entry(2),
      entry(3, { referenceType: 'Journal', contactId: 8 }),
    ]);
    expect(report.rows.at(-1).cells.total).toBe(100);
  });
});

describe('customer sales query validation', () => {
  it.each([
    { reportType: 'other' },
    { basis: 'other' },
    { fromDate: '2026-02-30' },
    { fromDate: '2027-01-01' },
    { customerIds: [0] },
    { customerIds: ['7x'] },
    { customerIds: '7,8' },
    { toDate: null },
  ])('rejects invalid queries before data retrieval: %p', (override) => {
    expect(() =>
      validateCustomerSalesQuery({ ...query, ...override }),
    ).toThrow();
  });
  it('accepts numeric query arrays and normalizes IDs', () => {
    expect(
      validateCustomerSalesQuery({ ...query, customerIds: ['7', '8'] })
        .customerIds,
    ).toEqual([7, 8]);
  });
});
