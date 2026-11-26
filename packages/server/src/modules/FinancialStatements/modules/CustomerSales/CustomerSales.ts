import * as moment from 'moment';
import { bignumber } from 'mathjs';
import {
  CustomerSalesDocument,
  CustomerSalesEntry,
  CustomerSalesQuery,
  CustomerSalesReport,
  CustomerSalesRow,
} from './CustomerSales.types';

const salesReferences = new Set([
  'SaleInvoice',
  'SaleReceipt',
  'CreditNote',
  'PaymentReceive',
  'RefundCreditNote',
]);
export const customerSalesAccountTypes = [
  'income',
  'other-income',
  'cost-of-goods-sold',
  'expense',
  'other-expense',
];
const incomeTypes = new Set(['income', 'other-income']);
const key = (type: string, id: number) => `${type}:${id}`;
// Ledger amounts already include exchange conversion; never multiply them again.
const amountOf = (entry: CustomerSalesEntry) =>
  Number(
    bignumber(String(entry.credit || 0))
      .minus(String(entry.debit || 0))
      .toFixed(5),
  );
const add = (a: number, b: number) => Number(bignumber(a).plus(b).toFixed(5));
const compare = (a: string | number, b: string | number) =>
  a < b ? -1 : a > b ? 1 : 0;

export function buildCustomerSalesReport(
  query: CustomerSalesQuery,
  entries: CustomerSalesEntry[],
  documents: CustomerSalesDocument[],
  customers: Array<{ id: number; displayName: string }>,
  metadata: { baseCurrency: string; dateFormat?: string },
): CustomerSalesReport {
  const docs = new Map(
    documents.map((doc) => [key(doc.referenceType, doc.referenceId), doc]),
  );
  const names = new Map(
    customers.map((customer) => [customer.id, customer.displayName]),
  );
  const warnings = new Set<string>();
  const groups = new Map<
    number,
    Array<{
      entry: CustomerSalesEntry;
      amount: number;
      doc?: CustomerSalesDocument;
    }>
  >();
  for (const entry of entries) {
    const date = moment(entry.date).format('YYYY-MM-DD');
    if (
      date < query.fromDate ||
      date > query.toDate ||
      (entry.basis && entry.basis !== query.basis)
    )
      continue;
    const doc = docs.get(key(entry.referenceType, entry.referenceId));
    if (doc && !doc.posted) continue;
    const isIncome = incomeTypes.has(entry.account?.accountType);
    if (!customerSalesAccountTypes.includes(entry.account?.accountType))
      continue;
    if (
      query.reportType !== 'income' &&
      (!isIncome || !salesReferences.has(entry.referenceType))
    )
      continue;
    if (
      query.reportType !== 'income' &&
      ['PaymentReceive', 'RefundCreditNote'].includes(entry.referenceType) &&
      entry.basis !== 'cash'
    )
      continue;
    const customerId = names.has(doc?.customerId)
      ? doc.customerId
      : names.has(entry.contactId)
        ? entry.contactId
        : 0;
    if (query.customerIds?.length && !query.customerIds.includes(customerId))
      continue;
    const amount = amountOf(entry);
    if (!amount) continue;
    if (!groups.has(customerId)) groups.set(customerId, []);
    groups.get(customerId).push({ entry, amount, doc });
  }
  if (groups.has(0))
    warnings.add(
      'Unassigned amounts have no customer link and remain included in report totals.',
    );
  if (query.reportType === 'income')
    warnings.add(
      'Profit includes recorded costs only. Costs without a customer link appear as Unassigned.',
    );
  if (query.basis === 'cash')
    warnings.add(
      'Cash basis includes recorded payments and refunds. Transactions without cash entries are excluded.',
    );

  const columns: CustomerSalesReport['columns'] = [
    { key: 'customer', label: 'Customer', kind: 'text' },
  ];
  if (query.reportType === 'summary')
    columns.push({ key: 'total', label: 'Total', kind: 'money' });
  else if (query.reportType === 'income')
    columns.push(
      { key: 'income', label: 'Income', kind: 'money' },
      { key: 'expenses', label: 'Expenses', kind: 'money' },
      { key: 'netIncome', label: 'Net income', kind: 'money' },
    );
  else
    columns.push(
      { key: 'date', label: 'Transaction date', kind: 'text' },
      { key: 'transactionType', label: 'Transaction type', kind: 'text' },
      { key: 'num', label: 'Num', kind: 'text' },
      { key: 'product', label: 'Product/Service', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'text' },
      { key: 'quantity', label: 'Quantity', kind: 'number' },
      { key: 'salesPrice', label: 'Sales price', kind: 'money' },
      { key: 'amount', label: 'Amount', kind: 'money' },
      { key: 'balance', label: 'Balance', kind: 'money' },
    );
  const rows: CustomerSalesRow[] = [];
  let grandIncome = 0,
    grandExpenses = 0;
  const sortedGroups = [...groups].sort(([a], [b]) =>
    a === 0 ? 1 : b === 0 ? -1 : compare(names.get(a), names.get(b)) || a - b,
  );
  for (const [customerId, group] of sortedGroups) {
    const customer = names.get(customerId) || 'Unassigned';
    const identity = customerId ? { customerId } : {};
    group.sort(
      (a, b) =>
        compare(
          moment(a.entry.date).format('YYYY-MM-DD'),
          moment(b.entry.date).format('YYYY-MM-DD'),
        ) ||
        compare(
          a.entry.transactionNumber || '',
          b.entry.transactionNumber || '',
        ) ||
        compare(a.entry.referenceType, b.entry.referenceType) ||
        a.entry.referenceId - b.entry.referenceId ||
        (a.entry.indexGroup || 0) - (b.entry.indexGroup || 0) ||
        a.entry.index - b.entry.index ||
        a.entry.id - b.entry.id,
    );
    let income = 0,
      expenses = 0;
    if (query.reportType === 'detail')
      rows.push({
        id: `customer-${customerId}`,
        kind: 'customer',
        ...identity,
        cells: { customer },
      });
    for (const { entry, amount, doc } of group) {
      if (incomeTypes.has(entry.account.accountType))
        income = add(income, amount);
      else expenses = add(expenses, amount);
      if (query.reportType !== 'detail') continue;
      const candidates = (doc?.lines || []).filter(
        (line) => line.index === entry.index && line.itemId === entry.itemId,
      );
      const line =
        entry.itemId && candidates.length === 1 ? candidates[0] : undefined;
      if (entry.itemId && !line)
        warnings.add(
          'Some historical product details are unavailable. Amounts remain included; unknown quantities and prices are blank.',
        );
      rows.push({
        id: `entry-${entry.id}`,
        kind: 'detail',
        ...identity,
        referenceId: entry.referenceId,
        referenceType: entry.referenceType,
        cells: {
          customer,
          date: moment(entry.date).format('YYYY-MM-DD'),
          transactionType:
            {
              SaleInvoice: 'Invoice',
              SaleReceipt: 'Sales receipt',
              CreditNote: 'Credit note',
              PaymentReceive: 'Payment',
              RefundCreditNote: 'Credit refund',
            }[entry.referenceType] || entry.referenceType,
          num: entry.transactionNumber || entry.referenceNumber || '',
          product: line?.product || '',
          description:
            entry.note || line?.description || entry.account.name || '',
          quantity: line
            ? (['CreditNote', 'RefundCreditNote'].includes(entry.referenceType)
                ? -1
                : 1) * Number(line.quantity)
            : null,
          salesPrice: line ? Number(line.rate) : null,
          amount,
          balance: income,
        },
      });
    }
    grandIncome = add(grandIncome, income);
    grandExpenses = add(grandExpenses, expenses);
    const cells =
      query.reportType === 'income'
        ? { customer, income, expenses, netIncome: add(income, expenses) }
        : query.reportType === 'summary'
          ? { customer, total: income }
          : { customer: `Total ${customer}`, amount: income, balance: income };
    rows.push({
      id: `subtotal-${customerId}`,
      kind: query.reportType === 'detail' ? 'subtotal' : 'customer',
      ...identity,
      cells,
    });
  }
  rows.push({
    id: 'total',
    kind: 'total',
    cells:
      query.reportType === 'income'
        ? {
            customer: 'TOTAL',
            income: grandIncome,
            expenses: grandExpenses,
            netIncome: add(grandIncome, grandExpenses),
          }
        : query.reportType === 'summary'
          ? { customer: 'TOTAL', total: grandIncome }
          : { customer: 'TOTAL', amount: grandIncome, balance: grandIncome },
  });
  return {
    meta: {
      title: {
        summary: 'Sales by Customer Summary',
        detail: 'Sales by Customer Detail',
        income: 'Income by Customer Summary',
      }[query.reportType],
      fromDate: query.fromDate,
      toDate: query.toDate,
      basis: query.basis,
      currencyCode: metadata.baseCurrency,
      formattedDateRange: `${moment(query.fromDate).format(metadata.dateFormat || 'MMM D, YYYY')} – ${moment(query.toDate).format(metadata.dateFormat || 'MMM D, YYYY')}`,
    },
    columns,
    rows,
    warnings: [...warnings],
  };
}
