import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuthOrganizationId, useAuthToken } from '@/hooks/state';

export type ScanStatus =
  | 'queued'
  | 'processing'
  | 'review'
  | 'failed'
  | 'posted'
  | 'cancelled';
export type OptionKind =
  | 'vendor'
  | 'item'
  | 'warehouse'
  | 'branch'
  | 'charge'
  | 'tax';

export interface Option {
  id: number;
  name: string;
  description?: string;
  code?: string;
  rate?: string | number;
}

export interface ScanLine {
  code: string;
  description: string;
  billing_unit: string;
  pack: string;
  shipped: string;
  unit_price: string;
  amount: string;
  page?: number;
  file_id?: number;
  attention?: string;
  item_id?: number | null;
  item_name?: string;
  confirmed: boolean;
  remember?: boolean;
  cases_per_unit: string;
}

export interface Review {
  vendor_id?: number | null;
  vendor_name?: string;
  invoice_number: string;
  bill_date: string;
  due_date?: string;
  currency: string;
  exchange_rate?: string;
  warehouse_id?: number | null;
  branch_id?: number | null;
  shipping_item_id?: number | null;
  tax_rate_id?: number | null;
  total: string;
  shipping: string;
  tax: string;
  discount: string;
  receipt_checked: boolean;
  lines: ScanLine[];
  warnings: string[];
}

export interface ScanSummary {
  id: number;
  status: ScanStatus;
  name: string;
  version: number;
  bill_id?: number;
}
export interface ScanFile {
  id: number;
  name: string;
  page_count?: number;
}
export interface Scan extends ScanSummary {
  error?: string;
  files: ScanFile[];
  review?: Review;
}

export interface PurchasePreview {
  ready: boolean;
  issues: string[];
  token?: string;
  bill_id?: number;
  prices: {
    item_id: number;
    name: string;
    old_cost: string | number;
    new_cost: string | number;
    old_sell: string | number;
    new_sell: string | number;
  }[];
}

export interface TelegramConnection {
  enabled: boolean;
  connected: boolean;
  bot_username?: string;
}

export interface Pairing {
  code: string;
  bot_username: string;
}

export function scanError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (error.response?.status === 409) {
      return typeof message === 'string'
        ? message
        : 'This review changed. Refresh and check it again.';
    }
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

export function useVendorScanApi() {
  const token = useAuthToken();
  const organizationId = useAuthOrganizationId();
  return useMemo(
    () => ({
      key: ['vendor-invoice-scans', organizationId] as const,
      http: axios.create({
        baseURL: '/api/vendor-invoice-scans',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(organizationId ? { 'organization-id': organizationId } : {}),
        },
      }),
    }),
    [organizationId, token],
  );
}

export function useVendorScanImage(path?: string) {
  const { http } = useVendorScanApi();
  const [state, setState] = useState<{
    http?: typeof http;
    path?: string;
    url?: string;
    error?: string;
  }>({});
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    let url: string | undefined;
    setState({});
    http
      .get<Blob>(path, { signal: abort.signal, responseType: 'blob' })
      .then(({ data }) => {
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(data);
        setState({ http, path, url });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setState({ http, path, error: scanError(error) });
        }
      });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [http, path]);
  return state.http === http && state.path === path ? state : {};
}
