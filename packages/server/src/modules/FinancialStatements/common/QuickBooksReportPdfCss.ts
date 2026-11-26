// Shared by the selected financial and customer reports only.
export const QuickBooksReportPdfCss = `
body { background: #fff; color: #202428; font-family: Arial, Helvetica, sans-serif; }
#root > div { font-size: 13px; line-height: 1.4; }
#root > div > div > div:first-of-type { text-align: center; margin-bottom: 20px; }
#root > div > div > div:first-of-type > div { font-size: 14px; font-weight: 400; }
#root > div > div > div:first-of-type > div:first-of-type { font-size: 20px; font-weight: 700; color: #0052cc; }
table { font-size: 13px; border-top: 1px solid #c6d7ed; }
table thead th { background: #edf4ff; color: #1f3255; font-size: 12px; font-weight: 600; padding: 7px 8px; border-bottom: 1px solid #c6d7ed; }
table tbody tr td { padding: 4px 8px; font-variant-numeric: tabular-nums; }
table tr.row-type--aggregate td,
table tr.row-type--accounts td,
table tr.row-type--customer td { background: #edf4ff; font-weight: 600; }
table tr.row-type--total td,
table tr.row-type--subtotal td { font-weight: 700; border-top: 1px solid #0052cc; }
table tr { break-inside: avoid; }
thead { display: table-header-group; }
`;
