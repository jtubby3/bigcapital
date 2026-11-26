import { useQuery } from '@tanstack/react-query';
import { useAuthToken, useAuthOrganizationId } from '@/hooks/state';
import { transformToCamelCase } from '@/utils';
export interface CustomerProfile {
  paymentTermsDays?: number;
  paymentMethod?: string;
  shippingSameAsBilling?: boolean;
  categories?: string[];
  addresses?: { label: string; address: string }[];
  customFields?: { label: string; value: string }[];
  attachmentKeys?: string[];
}
export interface Transaction {
  id: number;
  customerId: number;
  type: string;
  date: string;
  number: string;
  memo: string;
  currency: string;
  amount: number;
  openBalance: number;
  status: string;
}
export interface Metric {
  key: string;
  label: string;
  detail: string;
  count: number;
  amounts: { currency: string; amount: number }[];
  baseAmount: number;
}
export interface Workspace {
  rows: Transaction[];
  summary: Metric[];
  total: number;
  page: number;
  pageSize: number;
}
export function useWorkspaceQuery<T>(path: string, enabled = true) {
  const token = useAuthToken(),
    organization = useAuthOrganizationId();
  return useQuery<T>({
    queryKey: ['customers-workspace', organization, path],
    enabled,
    queryFn: async () => {
      const response = await fetch(`/api/customer-workspace/${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'organization-id': organization || '',
        },
      });
      if (!response.ok)
        throw new Error(
          'Unable to load customer information. Please try again.',
        );
      return transformToCamelCase(await response.json()) as T;
    },
  });
}
export const money = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    amount,
  );
