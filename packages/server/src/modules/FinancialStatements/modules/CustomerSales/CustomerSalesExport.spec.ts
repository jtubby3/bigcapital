import { TableSheet } from '@/modules/FinancialStatements/common/TableSheet';
import { CustomerSalesExport, customerSalesTable } from './CustomerSalesExport';
import * as xlsx from 'xlsx';

const report: any = {
  meta: {
    title: 'Sales by Customer Summary',
    basis: 'cash',
    currencyCode: 'USD',
    formattedDateRange: 'Jan 1 – Dec 31',
  },
  columns: [
    { key: 'customer', label: 'Customer', kind: 'text' },
    { key: 'total', label: 'Total', kind: 'money' },
  ],
  rows: [
    {
      id: 'subtotal-7',
      kind: 'customer',
      cells: { customer: '<script>=1</script>', total: -10.5 },
    },
    { id: 'total', kind: 'total', cells: { customer: 'TOTAL', total: -10.5 } },
  ],
  warnings: ['Unassigned expenses included'],
};
describe('customer sales exports', () => {
  it('groups PDF money with currency totals and two-decimal quantities without changing spreadsheet values', () => {
    const data = {
      ...report,
      columns: [
        report.columns[0],
        { key: 'quantity', label: 'Quantity', kind: 'number' },
        report.columns[1],
      ],
      rows: [
        {
          id: 'customer-7',
          kind: 'customer',
          cells: { customer: 'Acme', quantity: 3, total: 8102 },
        },
        {
          id: 'subtotal-7',
          kind: 'subtotal',
          cells: { customer: 'Total Acme', total: 8102 },
        },
        {
          id: 'total',
          kind: 'total',
          cells: { customer: 'TOTAL', total: 8102 },
        },
      ],
    };
    const pdf = customerSalesTable(data, true);
    expect(pdf.rows[0].cells.map((cell) => cell.value)).toEqual([
      'Acme',
      '3.00',
      '8,102.00',
    ]);
    expect(pdf.rows[1].cells[2].value).toBe('$8,102.00');
    expect(pdf.rows[2].cells[2].value).toBe('$8,102.00');
    expect(
      customerSalesTable(data).rows[0].cells.map((cell) => cell.value),
    ).toEqual(['Acme', '3', '8102.00']);
  });

  it('writes numeric workbook cells so spreadsheet SUM works without converting text', () => {
    const exporter = new CustomerSalesExport({} as any, {} as any);
    const buffer = exporter.xlsx(report);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet.B2).toMatchObject({ t: 'n', v: -10.5 });
    expect(sheet.B3).toMatchObject({ t: 'n', v: -10.5 });
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    expect(rows.slice(1, 3).reduce((sum, row) => sum + row[1], 0)).toBe(-21);
  });

  it('prints numeric summary customer rows as ordinary rows', () => {
    expect(customerSalesTable(report, true).rows[0].rowTypes).toEqual([
      'detail',
    ]);
  });
  it('prints detail group labels once in the date column and keeps customer columns in spreadsheets', () => {
    const detail = {
      ...report,
      columns: [
        report.columns[0],
        { key: 'date', label: 'Date', kind: 'text' },
        { key: 'amount', label: 'Amount', kind: 'money' },
      ],
      rows: [
        { id: 'customer-7', kind: 'customer', cells: { customer: 'Acme' } },
        {
          id: 'line',
          kind: 'detail',
          cells: { customer: 'Acme', date: '2026-02-01', amount: 10 },
        },
        {
          id: 'total',
          kind: 'total',
          cells: { customer: 'TOTAL', amount: 10 },
        },
      ],
    };
    const pdf = customerSalesTable(detail, true);
    expect(pdf.columns.map((column) => column.key)).toEqual(['date', 'amount']);
    expect(pdf.rows.map((row) => row.cells[0].value)).toEqual([
      'Acme',
      '2026-02-01',
      'TOTAL',
    ]);
    expect(customerSalesTable(detail).columns[0].key).toBe('customer');
  });
  it('prints warning notes across the header width rather than in a narrow table cell', async () => {
    let captured: any[];
    const exporter = new CustomerSalesExport(
      {
        convertToPdf: async (...args) => {
          captured = args;
          return Buffer.from('pdf');
        },
      } as any,
      { getTenantMetadata: async () => ({ name: 'Company' }) } as any,
    );
    await exporter.pdf(report);
    expect(captured[3]).toContain('Unassigned expenses included');
    expect(
      captured[0].rows.every((row) => !row.rowTypes.includes('note')),
    ).toBe(true);
  });

  it('keeps the posted totals, period, accounting basis and warnings in CSV', () => {
    const csv = new TableSheet(customerSalesTable(report)).convertToCSV();
    expect(csv).toContain('TOTAL,-10.50');
    expect(csv).toContain('Jan 1 – Dec 31');
    expect(csv).toContain('cash');
    expect(csv).toContain('Unassigned expenses included');
  });
  it('escapes untrusted HTML before using the financial PDF template', () => {
    expect(customerSalesTable(report, true).rows[0].cells[0].value).toBe(
      '&lt;script&gt;=1&lt;/script&gt;',
    );
  });
  it('neutralizes spreadsheet formulas in text while retaining negative money values', () => {
    const result = customerSalesTable({
      ...report,
      rows: [
        { id: 'x', kind: 'detail', cells: { customer: '=1+1', total: -10.5 } },
      ],
    });
    expect(result.rows[0].cells.map((c) => c.value)).toEqual([
      "'=1+1",
      '-10.50',
    ]);
  });
});
