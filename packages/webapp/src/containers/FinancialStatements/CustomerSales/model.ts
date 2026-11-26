export type CustomerReportType = 'summary' | 'detail' | 'income';
export interface CustomerReportColumn {
  key: string;
  label: string;
  kind: 'text' | 'money' | 'number';
}
export interface CustomerReportRow {
  id: string;
  kind: 'detail' | 'customer' | 'subtotal' | 'total';
  customerId?: number;
  referenceId?: number;
  referenceType?: string;
  cells: Record<string, string | number | null>;
}
export interface CustomerReport {
  meta: {
    title: string;
    fromDate: string;
    toDate: string;
    basis: 'cash' | 'accrual';
    currencyCode: string;
    formattedDateRange: string;
  };
  columns: CustomerReportColumn[];
  rows: CustomerReportRow[];
  warnings: string[];
}

export function sortCustomerReportRows(
  rows: CustomerReportRow[],
  key: string,
  desc: boolean,
  grouped = false,
): CustomerReportRow[] {
  const totals = rows.filter((row) => row.kind === 'total');
  const groups: CustomerReportRow[][] = [];
  for (const row of rows) {
    if (row.kind === 'total') continue;
    if (!grouped || row.kind === 'customer' || groups.length === 0) {
      groups.push([row]);
    } else {
      groups[groups.length - 1].push(row);
    }
  }
  groups.sort(([a], [b]) => {
    const left = a.cells[grouped ? 'customer' : key];
    const right = b.cells[grouped ? 'customer' : key];
    const compared =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left ?? '').localeCompare(String(right ?? ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
    return desc ? -compared : compared;
  });
  return [...groups.flat(), ...totals];
}

export function visibleCustomerReportRows(
  rows: CustomerReportRow[],
  collapsed: Set<string>,
): CustomerReportRow[] {
  let hideDetails = false;
  return rows.filter((row) => {
    if (row.kind === 'customer') hideDetails = collapsed.has(row.id);
    return row.kind !== 'detail' || !hideDetails;
  });
}
