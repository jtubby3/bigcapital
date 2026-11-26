import type { StatementType } from './useCustomerStatements';
import type { LocationDescriptorObject } from 'history';

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function statementDates(today = new Date()) {
  const previous = new Date(today.getFullYear(), today.getMonth(), 0);
  previous.setDate(Math.min(today.getDate(), previous.getDate()));
  return {
    statementDate: localDate(today),
    fromDate: localDate(previous),
    toDate: localDate(today),
  };
}

export function statementPeriod(
  statementType: StatementType,
  dates: { statementDate: string; fromDate: string; toDate: string },
) {
  return statementType === 'open-item'
    ? {
        statementDate: dates.statementDate,
        fromDate: dates.statementDate,
        toDate: dates.statementDate,
      }
    : { ...dates };
}

export function statementRecipients(
  ids: number[],
  emails: Record<number, string>,
) {
  return ids.map((customerId) => ({
    customerId,
    email: (emails[customerId] || '').trim(),
  }));
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function validateStatementForm(
  draft: {
    statementDate: string;
    fromDate: string;
    toDate: string;
    recipients: { customerId: number; email?: string }[];
  },
  sending = false,
) {
  if (![draft.statementDate, draft.fromDate, draft.toDate].every(validDate))
    return 'Enter a valid statement date, start date, and end date.';
  if (draft.fromDate > draft.toDate)
    return 'Start date must be on or before end date.';
  if (!draft.recipients.length) return 'Select at least one customer.';
  if (draft.recipients.length > 100)
    return 'Select at most 100 customers per statement batch.';
  if (
    draft.recipients.some(({ email }) => {
      const value = email?.trim() || '';
      return (sending || !!value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    })
  )
    return sending
      ? 'Enter a valid email address for every selected customer before sending.'
      : 'Enter valid email addresses, or leave them blank to save without sending.';
  return undefined;
}

export function statementTotals(
  snapshots: { currencyCode: string; closingBalance: number }[],
) {
  const totals = new Map<string, number>();
  snapshots.forEach(({ currencyCode, closingBalance }) => {
    totals.set(currencyCode, (totals.get(currencyCode) || 0) + closingBalance);
  });
  return Array.from(totals, ([currencyCode, amount]) => ({
    currencyCode,
    amount,
  })).sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
}

export function customerStatementReturnTo(value?: LocationDescriptorObject) {
  return value && /^\/customers(?:\/\d+)?\/?$/.test(value.pathname || '')
    ? value
    : undefined;
}

export async function sendUnsentStatements<
  T extends { id: number; status: 'saved' | 'sent' },
>(statements: T[], send: (id: number) => Promise<T>) {
  const updated: T[] = [];
  const failedIds: number[] = [];
  for (const statement of statements) {
    if (statement.status === 'sent') {
      updated.push(statement);
      continue;
    }
    try {
      updated.push(await send(statement.id));
    } catch {
      updated.push(statement);
      failedIds.push(statement.id);
    }
  }
  return { statements: updated, failedIds };
}
