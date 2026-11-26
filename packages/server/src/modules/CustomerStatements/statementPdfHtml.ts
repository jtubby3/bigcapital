import { StatementLine, StatementSnapshot } from './CustomerStatements.types';

const escapeHtml = (value: string): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

const previousCalendarDay = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

const paymentLink = (line: StatementLine, enabled: boolean): string => {
  if (
    !enabled ||
    !line.paymentUrl ||
    /[\s\u0000-\u001f\u007f]/.test(line.paymentUrl)
  ) {
    return '';
  }
  try {
    const url = new URL(line.paymentUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return '';
    }
    return `<a class="payment-link" href="${escapeHtml(url.href)}" rel="noopener noreferrer">Pay invoice</a>`;
  } catch {
    return '';
  }
};

const renderStatement = (statement: StatementSnapshot): string => {
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: statement.currencyCode,
    currencyDisplay: 'code',
  });
  const amount = (value: number) => escapeHtml(money.format(value));
  const openItem = statement.statementType === 'open-item';
  const balanceForward = statement.statementType === 'balance-forward';
  const cashReceived =
    statement.statementType === 'transaction' &&
    statement.transactionPresentation === 'invoice-receipts';
  const title = openItem
    ? 'Open Item'
    : balanceForward
      ? 'Balance Forward'
      : 'Transaction Statement';
  const monetaryHeaders = openItem
    ? ['Original amount', 'Open amount']
    : balanceForward
      ? ['Charges', 'Payments', 'Running balance']
      : cashReceived
        ? ['Amount', 'Received']
        : ['Charges', 'Payments'];
  const rows = statement.lines
    .map((line) => {
      const amounts = openItem
        ? [line.originalAmount ?? line.debit, line.openAmount ?? line.balance]
        : [line.debit, line.credit, ...(balanceForward ? [line.balance] : [])];
      return `<tr>
      <td>${escapeHtml(line.date)}</td>
      <td><span class="transaction-type">${escapeHtml(line.type)}</span><br>${escapeHtml(line.number)}</td>
      <td class="description">${escapeHtml(line.description)}${paymentLink(line, statement.includePaymentLinks)}</td>
      ${amounts.map((value) => `<td class="amount">${amount(value)}</td>`).join('')}
    </tr>`;
    })
    .join('');
  const openingRow = balanceForward
    ? `<tr class="opening-row"><td>${escapeHtml(previousCalendarDay(statement.fromDate))}</td><td colspan="2">Balance forward</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${amount(statement.openingBalance)}</td></tr>`
    : '';
  const summary = (label: string, value: number, emphasis = false) =>
    `<div class="summary-row${emphasis ? ' summary-total' : ''}"><dt>${label}</dt><dd>${amount(value)}</dd></div>`;
  const totals = openItem
    ? summary('Amount due', statement.closingBalance, true)
    : [
        ...(balanceForward
          ? [summary('Beginning balance', statement.openingBalance)]
          : []),
        summary(
          cashReceived ? 'Total amount' : 'Total charges',
          statement.totalCharges,
        ),
        summary(
          cashReceived ? 'Total received' : 'Total payments',
          statement.totalPayments,
        ),
        ...(balanceForward
          ? [summary('Amount due', statement.closingBalance, true)]
          : []),
      ].join('');

  return `<section class="statement">
    <header class="statement-header">
      <div class="company">${escapeHtml(statement.organizationName)}</div>
      <div class="statement-title"><h1>Statement</h1><p>${title}</p></div>
    </header>
    <div class="statement-details">
      <div class="recipient"><div class="label">Bill to</div>
        <h2>${escapeHtml(statement.customerName)}</h2>
        <div class="address">${escapeHtml(statement.billingAddress)}</div>
        <div>${escapeHtml(statement.email)}</div>
      </div>
      <dl class="dates">
        <div><dt>Statement date</dt><dd>${escapeHtml(statement.statementDate)}</dd></div>
        <div><dt>${openItem ? 'As of' : 'Period'}</dt><dd>${openItem ? escapeHtml(statement.toDate) : `${escapeHtml(statement.fromDate)} to ${escapeHtml(statement.toDate)}`}</dd></div>
        <div><dt>Currency</dt><dd>${escapeHtml(statement.currencyCode)}</dd></div>
      </dl>
    </div>
    <table class="statement-table">
      <colgroup><col class="date-column"><col class="transaction-column"><col>${monetaryHeaders.map(() => '<col class="amount-column">').join('')}</colgroup>
      <thead><tr><th scope="col">Date</th><th scope="col">Transaction</th><th scope="col">Description</th>${monetaryHeaders.map((label) => `<th scope="col" class="amount">${label}</th>`).join('')}</tr></thead>
      <tbody>${openingRow}${rows || `<tr><td class="empty" colspan="${3 + monetaryHeaders.length}">${openItem ? 'No open items as of this date.' : 'No transactions in this period.'}</td></tr>`}</tbody>
    </table>
    <dl class="summary">${totals}</dl>
  </section>`;
};

export const statementPdfHtml = (
  snapshots: StatementSnapshot[],
): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Customer statements</title>
<style>
  @page { size: Letter portrait; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #172b4d; font: 11px/1.5 Arial, sans-serif; }
  .statement + .statement { break-before: page; page-break-before: always; }
  .statement-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #2463a6; padding: 0 0 18px; break-inside: avoid; }
  .company { font-size: 18px; font-weight: 700; max-width: 60%; overflow-wrap: anywhere; }
  .statement-title { text-align: right; }
  h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 500; }
  .statement-title p { margin: 5px 0 0; color: #2463a6; }
  .statement-details { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
  .recipient { max-width: 52%; overflow-wrap: anywhere; }
  .label, .dates dt { color: #596a80; }
  .label { text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
  h2 { font-size: 14px; margin: 3px 0 6px; }
  .address, .description { white-space: pre-wrap; }
  .dates { margin: 0; text-align: right; max-width: 48%; overflow-wrap: anywhere; }
  .dates div { margin-bottom: 7px; }
  .dates dt, .dates dd { display: inline; margin: 0; }
  .dates dt { margin-right: 10px; }
  .statement-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .date-column { width: 12%; }
  .transaction-column { width: 15%; }
  .amount-column { width: 16%; }
  thead { display: table-header-group; }
  th { color: #fff; background: #183b62; text-align: left; font-weight: 600; }
  th, td { padding: 9px 7px; vertical-align: top; overflow-wrap: anywhere; }
  td { border-bottom: 1px solid #dce3ed; color: #263b55; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .transaction-type { color: #596a80; font-size: 10px; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; }
  td.amount { font-size: 10px; }
  .payment-link { display: block; margin-top: 5px; color: #2463a6; text-decoration: underline; white-space: normal; }
  .empty { padding: 24px 7px; text-align: center; color: #596a80; }
  .summary { width: 48%; margin: 22px 0 0 auto; break-inside: avoid; page-break-inside: avoid; }
  .summary-row { display: flex; justify-content: space-between; gap: 16px; padding: 5px 7px; }
  .summary dt, .summary dd { margin: 0; }
  .summary dd { text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .summary-total { border-top: 2px solid #2463a6; margin-top: 5px; padding-top: 10px; color: #183b62; font-size: 14px; font-weight: 700; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${snapshots.map(renderStatement).join('')}</body></html>`;
