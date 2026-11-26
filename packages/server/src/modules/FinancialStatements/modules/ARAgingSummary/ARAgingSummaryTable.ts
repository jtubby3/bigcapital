import { IARAgingSummaryData } from './ARAgingSummary.types';
import { AgingSummaryTable } from '../AgingSummary/AgingSummaryTable';
import {
  IAgingSummaryQuery,
  IAgingSummaryTotal,
} from '../AgingSummary/AgingSummary.types';
import {
  IColumnMapperMeta,
  ITableColumn,
  ITableColumnAccessor,
  ITableRow,
} from '../../types/Table.types';

export class ARAgingSummaryTable extends AgingSummaryTable {
  readonly report: IARAgingSummaryData;

  /**
   * Constructor method.
   * @param {IARAgingSummaryData} data
   * @param {IAgingSummaryQuery} query
   * @param {any} i18n
   */
  constructor(data: IARAgingSummaryData, query: IAgingSummaryQuery, i18n: any) {
    super(data, query, i18n);
  }

  /**
   * Retrieves the contacts table rows.
   * @returns {ITableRow[]}
   */
  get contactsRows(): ITableRow[] {
    return this.contactsNodes(this.report.customers);
  }

  /**
   * Contact name node accessor.
   * @returns {ITableColumnAccessor}
   */
  get contactNameNodeAccessor(): ITableColumnAccessor {
    return { key: 'customer_name', accessor: 'customerName' };
  }

  protected agingTableColumns = (): ITableColumn[] =>
    this.agingPeriods.map((period) => ({
      key: 'aging_period',
      // Due-today invoices are Current; overdue data starts at one day.
      label: period.toDays
        ? `${Math.max(1, period.beforeDays)}–${period.toDays}`
        : `${Math.max(1, period.beforeDays)} ${this.i18n.t('aging_summary.and_over')}`,
    }));

  protected totalNodeAccessors = (
    node: IAgingSummaryTotal,
  ): IColumnMapperMeta[] => [
    { key: 'customer_name', value: 'TOTAL' },
    { key: 'current', accessor: 'current.formattedAmount' },
    ...this.agingNodeAccessors(node),
    { key: 'total', accessor: 'total.formattedAmount' },
  ];
}
