import React from 'react';
import moment from 'moment';
import styled from 'styled-components';
import { getReportRowTestId } from '../reportTestIds';
import { useARAgingSummaryContext } from './ARAgingSummaryProvider';
import { useARAgingSummaryColumns } from './components';
import { ReportDataTable, FinancialSheet } from '@/components';
import { TableStyle } from '@/constants';
import { tableRowTypesToClassnames } from '@/utils';

interface ARAgingSummaryTableProps {
  organizationName: string;
}

export function ARAgingSummaryTable({
  organizationName,
}: ARAgingSummaryTableProps) {
  const { ARAgingSummary } = useARAgingSummaryContext();

  const columns = useARAgingSummaryColumns();
  const table = (ARAgingSummary as any)?.table;
  const meta = (ARAgingSummary as any)?.meta;
  const asDate = (ARAgingSummary as any)?.query?.asDate;
  const dateText =
    asDate && moment(asDate).isValid()
      ? `As of ${moment(asDate).format('MMMM D, YYYY')}`
      : (meta?.formattedDateRange ?? meta?.formattedAsDate)?.replace(
          /^As\b(?! of\b)/,
          'As of',
        );

  return (
    <FinancialSheet
      className="quickbooks-report-paper"
      companyName={organizationName}
      sheetType="Accounts receivable aging summary"
      dateText={dateText}
    >
      <ARAgingSummaryDataTable
        columns={columns}
        data={table?.rows ?? []}
        rowClassNames={tableRowTypesToClassnames}
        rowTestId={getReportRowTestId('ar-aging')}
        noInitialFetch={true}
        sticky={true}
        styleName={TableStyle.Constrant}
      />
    </FinancialSheet>
  );
}

const ARAgingSummaryDataTable = styled(ReportDataTable)`
  --color-table-text-color: #252a31;
  --color-table-total-text-color: #000;
  --color-table-total-border-top: #bbb;

  .bp4-dark & {
    --color-table-text-color: var(--color-light-gray1);
    --color-table-total-text-color: var(--color-light-gray4);
    --color-table-total-border-top: var(--color-dark-gray5);
  }
  .table {
    .tbody .tr {
      .td {
        border-bottom-width: 0;
        padding-top: 0.32rem;
        padding-bottom: 0.32rem;
      }
      &:not(.no-results) {
        .td {
          border-bottom-width: 0;
          padding-top: 0.4rem;
          padding-bottom: 0.4rem;
        }
        &:not(:first-child) .td {
          border-top: 1px solid transparent;
        }
        &.row_type--total {
          font-weight: 500;

          .td {
            border-top: 1px solid var(--color-table-total-border-top);
            border-bottom-width: 3px;
            border-bottom-style: double;
          }
        }
      }
    }
  }
`;
