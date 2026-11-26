import { useMemo, useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from 'openapi-typescript-fetch';
import { AbilitySubject, SaleInvoiceAction } from '@/constants/abilityOption';
import { useAuthOrganizationId, useAuthToken } from '@/hooks/state';
import { useAbilityContext } from '@/hooks/utils';
import { transformToCamelCase, transfromToSnakeCase } from '@/utils';
import type { PackingSlipSelection } from '@/hooks/query/invoices';

export interface MatchEvidence {
  verified: boolean;
  manualConfirmation?: boolean;
  route: string;
  reasons: string[];
  candidates: {
    invoiceId: number;
    invoiceNo: string;
    customerName: string;
    reasons: string[];
  }[];
}
export interface SlipAttachment extends PackingSlipSelection {
  batchId?: number;
  name: string;
  pages: number[];
  status: 'attached' | 'stale';
  evidence?: MatchEvidence;
  error?: string;
}
export interface PackingSlip extends Omit<SlipAttachment, 'status'> {
  fileId: number;
  status: SlipAttachment['status'] | 'review' | 'ignored' | 'duplicate';
  invoiceId?: number;
  invoiceNo?: string;
  customerName?: string;
}
export interface ScanFile {
  id: number;
  name: string;
  status:
    | 'queued'
    | 'processing'
    | 'ready'
    | 'failed'
    | 'cancelled'
    | 'duplicate';
  error?: string;
  pageCount?: number;
}
export interface BatchSummary {
  id: number;
  cancelled: boolean;
  createdAt?: string;
}
export interface ScanBatch extends BatchSummary {
  files: ScanFile[];
  slips: PackingSlip[];
}
export interface InvoiceCandidate {
  id: number;
  fingerprint: string;
  invoiceNo: string;
  customerName: string;
  shippingAddress: string;
  referenceNo: string;
  trackingNo: string;
  shippingDate: string;
  invoiceDate: string;
  eligible: boolean;
  entries: {
    code: string;
    name: string;
    description: string;
    quantity: number;
    unit?: string;
  }[];
}
export function packingSlipError(error: unknown): string {
  const response = axios.isAxiosError(error)
    ? error.response
    : error instanceof ApiError
      ? error
      : undefined;
  const message = response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(' ');
  if (response?.status === 409)
    return 'This document changed. Refresh and review it before trying again.';
  return error instanceof Error
    ? error.message
    : 'Unable to complete the request. Please try again.';
}

export function packingSlipPermissionDenied(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export function usePackingSlipPermissions() {
  const ability = useAbilityContext();
  const canView =
    ability.can(SaleInvoiceAction.View, AbilitySubject.Invoice) &&
    ability.can('View', AbilitySubject.Attachment);
  const canEdit =
    canView &&
    ability.can(SaleInvoiceAction.Edit, AbilitySubject.Invoice) &&
    ability.can('Create', AbilitySubject.Attachment);
  const canRemove = canEdit && ability.can('Delete', AbilitySubject.Attachment);
  return { canView, canEdit, canRemove };
}

/** These endpoints are not in the generated SDK yet; preserve its auth/case conventions. */
export function usePackingSlipApi() {
  const token = useAuthToken();
  const organizationId = useAuthOrganizationId();
  return useMemo(() => {
    const http = axios.create({
      baseURL: '/api/packing-slips',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(organizationId ? { 'organization-id': organizationId } : {}),
      },
    });
    return {
      queryKey: ['packing-slips', organizationId] as const,
      async get<T>(path: string, signal?: AbortSignal): Promise<T> {
        const response = await http.get(path, { signal });
        return transformToCamelCase(response.data) as T;
      },
      async post<T>(
        path: string,
        values: Record<string, unknown> = {},
      ): Promise<T> {
        const response = await http.post(path, transfromToSnakeCase(values));
        return transformToCamelCase(response.data) as T;
      },
      async upload(batchId: number, file: File) {
        const body = new FormData();
        body.append('file', file);
        return http.post(`/batches/${batchId}/files`, body);
      },
      async blob(path: string, signal?: AbortSignal): Promise<Blob> {
        return (await http.get(path, { responseType: 'blob', signal })).data;
      },
    };
  }, [token, organizationId]);
}
export function useInvoicePackingSlips(invoiceId?: number) {
  const api = usePackingSlipApi();
  const { canView } = usePackingSlipPermissions();
  return useQuery<SlipAttachment[], Error>({
    queryKey: [...api.queryKey, 'invoice', invoiceId],
    queryFn: ({ signal }) => api.get(`/invoices/${invoiceId}`, signal),
    enabled: !!invoiceId && canView,
    retry: (failureCount, error) =>
      failureCount < 3 && !packingSlipPermissionDenied(error),
    retryOnMount: false,
    staleTime: 0,
  });
}
export function useRefreshPackingSlips() {
  const client = useQueryClient();
  const organizationId = useAuthOrganizationId();
  return () =>
    client.invalidateQueries({ queryKey: ['packing-slips', organizationId] });
}

/** Authenticated previews never put credentials into a public URL. */
export function usePackingSlipObjectUrl(path?: string) {
  const api = usePackingSlipApi();
  const [state, setState] = useState<{
    api?: typeof api;
    path?: string;
    url?: string;
    error?: string;
  }>({});
  useEffect(() => {
    if (!path) return;
    let active = true;
    let url: string | undefined;
    const abort = new AbortController();
    setState({ api, path });
    api
      .blob(path, abort.signal)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setState({ api, path, url });
      })
      .catch((error) => {
        if (active) setState({ api, path, error: packingSlipError(error) });
      });
    return () => {
      active = false;
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, path]);
  return state.path === path && state.api === api ? state : {};
}
