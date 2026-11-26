import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from './TransactionMultiFilter';

export interface CustomerTransactionFilters {
  type: string[];
  status: string[];
  from: string;
  to: string;
  search: string;
}

/** Share customer filters within the signed-in user and company. */
export function readCustomerFilters(
  key?: string,
  legacyKey?: string,
): CustomerTransactionFilters | undefined {
  if (!key) return undefined;
  try {
    let saved = window.localStorage.getItem(key);
    if (!saved && legacyKey) {
      // Carry existing selections forward before the shared preference is first saved.
      saved = window.localStorage.getItem(legacyKey);
      if (!saved) {
        const prefix = legacyKey.slice(0, legacyKey.lastIndexOf(':') + 1);
        const previousKey = Object.keys(window.localStorage).find((item) =>
          item.startsWith(prefix),
        );
        saved = previousKey ? window.localStorage.getItem(previousKey) : null;
      }
    }
    if (!saved) return undefined;
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object') return undefined;
    const data = value as Partial<CustomerTransactionFilters>;
    if (
      !Array.isArray(data.type) ||
      !Array.isArray(data.status) ||
      !data.type.every((item) => typeof item === 'string') ||
      !data.status.every((item) => typeof item === 'string') ||
      typeof data.from !== 'string' ||
      typeof data.to !== 'string' ||
      typeof data.search !== 'string'
    )
      return undefined;
    return {
      type: [
        ...new Set(
          data.type.filter((item) => TRANSACTION_TYPES.includes(item)),
        ),
      ],
      status: [
        ...new Set(
          data.status.filter((item) => TRANSACTION_STATUSES.includes(item)),
        ),
      ],
      from: data.from,
      to: data.to,
      search: data.search,
    };
  } catch {
    // A blocked store or invalid saved value must not prevent the page from opening.
    return undefined;
  }
}

export function saveCustomerFilters(
  key: string | undefined,
  filters: CustomerTransactionFilters,
): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // Filters continue working for the current visit when browser storage is unavailable.
  }
}
