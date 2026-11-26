import {
  buildStatementSnapshot,
  validateStatementDraft,
} from './statementSnapshot';
import { StatementDraft } from './CustomerStatements.types';

const draft: StatementDraft = {
  statementType: 'balance-forward',
  statementDate: '2026-02-01',
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
  includePaymentLinks: false,
  recipients: [{ customerId: 1 }],
};
const customer = {
  id: 1,
  displayName: 'Customer',
  currencyCode: 'EUR',
  email: 'a@example.com',
};
const entry = (overrides = {}) => ({
  id: 1,
  contactId: 1,
  date: '2026-01-10',
  debit: 200,
  credit: 0,
  exchangeRate: 2,
  currencyCode: 'EUR',
  referenceType: 'ManualJournal',
  referenceId: 1,
  transactionNumber: 'J1',
  note: '',
  ...overrides,
});
const invoice = (overrides = {}) => ({
  id: 10,
  customerId: 1,
  invoiceDate: '2026-01-10',
  deliveredAt: '2026-01-10',
  total: 100,
  invoiceNo: 'INV10',
  currencyCode: 'EUR',
  writtenoffAmount: 0,
  writtenoffAt: null,
  ...overrides,
});

describe('customer statement snapshots', () => {
  it('uses pre-period AR opening and ordered running balances in customer currency', () => {
    const snapshot = buildStatementSnapshot(
      draft,
      customer,
      [
        entry({ id: 3, date: '2026-01-20', debit: 0, credit: 40 }),
        entry({ id: 2 }),
        entry({ date: '2025-12-31', debit: 100 }),
        entry({ id: 4, date: '2026-02-01', debit: 1000 }),
      ],
      [],
      [],
      'Company',
    );
    expect(snapshot).toMatchObject({
      openingBalance: 50,
      closingBalance: 130,
      totalCharges: 100,
      totalPayments: 20,
      currencyCode: 'EUR',
    });
    expect(snapshot.lines.map((line) => line.balance)).toEqual([150, 130]);
    expect(snapshot).not.toHaveProperty('transactionPresentation');
  });

  it('includes closed sales receipt charges and payments without changing amount owed', () => {
    const receipt = {
      id: 20,
      customerId: 1,
      receiptDate: '2026-01-12',
      receiptNumber: 'SR20',
      total: 40,
      currencyCode: 'EUR',
      closedAt: '2026-01-12',
    };
    const snapshot = buildStatementSnapshot(
      { ...draft, statementType: 'transaction' },
      customer,
      [],
      [],
      [],
      'Company',
      [receipt, { ...receipt, id: 21, closedAt: null }],
    );
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject({
      type: 'Sales receipt',
      number: 'SR20',
      debit: 40,
      credit: 40,
      balance: 0,
    });
    expect(snapshot).toMatchObject({
      totalCharges: 40,
      totalPayments: 40,
      closingBalance: 0,
    });
  });

  it('omits the base-currency-only FX adjustment when a foreign payment settles the debt', () => {
    const rows = [
      entry({ referenceType: 'SaleInvoice', referenceId: 10 }),
      entry({
        id: 2,
        referenceType: 'PaymentReceive',
        referenceId: 20,
        debit: 0,
        credit: 220,
        exchangeRate: 2.2,
        index: 1,
      }),
      entry({
        id: 3,
        referenceType: 'PaymentReceive',
        referenceId: 20,
        debit: 20,
        credit: 0,
        exchangeRate: 1,
        currencyCode: 'USD',
        index: 3,
      }),
    ];
    const snapshot = buildStatementSnapshot(
      draft,
      customer,
      rows,
      [invoice()],
      [],
      'Company',
      [],
      'USD',
    );
    expect(snapshot).toMatchObject({
      totalCharges: 100,
      totalPayments: 100,
      closingBalance: 0,
    });
    expect(snapshot.lines).toHaveLength(2);
  });

  it('excludes draft invoices even when stale ledger entries exist', () => {
    const snapshot = buildStatementSnapshot(
      draft,
      customer,
      [entry({ referenceType: 'SaleInvoice', referenceId: 10 })],
      [invoice({ deliveredAt: null })],
      [],
      'Company',
    );
    expect(snapshot.lines).toEqual([]);
    expect(snapshot.closingBalance).toBe(0);
  });

  it('computes historical open invoices with payments/credits/writeoffs only through cutoff', () => {
    const snapshot = buildStatementSnapshot(
      { ...draft, statementType: 'open-item', statementDate: '2026-01-31' },
      customer,
      [],
      [
        invoice({ writtenoffAmount: 10, writtenoffAt: '2026-02-02' }),
        invoice({ id: 11, deliveredAt: null }),
        invoice({ id: 12, invoiceDate: '2026-02-01' }),
      ],
      [
        { invoiceId: 10, date: '2026-01-20', amount: 20 },
        { invoiceId: 10, date: '2026-01-25', amount: 5 },
        { invoiceId: 10, date: '2026-02-01', amount: 30 },
      ],
      'Company',
    );
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject({
      originalAmount: 100,
      openAmount: 75,
    });
    expect(snapshot.closingBalance).toBe(75);
    expect(snapshot).not.toHaveProperty('transactionPresentation');
  });

  it.each([
    ['2026-01-15', '2026-01-31', 80, 1],
    ['2026-01-25', '2026-01-15', 75, 2],
  ])(
    'uses Open Item statement date %s independently of hidden end date %s',
    (statementDate, toDate, amount, count) => {
      const snapshot = buildStatementSnapshot(
        { ...draft, statementType: 'open-item', statementDate, toDate },
        customer,
        [],
        [
          invoice({ writtenoffAt: '2026-01-18', writtenoffAmount: 10 }),
          invoice({ id: 20, invoiceDate: '2026-01-20', total: 40 }),
        ],
        [
          { invoiceId: 10, date: '2026-01-14', amount: 20 },
          { invoiceId: 10, date: '2026-01-17', amount: 5 },
          { invoiceId: 10, date: '2026-01-20', amount: 30 },
        ],
        'Company',
      );
      expect(snapshot.lines).toHaveLength(count);
      expect(snapshot.closingBalance).toBe(amount);
      expect(snapshot.fromDate).toBe(statementDate);
      expect(snapshot.toDate).toBe(statementDate);
    },
  );

  it('shows the due date on Open Item lines when no statement memo exists', () => {
    const snapshot = buildStatementSnapshot(
      { ...draft, statementType: 'open-item' },
      customer,
      [],
      [
        invoice({ dueDate: '2026-02-10' }),
        invoice({
          id: 20,
          dueDate: '2026-02-15',
          statementMemo: 'Agreed installment',
        }),
        invoice({ id: 30 }),
      ],
      [],
      'Company',
    );
    expect(snapshot.lines.map((line) => line.description)).toEqual([
      'Due 2026-02-10',
      'Agreed installment',
      '',
    ]);
  });

  it('uses writeoff effective date rather than the backdated ledger invoice date', () => {
    const snapshot = buildStatementSnapshot(
      draft,
      customer,
      [
        entry({
          referenceType: 'InvoiceWriteOff',
          referenceId: 10,
          debit: 0,
          credit: 20,
        }),
      ],
      [invoice({ writtenoffAt: '2026-02-03', writtenoffAmount: 10 })],
      [],
      'Company',
    );
    expect(snapshot.closingBalance).toBe(0);
  });

  it('transaction statements start period running total at zero', () => {
    const snapshot = buildStatementSnapshot(
      { ...draft, statementType: 'transaction' },
      customer,
      [entry({ date: '2025-12-31' }), entry()],
      [invoice(), invoice({ id: 11, invoiceDate: '2025-12-31', total: 200 })],
      [],
      'Company',
    );
    expect(snapshot.openingBalance).toBe(0);
    expect(snapshot.lines[0].balance).toBe(100);
    expect(snapshot.closingBalance).toBe(100);
  });

  it('transaction statements list period invoices once with linked cash received through end date', () => {
    const snapshot = buildStatementSnapshot(
      { ...draft, statementType: 'transaction' },
      customer,
      [
        entry({ referenceType: 'SaleInvoice', referenceId: 10 }),
        entry({
          id: 2,
          referenceType: 'PaymentReceive',
          referenceId: 50,
          debit: 0,
          credit: 400,
        }),
      ],
      [
        invoice({ writtenoffAt: '2026-01-20', writtenoffAmount: 10 }),
        invoice({ id: 11, invoiceDate: '2025-12-20', total: 200 }),
        invoice({ id: 12, deliveredAt: null }),
        invoice({ id: 13, invoiceDate: '2026-02-01' }),
      ],
      [
        { invoiceId: 10, date: '2026-01-15', amount: 25 },
        { invoiceId: 10, date: '2026-02-01', amount: 30 },
        { invoiceId: 10, date: '2026-01-20', amount: 15, kind: 'credit' },
        { invoiceId: 11, date: '2026-01-15', amount: 200 },
      ],
      'Company',
    );
    expect(snapshot).toHaveProperty(
      'transactionPresentation',
      'invoice-receipts',
    );
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject({
      type: 'Invoice',
      debit: 100,
      credit: 25,
    });
    expect(snapshot).toMatchObject({
      openingBalance: 0,
      totalCharges: 100,
      totalPayments: 25,
      closingBalance: 75,
    });
  });

  it('rejects mixed customer currency and invalid exchange rates instead of misreporting money', () => {
    expect(() =>
      buildStatementSnapshot(
        draft,
        customer,
        [entry({ currencyCode: 'USD' })],
        [],
        [],
        'Company',
      ),
    ).toThrow();
    expect(() =>
      buildStatementSnapshot(
        draft,
        customer,
        [entry({ exchangeRate: 0 })],
        [],
        [],
        'Company',
      ),
    ).toThrow();
  });
});

describe('statement input validation', () => {
  it.each(['2026-02-30', '2026-1-01', 'not-a-date'])(
    'rejects invalid date %s',
    (date) => {
      expect(() =>
        validateStatementDraft({ ...draft, toDate: date }),
      ).toThrow();
    },
  );
  it('rejects inverted periods, empty recipients, invalid email and more than 100 recipients', () => {
    expect(() =>
      validateStatementDraft({ ...draft, fromDate: '2026-02-01' }),
    ).toThrow();
    expect(() =>
      validateStatementDraft({ ...draft, recipients: [] }),
    ).toThrow();
    expect(() =>
      validateStatementDraft({
        ...draft,
        recipients: [{ customerId: 1, email: 'bad' }],
      }),
    ).toThrow();
    expect(() =>
      validateStatementDraft({
        ...draft,
        recipients: Array.from({ length: 101 }, (_, i) => ({
          customerId: i + 1,
        })),
      }),
    ).toThrow();
  });
  it('normalizes Open Item loader bounds to statement date before validating the hidden period', () => {
    expect(
      validateStatementDraft({
        ...draft,
        statementType: 'open-item',
        statementDate: '2026-01-15',
        fromDate: '2026-02-01',
        toDate: '2026-01-01',
      }),
    ).toMatchObject({
      statementDate: '2026-01-15',
      fromDate: '2026-01-15',
      toDate: '2026-01-15',
    });
  });

  it('deduplicates customer ids and allows blank email for save', () => {
    expect(
      validateStatementDraft({
        ...draft,
        recipients: [{ customerId: 1, email: '' }, { customerId: 1 }],
      }).recipients,
    ).toEqual([{ customerId: 1, email: '' }]);
  });
});
