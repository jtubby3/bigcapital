import { QuickBooksReportPdfCss } from '../../common/QuickBooksReportPdfCss';
import { TableSheetPdf } from '../../common/TableSheetPdf';
import { IProfitLossSheetQuery } from './ProfitLossSheet.types';
import { ProfitLossSheetTableInjectable } from './ProfitLossSheetTableInjectable';
import { HtmlTableCustomCss } from './constants';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProfitLossTablePdfInjectable {
  constructor(
    private readonly profitLossTable: ProfitLossSheetTableInjectable,
    private readonly tableSheetPdf: TableSheetPdf,
  ) {}

  /**
   * Retrieves the profit/loss sheet in pdf format.
   * @param {number} query
   * @returns {Promise<IBalanceSheetTable>}
   */
  public async pdf(query: IProfitLossSheetQuery): Promise<Buffer> {
    const table = await this.profitLossTable.table(query);

    return this.tableSheetPdf.convertToPdf(
      table.table,
      table.meta.organizationName,
      'Profit and Loss',
      `${table.meta.formattedDateRange} · ${table.query.basis === 'cash' ? 'Cash' : 'Accrual'} basis`,
      [HtmlTableCustomCss, QuickBooksReportPdfCss].join('\n'),
      query.numberFormat?.showInRed,
    );
  }
}
