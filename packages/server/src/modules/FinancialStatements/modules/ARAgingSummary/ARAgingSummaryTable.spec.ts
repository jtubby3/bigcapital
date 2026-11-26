import { IAgingSummaryQuery } from '../AgingSummary/AgingSummary.types';
import { ARAgingSummaryTable } from './ARAgingSummaryTable';
import { getARAgingSummaryDefaultQuery } from './utils';

const i18n = {
  t: (key: string) =>
    ({
      'aging_summary.customer_name': 'Customer',
      'aging_summary.current': 'Current',
      'aging_summary.total': 'Total',
      'aging_summary.and_over': 'and over',
    })[key],
};

const amount = (value: string) => ({
  amount: Number(value),
  formattedAmount: value,
  currencyCode: 'USD',
});

const report = {
  customers: [
    {
      customerName: 'Customer A',
      current: amount('10.00'),
      aging: ['20.00', '30.00', '40.00', '50.00'].map((value) => ({
        total: amount(value),
      })),
      total: amount('150.00'),
    },
  ],
  total: {
    current: amount('10.00'),
    aging: ['20.00', '30.00', '40.00', '50.00'].map((value) => ({
      total: amount(value),
    })),
    total: amount('150.00'),
  },
};

describe('A/R aging summary table', () => {
  it('exports four overdue buckets by default with current and a labeled total', () => {
    const table = new ARAgingSummaryTable(
      report as any,
      getARAgingSummaryDefaultQuery() as IAgingSummaryQuery,
      i18n,
    );

    expect(table.tableColumns().map((column) => column.label)).toEqual([
      'Customer',
      'Current',
      '1–30',
      '31–60',
      '61–90',
      '91 and over',
      'Total',
    ]);
    expect(
      table.tableRows().map((row) => row.cells.map((cell) => cell.value)),
    ).toEqual([
      ['Customer A', '10.00', '20.00', '30.00', '40.00', '50.00', '150.00'],
      ['TOTAL', '10.00', '20.00', '30.00', '40.00', '50.00', '150.00'],
    ]);
  });

  it('retains custom bucket lengths and counts without changing supplied amounts', () => {
    const table = new ARAgingSummaryTable(
      {
        customers: [
          {
            ...report.customers[0],
            aging: report.customers[0].aging.slice(0, 2),
          },
        ],
        total: { ...report.total, aging: report.total.aging.slice(0, 2) },
      } as any,
      {
        ...(getARAgingSummaryDefaultQuery() as IAgingSummaryQuery),
        agingDaysBefore: 15,
        agingPeriods: 2,
      },
      i18n,
    );

    expect(table.tableColumns().map((column) => column.label)).toEqual([
      'Customer',
      'Current',
      '1–15',
      '16 and over',
      'Total',
    ]);
    expect(table.tableRows()[1].cells.map((cell) => cell.value)).toEqual([
      'TOTAL',
      '10.00',
      '20.00',
      '30.00',
      '150.00',
    ]);
  });
});
