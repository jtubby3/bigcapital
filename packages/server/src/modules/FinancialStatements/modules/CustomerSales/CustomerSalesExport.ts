import { Injectable } from '@nestjs/common';
import { escape } from 'lodash';
import { formatNumber } from '@/utils/format-number';
import * as xlsx from 'xlsx';
import { QuickBooksReportPdfCss } from '@/modules/FinancialStatements/common/QuickBooksReportPdfCss';
import { TableSheet } from '@/modules/FinancialStatements/common/TableSheet';
import { TableSheetPdf } from '@/modules/FinancialStatements/common/TableSheetPdf';
import { ITableData } from '@/modules/FinancialStatements/types/Table.types';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { CustomerSalesReport } from './CustomerSales.types';

export function customerSalesTable(
  report: CustomerSalesReport,
  pdf = false,
): ITableData {
  const text = (value: string) =>
    pdf ? escape(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const detailPdf =
    pdf && report.columns.some((column) => column.key === 'date');
  const columns = detailPdf
    ? report.columns.filter((column) => column.key !== 'customer')
    : report.columns;
  const rows: ITableData['rows'] = report.rows.map((row) => ({
    id: row.id,
    rowTypes: [
      pdf &&
      row.kind === 'customer' &&
      Object.values(row.cells).some((value) => typeof value === 'number')
        ? 'detail'
        : row.kind,
    ],
    cells: columns.map((column, index) => {
      const value =
        detailPdf && row.kind !== 'detail' && index === 0
          ? row.cells.customer
          : row.cells[column.key];
      if (pdf && typeof value === 'number') {
        return {
          key: column.key,
          value: formatNumber(value, {
            precision: 2,
            currencyCode: report.meta.currencyCode,
            money:
              column.kind === 'money' &&
              ['subtotal', 'total'].includes(row.kind),
          }),
        };
      }
      return {
        key: column.key,
        value:
          value === null || value === undefined
            ? ''
            : typeof value === 'number'
              ? column.kind === 'money'
                ? value.toFixed(2)
                : String(value)
              : text(value),
      };
    }),
  }));
  if (!pdf)
    for (const [index, note] of [
      `${report.meta.title} | ${report.meta.formattedDateRange} | ${report.meta.basis} basis | ${report.meta.currencyCode}`,
      ...report.warnings,
    ].entries()) {
      rows.push({
        id: `note-${index}`,
        rowTypes: ['note'],
        cells: report.columns.map((column, i) => ({
          key: column.key,
          value: i ? '' : text(note),
        })),
      });
    }
  return {
    columns: columns.map(({ key, label }) => ({ key, label })),
    rows,
  };
}

@Injectable()
export class CustomerSalesExport {
  constructor(
    private readonly pdfTable: TableSheetPdf,
    private readonly tenancyContext: TenancyContext,
  ) {}

  csv(report: CustomerSalesReport): string {
    return new TableSheet(customerSalesTable(report)).convertToCSV();
  }

  xlsx(report: CustomerSalesReport): Buffer {
    const sheet = new TableSheet(customerSalesTable(report));
    const workbook = sheet.convertToXLSX();
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    // TableSheet flattens cells as text; retain numbers for spreadsheet calculations.
    report.rows.forEach((row, rowIndex) => {
      report.columns.forEach((column, columnIndex) => {
        const value = row.cells[column.key];
        if (typeof value === 'number' && column.kind !== 'text') {
          worksheet[
            xlsx.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })
          ] = {
            t: 'n',
            v: value,
            z: column.kind === 'money' ? '#,##0.00' : '0.######',
          };
        }
      });
    });
    return sheet.convertToBuffer(workbook, 'xlsx');
  }

  async pdf(report: CustomerSalesReport): Promise<Buffer> {
    const metadata = await this.tenancyContext.getTenantMetadata();
    const numericColumns = report.columns
      .filter((column) => column.kind !== 'text')
      .map(
        (column) =>
          `table .column--${column.key}, table .cell--${column.key} { text-align: right; }`,
      )
      .join('\n');
    return this.pdfTable.convertToPdf(
      customerSalesTable(report, true),
      metadata.name,
      report.meta.title,
      `${report.meta.formattedDateRange} | ${report.meta.basis} basis | ${report.meta.currencyCode}${report.warnings.length ? '\n' + report.warnings.join('\n') : ''}`,
      `${QuickBooksReportPdfCss}\n #root > div > div > div:first-of-type > div:last-of-type { white-space: pre-line; font-size: 10px; line-height: 1.4; }\n${numericColumns}\n table { font-size: 10px; } table tr.row-type--customer td { background: #edf4ff; font-weight: 600; } table tr.row-type--subtotal td, table tr.row-type--total td { font-weight: 700; border-top: 1px solid #0052cc; } table tr.row-type--note td { font-size: 9px; color: #555; white-space: normal; }`,
    );
  }
}
