import * as moment from 'moment';
import {
  CustomerWorkspaceService,
  CustomerWorkspaceController,
  filterWorkspaceTransactions,
  workspaceSummary,
  workspaceMetricCustomerIds,
  WorkspaceTransaction,
} from './CustomerWorkspace';
const row = (
  overrides: Partial<WorkspaceTransaction>,
): WorkspaceTransaction => ({
  id: 1,
  customerId: 7,
  date: moment().format('YYYY-MM-DD'),
  type: 'Invoice',
  number: '100',
  amount: 100,
  openBalance: 100,
  currency: 'USD',
  status: 'Open',
  memo: '',
  ...overrides,
});
describe('customer sales overview', () => {
  it('keeps currencies separate and deducts available credits from open invoices', () => {
    const result = workspaceSummary([
      row({}),
      row({ currency: 'EUR', amount: 80, openBalance: 80 }),
      row({ type: 'Credit memo', amount: 20, openBalance: 20 }),
    ]);
    expect(result.find((m) => m.key === 'open')?.amounts).toEqual([
      { currency: 'USD', amount: 80 },
      { currency: 'EUR', amount: 80 },
    ]);
  });
  it('excludes drafts from open receivables, overdue totals and cash receipts', () => {
    const result = workspaceSummary([
      row({ status: 'Draft' }),
      row({ type: 'Sales receipt', status: 'Draft' }),
      row({ type: 'Payment', status: 'Closed', amount: 30 }),
    ]);
    expect(result.find((m) => m.key === 'unbilled')?.amounts).toEqual([
      { currency: 'USD', amount: 100 },
    ]);
    expect(result.find((m) => m.key === 'open')?.count).toBe(0);
    expect(result.find((m) => m.key === 'paid')?.amounts).toEqual([
      { currency: 'USD', amount: 30 },
    ]);
  });
  it('counts outstanding amounts and excludes old or future receipts and converted estimates', () => {
    const result = workspaceSummary([
      row({ status: 'Overdue', openBalance: 40 }),
      row({ type: 'Payment', date: '2000-01-01' }),
      row({ type: 'Payment', date: '2099-01-01' }),
      row({ type: 'Estimate', status: 'Converted' }),
      row({ type: 'Estimate', status: 'Rejected' }),
      row({ type: 'Estimate', status: 'Accepted', amount: 75 }),
    ]);
    expect(result.find((m) => m.key === 'overdue')?.amounts[0].amount).toBe(40);
    expect(result.find((m) => m.key === 'paid')?.count).toBe(0);
    expect(result.find((m) => m.key === 'estimates')?.amounts[0].amount).toBe(
      75,
    );
  });
});
describe('customer transaction access', () => {
  it('only queries permitted transaction resources and scopes the query to this customer', async () => {
    const found = { throwIfNotFound: jest.fn().mockResolvedValue({ id: 7 }) };
    const customerModel = () => ({
      query: () => ({ findById: jest.fn().mockReturnValue(found) }),
    });
    const forbidden = jest.fn(() => {
      throw new Error('Unauthorized model queried');
    });
    const where = jest.fn().mockResolvedValue([
      {
        id: 3,
        customerId: 7,
        paymentDate: '2026-11-13',
        paymentReceiveNo: 'P3',
        amount: 30,
        currencyCode: 'USD',
        exchangeRate: 2,
      },
    ]);
    const payments = () => ({
      query: () => ({
        where,
        then: (resolve: any) => where.mock.results[0].value.then(resolve),
      }),
    });
    const service = new CustomerWorkspaceService(
      customerModel as any,
      forbidden as any,
      forbidden as any,
      payments as any,
      forbidden as any,
      forbidden as any,
    );
    const rows = await service.rows(
      { can: (_action, subject) => subject === 'PaymentReceive' },
      7,
    );
    expect(where).toHaveBeenCalledWith('customerId', 7);
    expect(forbidden).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'Payment',
        status: 'Closed',
        amount: 30,
        exchangeRate: 2,
        customerId: 7,
      }),
    ]);
  });
  it('rejects a missing customer before looking up their transactions', async () => {
    const customerModel = () => ({
      query: () => ({
        findById: () => ({
          throwIfNotFound: () => Promise.reject(new Error('Not found')),
        }),
      }),
    });
    const forbidden = jest.fn();
    const service = new CustomerWorkspaceService(
      customerModel as any,
      forbidden as any,
      forbidden as any,
      forbidden as any,
      forbidden as any,
      forbidden as any,
    );
    await expect(service.rows({ can: () => true }, 123)).rejects.toThrow(
      'Not found',
    );
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe('customer transaction multiselect filters', () => {
  const transactions = [
    row({ id: 1, type: 'Invoice', status: 'Open' }),
    row({ id: 2, type: 'Invoice', status: 'Paid' }),
    row({ id: 3, type: 'Payment', status: 'Closed' }),
    row({ id: 4, type: 'Estimate', status: 'Open' }),
    row({ id: 5, type: 'Credit memo', status: 'Open' }),
  ];
  it('matches any selected type and any selected status, combining both filters', () => {
    expect(
      filterWorkspaceTransactions(transactions, {
        type: 'Invoice,Payment',
        status: 'Paid,Closed',
      }).map((r) => r.id),
    ).toEqual([2, 3]);
    expect(
      filterWorkspaceTransactions(transactions, { status: 'Open,Closed' }).map(
        (r) => r.id,
      ),
    ).toEqual([1, 3, 4, 5]);
  });
  it('clears to all records, preserves single selections, and applies other filters', () => {
    expect(
      filterWorkspaceTransactions(transactions, { type: '', status: '' }),
    ).toEqual(transactions);
    expect(
      filterWorkspaceTransactions(transactions, { type: 'Payment' }).map(
        (r) => r.id,
      ),
    ).toEqual([3]);
    expect(
      filterWorkspaceTransactions(transactions, {
        type: 'Invoice,Payment',
        status: 'Open,Closed',
        search: 'missing',
      }),
    ).toEqual([]);
  });
  it('filters before paginating and returns the combined matching count', async () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      row({
        id: i + 1,
        type: i % 2 ? 'Invoice' : 'Payment',
        status: i % 2 ? 'Paid' : 'Closed',
      }),
    );
    const controller = new CustomerWorkspaceController(
      {
        rows: jest.fn().mockResolvedValue(rows),
      } as any,
      {} as any,
    );
    const result = await controller.transactions(
      7,
      { type: 'Invoice,Payment', status: 'Paid,Closed', page: '2' },
      { ability: {} },
    );
    expect(result.total).toBe(60);
    expect(result.rows).toHaveLength(25);
    expect(result.rows[0].id).toBe(26);
  });
});

describe('excluding transaction statuses', () => {
  it('excludes drafts while allowing every other selected status', () => {
    const rows = [
      row({ id: 1, status: 'Draft' }),
      row({ id: 2, status: 'Open' }),
      row({ id: 3, type: 'Payment', status: 'Closed' }),
    ];
    expect(
      filterWorkspaceTransactions(rows, {
        type: 'Invoice,Payment',
        status: 'Open,Overdue,Partial,Paid,Closed,Accepted,Rejected,Converted',
      }).map((r) => r.id),
    ).toEqual([2, 3]);
  });
  it('distinguishes choosing no options from choosing all options', () => {
    const rows = [row({})];
    expect(filterWorkspaceTransactions(rows, { type: '[]' })).toEqual([]);
    expect(filterWorkspaceTransactions(rows, { status: '[]' })).toEqual([]);
    expect(filterWorkspaceTransactions(rows, { type: '', status: '' })).toEqual(
      rows,
    );
  });
});

describe('sales overview customer filtering', () => {
  it('uses the same matching rules as the summary and deduplicates customers across every transaction', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, id) => row({ id, customerId: 7 })),
      row({ id: 31, customerId: 8, status: 'Overdue', openBalance: 20 }),
      row({ id: 32, customerId: 8, status: 'Overdue', openBalance: 5 }),
      row({ id: 33, customerId: 9, status: 'Draft' }),
      row({ id: 34, customerId: 10, type: 'Credit memo' }),
    ];
    expect(workspaceMetricCustomerIds(rows, 'overdue')).toEqual([8]);
    expect(workspaceMetricCustomerIds(rows, 'open')).toEqual([7, 8, 10]);
    expect(workspaceMetricCustomerIds(rows, 'unbilled')).toEqual([9]);
    expect(workspaceMetricCustomerIds(rows, 'paid')).toEqual([]);
    expect(() => workspaceMetricCustomerIds(rows, 'invalid')).toThrow(
      'Invalid sales overview metric',
    );
  });
  it('normalizes widths with stored exchange rates while retaining each displayed currency', () => {
    const summary = workspaceSummary([
      row({ amount: 100, openBalance: 100, exchangeRate: 1 }),
      row({ currency: 'EUR', amount: 100, openBalance: 100, exchangeRate: 2 }),
      row({
        type: 'Credit memo',
        amount: 10,
        openBalance: 10,
        exchangeRate: 2,
      }),
    ]);
    const open = summary.find((metric) => metric.key === 'open');
    expect(open?.baseAmount).toBe(280);
    expect(open?.amounts).toEqual([
      { currency: 'USD', amount: 90 },
      { currency: 'EUR', amount: 100 },
    ]);
  });
});

describe('customer overview list endpoint', () => {
  it('rejects unknown metrics before loading financial records', async () => {
    const rows = jest.fn();
    const controller = new CustomerWorkspaceController(
      { rows } as any,
      {} as any,
    );
    await expect(
      controller.customers({} as any, 'unknown', { ability: {} }),
    ).rejects.toThrow('Invalid sales overview metric');
    expect(rows).not.toHaveBeenCalled();
  });
  it('uses all matching customer IDs and forwards other filters unchanged', async () => {
    const ability = { can: () => true };
    const transactions = Array.from({ length: 60 }, (_, index) =>
      row({
        id: index + 1,
        customerId: index + 1,
        status: index === 59 ? 'Overdue' : 'Paid',
      }),
    );
    const rows = jest.fn().mockResolvedValue(transactions);
    let received;
    const controller = new CustomerWorkspaceController(
      { rows } as any,
      {
        getCustomersList: async (query) => {
          received = query;
          return { data: [], pagination: { total: 0 } };
        },
      } as any,
    );
    const query = {
      page: 2,
      pageSize: 20,
      inactiveMode: true,
      stringifiedFilterRoles: '[{"field":"display_name","value":"A"}]',
    };
    await controller.customers(query as any, 'overdue', { ability });
    expect(rows).toHaveBeenCalledWith(ability);
    expect(received).toEqual(expect.objectContaining(query));
    const whereIn = jest.fn();
    received.filterQuery({ whereIn });
    expect(whereIn).toHaveBeenCalledWith('contacts.id', [60]);
  });
});
