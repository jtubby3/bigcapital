import React from 'react';
import moment from 'moment';
import {
  Button,
  Callout,
  Dialog,
  Menu,
  MenuItem,
  Popover,
  Spinner,
} from '@blueprintjs/core';
import { useQuery } from '@tanstack/react-query';
import { useHistory, useLocation, Link } from 'react-router-dom';
import { rawRequest } from '@bigcapital/sdk-ts';
import { FinancialSheet, AppToaster } from '@/components';
import { useAbilityContext } from '@/hooks';
import { useApiFetcher } from '@/hooks/useRequest';
import {
  useAuthOrganizationId,
  useAuthToken,
  useAuthUserId,
} from '@/hooks/state';
import { useCurrentOrganizationName } from '@/hooks/query';
import { downloadFile } from '@/hooks/useDownloadFile';
import { AbilitySubject, ReportsAction } from '@/constants/abilityOption';
import { FinancialReportPage } from '../FinancialReportPage';
import {
  CustomerReport,
  CustomerReportColumn,
  CustomerReportRow,
  CustomerReportType,
  sortCustomerReportRows,
  visibleCustomerReportRows,
} from './model';
import './CustomerSalesReport.scss';

const titles: Record<CustomerReportType, string> = {
  summary: 'Sales by Customer Summary',
  detail: 'Sales by Customer Detail',
  income: 'Income by Customer Summary',
};
const exportTypes = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function presetDates(preset: string) {
  const today = moment();
  if (preset === 'last-month') {
    const month = today.clone().subtract(1, 'month');
    return {
      fromDate: month.clone().startOf('month').format('YYYY-MM-DD'),
      toDate: month.endOf('month').format('YYYY-MM-DD'),
    };
  }
  if (preset === 'last-year') {
    const year = today.clone().subtract(1, 'year');
    return {
      fromDate: year.clone().startOf('year').format('YYYY-MM-DD'),
      toDate: year.endOf('year').format('YYYY-MM-DD'),
    };
  }
  return {
    fromDate: today
      .clone()
      .startOf(preset === 'year' ? 'year' : 'month')
      .format('YYYY-MM-DD'),
    toDate: today.format('YYYY-MM-DD'),
  };
}

export function CustomerSalesReport() {
  const location = useLocation();
  const history = useHistory();
  const reportType: CustomerReportType = location.pathname.includes('income-by')
    ? 'income'
    : location.pathname.endsWith('-detail')
      ? 'detail'
      : 'summary';
  const params = new URLSearchParams(location.search);
  const defaults = presetDates(reportType === 'income' ? 'year' : 'month');
  const fromDate = params.get('fromDate') ?? defaults.fromDate;
  const toDate = params.get('toDate') ?? defaults.toDate;
  const basis = params.get('basis') ?? 'accrual';
  const [draft, setDraft] = React.useState({
    fromDate,
    toDate,
    basis,
    preset:
      params.get('preset') ??
      (location.search ? 'custom' : reportType === 'income' ? 'year' : 'month'),
  });
  const [sort, setSort] = React.useState({ key: 'customer', desc: false });
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [exporting, setExporting] = React.useState(false);
  const [pdf, setPdf] = React.useState<{ url: string; blob: Blob } | null>(
    null,
  );
  const ability = useAbilityContext();
  const canRead = ability.can(
    ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
    AbilitySubject.Report,
  );
  const organizationId = useAuthOrganizationId();
  const userId = useAuthUserId();
  const token = useAuthToken();
  const organizationName = useCurrentOrganizationName();
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const validDates =
    moment(fromDate, 'YYYY-MM-DD', true).isValid() &&
    moment(toDate, 'YYYY-MM-DD', true).isValid() &&
    fromDate <= toDate;
  const validBasis = basis === 'cash' || basis === 'accrual';
  const queryString = new URLSearchParams({
    report_type: reportType,
    from_date: fromDate,
    to_date: toDate,
    basis,
  }).toString();
  const endpoint = `/api/reports/customer-sales?${queryString}`;
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [
      'customer-sales',
      organizationId,
      userId,
      reportType,
      fromDate,
      toDate,
      basis,
    ],
    queryFn: () => rawRequest<CustomerReport>(fetcher, 'GET', endpoint),
    enabled: canRead && validDates && validBasis,
    retry: false,
  });

  React.useEffect(() => {
    setDraft({
      fromDate,
      toDate,
      basis,
      preset:
        params.get('preset') ??
        (location.search
          ? 'custom'
          : reportType === 'income'
            ? 'year'
            : 'month'),
    });
    setSort({ key: 'customer', desc: false });
    setCollapsed(new Set());
  }, [fromDate, toDate, basis, reportType, location.search]);
  React.useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    },
    [pdf],
  );

  const rows = React.useMemo(
    () =>
      data
        ? visibleCustomerReportRows(
            sortCustomerReportRows(
              data.rows,
              sort.key,
              sort.desc,
              reportType === 'detail',
            ),
            collapsed,
          )
        : [],
    [data, sort, collapsed, reportType],
  );
  const columns =
    data?.columns.filter(
      (column) => reportType !== 'detail' || column.key !== 'customer',
    ) ?? [];
  const draftValid =
    moment(draft.fromDate, 'YYYY-MM-DD', true).isValid() &&
    moment(draft.toDate, 'YYYY-MM-DD', true).isValid() &&
    draft.fromDate <= draft.toDate &&
    ['cash', 'accrual'].includes(draft.basis);
  const filename = titles[reportType].toLowerCase().replace(/ /g, '_');

  const runReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftValid) return;
    const search = new URLSearchParams({
      fromDate: draft.fromDate,
      toDate: draft.toDate,
      basis: draft.basis,
      preset: draft.preset,
    }).toString();
    if (search === location.search.slice(1)) void refetch();
    else history.replace({ pathname: location.pathname, search });
  };
  const exportReport = async (type: keyof typeof exportTypes) => {
    setExporting(true);
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: exportTypes[type],
          Authorization: `Bearer ${token}`,
          'organization-id': String(organizationId),
        },
      });
      if (!response.ok) throw new Error('Report export failed');
      const blob = await response.blob();
      if (type === 'pdf') setPdf({ url: URL.createObjectURL(blob), blob });
      else downloadFile(blob, `${filename}.${type}`, exportTypes[type]);
    } catch {
      AppToaster.show({
        intent: 'danger',
        message: 'Could not export this report. Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };
  const renderCell = (
    column: CustomerReportColumn,
    row: CustomerReportRow,
    index: number,
  ) => {
    const value =
      index === 0 && (row.kind === 'subtotal' || row.kind === 'total')
        ? (row.cells.customer ?? row.cells[column.key])
        : row.cells[column.key];
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
      const total = row.kind === 'subtotal' || row.kind === 'total';
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...(total && column.kind === 'money'
          ? { style: 'currency', currency: data?.meta.currencyCode ?? 'USD' }
          : {}),
      }).format(value);
    }
    return value;
  };

  if (!canRead)
    return (
      <FinancialReportPage name="customer-sales">
        <Callout intent="warning">
          You do not have permission to view customer reports.
        </Callout>
      </FinancialReportPage>
    );

  return (
    <FinancialReportPage name="customer-sales">
      <div className="customer-sales-report">
        <Link className="customer-sales-report__back" to="/financial-reports">
          ‹ Back to reports
        </Link>
        <form className="customer-sales-report__controls" onSubmit={runReport}>
          <label>
            Report period
            <select
              className="bp4-input"
              value={draft.preset}
              onChange={(event) => {
                const preset = event.target.value;
                setDraft((current) => ({
                  ...current,
                  preset,
                  ...(preset === 'custom' ? {} : presetDates(preset)),
                }));
              }}
            >
              <option value="month">This month to date</option>
              <option value="year">This year to date</option>
              <option value="last-month">Last month</option>
              <option value="last-year">Last year</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            From
            <input
              className="bp4-input"
              aria-label="From"
              type="date"
              required
              value={draft.fromDate}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  fromDate: event.target.value,
                  preset: 'custom',
                })
              }
            />
          </label>
          <label>
            To
            <input
              className="bp4-input"
              aria-label="To"
              type="date"
              required
              value={draft.toDate}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  toDate: event.target.value,
                  preset: 'custom',
                })
              }
            />
          </label>
          <div>
            <span className="customer-sales-report__label">
              Accounting method
            </span>
            <div
              role="group"
              aria-label="Accounting method"
              className="bp4-button-group"
            >
              <Button
                type="button"
                text="Cash"
                active={draft.basis === 'cash'}
                aria-pressed={draft.basis === 'cash'}
                onClick={() => setDraft({ ...draft, basis: 'cash' })}
              />
              <Button
                type="button"
                text="Accrual"
                active={draft.basis === 'accrual'}
                aria-pressed={draft.basis === 'accrual'}
                onClick={() => setDraft({ ...draft, basis: 'accrual' })}
              />
            </div>
          </div>
          <Button
            type="submit"
            intent="primary"
            disabled={!draftValid}
            loading={isFetching}
            text="Run report"
          />
        </form>
        {!draftValid && (
          <Callout intent="warning">
            Choose valid dates with From on or before To, and Cash or Accrual
            accounting.
          </Callout>
        )}
        {(!validDates || !validBasis) && (
          <Callout intent="warning">
            This report link has invalid filters. Choose a valid period and run
            the report.
          </Callout>
        )}
        {isError && (
          <Callout intent="danger" title="Could not load report">
            <p>
              Please try again. If this continues, check your report
              permissions.
            </p>
            <Button onClick={() => void refetch()} text="Retry" />
          </Callout>
        )}
        {isLoading && validDates && validBasis && (
          <div className="customer-sales-report__loading" role="status">
            <Spinner size={24} />
            Loading report…
          </div>
        )}
        {data && !isError && validDates && validBasis && (
          <>
            {data.warnings.map((warning, index) => (
              <Callout
                key={index}
                intent="warning"
                className="customer-sales-report__warning"
              >
                {warning}
              </Callout>
            ))}
            <FinancialSheet
              className={`quickbooks-report-paper customer-report-paper${reportType === 'detail' ? ' customer-report-paper--detail' : ''}`}
              companyName={organizationName}
              sheetType={data.meta.title}
              dateText={data.meta.formattedDateRange}
              basis={data.meta.basis}
            >
              <div className="customer-sales-report__sheet-actions">
                <Button
                  minimal
                  icon="refresh"
                  title="Refresh report"
                  aria-label="Refresh report"
                  loading={isFetching}
                  onClick={() => void refetch()}
                />
                <Button
                  minimal
                  icon="print"
                  text="Print / PDF"
                  disabled={exporting}
                  onClick={() => void exportReport('pdf')}
                />
                <Popover
                  minimal
                  placement="bottom-end"
                  content={
                    <Menu>
                      <MenuItem
                        text="Excel (.xlsx)"
                        onClick={() => void exportReport('xlsx')}
                      />
                      <MenuItem
                        text="CSV"
                        onClick={() => void exportReport('csv')}
                      />
                    </Menu>
                  }
                >
                  <Button
                    minimal
                    icon="export"
                    text="Export"
                    disabled={exporting}
                  />
                </Popover>
              </div>
              <div
                className="customer-sales-report__table-scroll"
                tabIndex={0}
                aria-label="Report table"
              >
                <table className="customer-sales-report__table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className={column.kind !== 'text' ? 'is-number' : ''}
                          aria-sort={
                            reportType !== 'detail' && sort.key === column.key
                              ? sort.desc
                                ? 'descending'
                                : 'ascending'
                              : undefined
                          }
                        >
                          {reportType !== 'detail' ? (
                            <button
                              onClick={() =>
                                setSort({
                                  key: column.key,
                                  desc:
                                    sort.key === column.key
                                      ? !sort.desc
                                      : false,
                                })
                              }
                            >
                              {column.label}
                              <span aria-hidden="true">
                                {sort.key === column.key
                                  ? sort.desc
                                    ? ' ↓'
                                    : ' ↑'
                                  : ' ↕'}
                              </span>
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!data.rows.some(
                      (row) => row.kind === 'detail' || row.kind === 'customer',
                    ) && (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="customer-sales-report__empty"
                        >
                          No transactions for this period.
                        </td>
                      </tr>
                    )}
                    {rows.map((row) =>
                      row.kind === 'customer' && reportType === 'detail' ? (
                        <tr
                          key={row.id}
                          className="customer-sales-report__group"
                        >
                          <th colSpan={columns.length} scope="rowgroup">
                            <button
                              aria-expanded={!collapsed.has(row.id)}
                              onClick={() =>
                                setCollapsed((current) => {
                                  const next = new Set(current);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                })
                              }
                            >
                              <span aria-hidden="true">
                                {collapsed.has(row.id) ? '›' : '⌄'}
                              </span>{' '}
                              {row.cells.customer}
                            </button>
                          </th>
                        </tr>
                      ) : (
                        <tr
                          key={row.id}
                          className={`customer-sales-report__row customer-sales-report__row--${row.kind}`}
                        >
                          {columns.map((column, index) => (
                            <td
                              key={column.key}
                              className={
                                column.kind !== 'text' ? 'is-number' : ''
                              }
                            >
                              {renderCell(column, row, index)}
                            </td>
                          ))}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </FinancialSheet>
          </>
        )}
      </div>
      <Dialog
        isOpen={pdf !== null}
        onClose={() => setPdf(null)}
        title={`${titles[reportType]} · Print / PDF`}
        style={{ width: '95vw', maxWidth: 1200 }}
      >
        {pdf && (
          <div className="customer-report-pdf">
            <iframe title="Report PDF preview" src={pdf.url} />
            <div>
              <Button
                icon="download"
                text="Download PDF"
                onClick={() =>
                  downloadFile(pdf.blob, `${filename}.pdf`, 'application/pdf')
                }
              />
            </div>
          </div>
        )}
      </Dialog>
    </FinancialReportPage>
  );
}
