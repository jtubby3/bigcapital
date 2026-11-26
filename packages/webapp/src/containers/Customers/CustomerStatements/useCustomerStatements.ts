import { rawRequest, toPdfDocument } from '@bigcapital/sdk-ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthOrganizationId, useAuthUserId } from '@/hooks/state';
import { useApiFetcher } from '@/hooks/useRequest';

export type StatementType = 'balance-forward' | 'open-item' | 'transaction';

export interface StatementDraft {
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  includePaymentLinks: boolean;
  recipients: { customerId: number; email?: string }[];
}

export interface StatementLine {
  date: string;
  type: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  originalAmount?: number;
  openAmount?: number;
  paymentUrl?: string;
}

export interface StatementSnapshot {
  customerId: number;
  customerName: string;
  email: string;
  currencyCode: string;
  billingAddress: string;
  organizationName: string;
  transactionPresentation?: 'invoice-receipts';
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalCharges: number;
  totalPayments: number;
  includePaymentLinks: boolean;
  lines: StatementLine[];
}

export interface SavedStatement {
  id: number;
  customerId: number;
  statementType: StatementType;
  statementDate: string;
  fromDate: string;
  toDate: string;
  email: string;
  status: 'saved' | 'sent';
  createdAt: string;
  sentAt?: string;
  snapshot: StatementSnapshot;
}

export interface StatementRecipient {
  id: number;
  displayName: string;
  email?: string;
  currencyCode: string;
  balance: number;
}
const statementPath = '/api/customer-statements';

function useStatementQueryKey() {
  const organization = useAuthOrganizationId();
  const user = useAuthUserId();
  return ['customer-statements', organization, user] as const;
}

export function useStatementRecipients(ids?: string) {
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const key = useStatementQueryKey();
  return useQuery<StatementRecipient[], Error>({
    queryKey: [...key, 'recipients', ids || 'all'],
    queryFn: () =>
      rawRequest<StatementRecipient[]>(
        fetcher,
        'GET',
        `${statementPath}/recipients${ids ? `?customer_ids=${encodeURIComponent(ids)}` : ''}`,
      ),
  });
}
export function useStatementPreview(draft: StatementDraft | undefined) {
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const key = useStatementQueryKey();
  return useQuery<StatementSnapshot[], Error>({
    queryKey: [...key, 'preview', draft],
    queryFn: () =>
      rawRequest<StatementSnapshot[]>(
        fetcher,
        'POST',
        `${statementPath}/preview`,
        { ...draft! },
      ),
    enabled: !!draft,
    retry: false,
  });
}
export function useStatementsHistory(customerId: number) {
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const key = useStatementQueryKey();
  return useQuery<SavedStatement[], Error>({
    queryKey: [...key, 'history', customerId],
    queryFn: () =>
      rawRequest<SavedStatement[]>(
        fetcher,
        'GET',
        `${statementPath}?customer_id=${customerId}`,
      ),
  });
}
export function useSaveStatements() {
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const queryClient = useQueryClient();
  const key = useStatementQueryKey();
  return useMutation<SavedStatement[], Error, StatementDraft>({
    mutationFn: (draft) =>
      rawRequest<SavedStatement[]>(fetcher, 'POST', statementPath, {
        ...draft,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...key, 'history'] }),
  });
}
export function useSendStatement() {
  const fetcher = useApiFetcher({ enableCamelCaseTransform: true });
  const queryClient = useQueryClient();
  const key = useStatementQueryKey();
  return useMutation<SavedStatement, Error, number>({
    mutationFn: (id) =>
      rawRequest<SavedStatement>(
        fetcher,
        'POST',
        `${statementPath}/${id}/send`,
        {},
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...key, 'history'] }),
  });
}
export function useStatementPdf() {
  const fetcher = useApiFetcher();
  return useMutation<
    { url: string; filename: string },
    Error,
    { draft?: StatementDraft; id?: number; ids?: number[] }
  >({
    mutationFn: async ({ draft, id, ids }) => {
      const init = { headers: { Accept: 'application/pdf' } };
      const response = ids
        ? await fetcher
            .path('/api/customer-statements/saved/pdf')
            .method('post')
            .create()({ ids } as never, init)
        : id !== undefined
          ? await fetcher
              .path('/api/customer-statements/{id}/pdf')
              .method('get')
              .create()({ id } as never, init)
          : await fetcher
              .path('/api/customer-statements/preview/pdf')
              .method('post')
              .create()({ ...draft! } as never, init);
      const document = toPdfDocument(response);
      if (!(document.blob instanceof Blob) || document.blob.size === 0)
        throw new Error('The statement PDF could not be generated.');
      return {
        url: URL.createObjectURL(document.blob),
        filename: document.filename,
      };
    },
  });
}
