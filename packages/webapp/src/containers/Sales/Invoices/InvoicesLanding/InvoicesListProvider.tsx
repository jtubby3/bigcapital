import { useMobileSearch } from '@/hooks/useMobileSearch';
import { isEmpty } from 'lodash';
import React, { createContext } from 'react';
import intl from 'react-intl-universal';
import type { InvoiceTableRow } from './components';
import type { SettingsGroup } from '@bigcapital/sdk-ts';
import { IResourceField } from '@/components/AdvancedFilter/interfaces';
import { DashboardInsider } from '@/components/Dashboard';
import {
  useResourceViews,
  useResourceMeta,
  useInvoices,
  useSettingsInvoices,
} from '@/hooks/query';
import { getFieldsFromResourceMeta } from '@/utils';

interface InvoicesListProviderProps {
  query?: any;
  tableStateChanged?: boolean;
  children?: React.ReactNode;
}

export interface InvoicesListContextValue {
  invoices: InvoiceTableRow[] | undefined;
  pagination: { total?: number; [key: string]: any } | undefined;
  invoicesFields: IResourceField[];
  invoicesViews: any;
  isInvoicesLoading: boolean;
  isInvoicesFetching: boolean;
  isResourceFetching: boolean;
  isResourceLoading: boolean;
  isViewsLoading: boolean;
  isEmptyStatus: boolean;
  mobileError: boolean;
  retryMobile: () => void;
  invoiceSettings: SettingsGroup | undefined;
}

const InvoicesListContext = createContext<InvoicesListContextValue>(
  {} as InvoicesListContextValue,
);

/**
 * Invoices list data provider.
 */
function InvoicesListProvider({
  query,
  tableStateChanged,
  ...props
}: InvoicesListProviderProps) {
  const { query: mobileSearch, isPhone } = useMobileSearch();
  const { data: invoicesViews, isLoading: isViewsLoading } =
    useResourceViews('sale_invoices');

  const {
    data: resourceMeta,
    isLoading: isResourceLoading,
    isFetching: isResourceFetching,
  } = useResourceMeta('sale_invoices');

  const {
    data: invoicesData,
    isFetching: isInvoicesFetching,
    isLoading: isInvoicesLoading,
    isError: queryError,
    refetch: retryMobile,
  } = useInvoices(
    mobileSearch ? { ...query, search_keyword: mobileSearch } : query,
  );

  const { data: invoiceSettings } = useSettingsInvoices();

  const mobileError = isPhone && queryError;
  const isEmptyStatus =
    isEmpty(invoicesData?.data) &&
    !mobileSearch &&
    !mobileError &&
    !tableStateChanged &&
    !isInvoicesLoading;

  const provider: InvoicesListContextValue = {
    mobileError,
    retryMobile,
    invoices: invoicesData?.data,
    pagination: invoicesData?.pagination,

    invoicesFields: resourceMeta?.fields
      ? getFieldsFromResourceMeta(resourceMeta.fields).map((field) =>
          field.key === 'status'
            ? {
                ...field,
                options: field.options?.map((option) =>
                  option.key === 'draft'
                    ? { ...option, label: intl.get('sales.status.unfinished') }
                    : option,
                ),
              }
            : field,
        )
      : [],
    invoicesViews,

    isInvoicesLoading,
    isInvoicesFetching,
    isResourceFetching,
    isResourceLoading,
    isViewsLoading,

    isEmptyStatus,

    invoiceSettings,
  };

  return (
    <DashboardInsider
      loading={isViewsLoading || isResourceLoading}
      name={'sales-invoices-list'}
    >
      <InvoicesListContext.Provider value={provider} {...props} />
    </DashboardInsider>
  );
}

const useInvoicesListContext = () => React.useContext(InvoicesListContext);

export { InvoicesListProvider, useInvoicesListContext };
