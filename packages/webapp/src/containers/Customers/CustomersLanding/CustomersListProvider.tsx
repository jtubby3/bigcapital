import { useMobileSearch } from '@/hooks/useMobileSearch';
import { Button, Callout } from '@blueprintjs/core';
import { isEmpty } from 'lodash';
import React, { createContext, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  salesOverviewQueryPath,
  toggleSalesOverviewMetric as nextSalesOverviewMetric,
} from '../CustomerWorkspace/salesOverview';
import { useWorkspaceQuery } from '../CustomerWorkspace/useCustomerWorkspace';
import { transformCustomersStateToQuery } from './utils';
import type { TableQuery } from '@/store/store.types';
import type { SettingsGroup } from '@bigcapital/sdk-ts';
import { DashboardInsider } from '@/components';
import {
  useResourceMeta,
  useResourceViews,
  useCustomers,
  useSettingsCustomers,
} from '@/hooks/query';
import {
  setCustomersTableState,
  resetCustomersSelectedRows,
} from '@/store/customers/customers.actions';
import { getFieldsFromResourceMeta } from '@/utils';

type UseCustomersResult = ReturnType<typeof useCustomers>;
type UseResourceViewsResult = ReturnType<typeof useResourceViews>;
type UseResourceMetaResult = ReturnType<typeof useResourceMeta>;

type CustomersListContextValue = {
  customersViews: UseResourceViewsResult['data'];
  customers: NonNullable<UseCustomersResult['data']>['data'] | undefined;
  pagination: NonNullable<UseCustomersResult['data']>['pagination'] | undefined;

  fields: ReturnType<typeof getFieldsFromResourceMeta> | [];
  resourceMeta: UseResourceMetaResult['data'];

  isViewsLoading: boolean;
  isCustomersLoading: boolean;
  isCustomersFetching: boolean;
  isResourceMetaLoading: boolean;
  isResourceMetaFetching: boolean;

  isEmptyStatus: boolean;
  mobileError: boolean;
  retryMobile: () => void;
  salesOverviewMetric: string | undefined;
  toggleSalesOverviewMetric: (metric: string) => void;

  customersSettings: SettingsGroup | undefined;
};

type CustomersListProviderProps = {
  tableState: Partial<TableQuery> & { inactiveMode?: boolean };
  tableStateChanged: boolean;
  children?: React.ReactNode;
};

const CustomersListContext = createContext<
  CustomersListContextValue | undefined
>(undefined);

function CustomersListProvider({
  tableState,
  tableStateChanged,
  children,
}: CustomersListProviderProps) {
  const dispatch = useDispatch();
  const [salesOverviewMetric, setSalesOverviewMetric] = useState<string>();
  const toggleSalesOverviewMetric = (metric: string) => {
    setSalesOverviewMetric((current) =>
      nextSalesOverviewMetric(current, metric),
    );
    dispatch(setCustomersTableState({ pageIndex: 0 }));
    dispatch(resetCustomersSelectedRows());
  };

  // Transformes the table state to fetch query.
  const { query: mobileSearch, isPhone } = useMobileSearch();
  const tableQuery = {
    ...transformCustomersStateToQuery(tableState),
    ...(mobileSearch ? { search_keyword: mobileSearch } : {}),
  };

  // Customers settings.
  const { data: customersSettings } = useSettingsCustomers();

  // Fetch customers resource views and fields.
  const { data: customersViews, isLoading: isViewsLoading } =
    useResourceViews('customers');

  // Fetch the customers resource fields.
  const {
    data: resourceMeta,
    isLoading: isResourceMetaLoading,
    isFetching: isResourceMetaFetching,
  } = useResourceMeta('customers');

  // Fetches customers data with pagination meta.
  const {
    data: unfilteredCustomersData,
    isLoading: isUnfilteredCustomersLoading,
    isFetching: isUnfilteredCustomersFetching,
    isError: queryError,
    refetch: retryCustomers,
  } = useCustomers(tableQuery, { enabled: !salesOverviewMetric });
  const overviewCustomers = useWorkspaceQuery<
    NonNullable<UseCustomersResult['data']>
  >(
    salesOverviewQueryPath(tableQuery, salesOverviewMetric || ''),
    !!salesOverviewMetric,
  );
  const customersData = salesOverviewMetric
    ? overviewCustomers.data
    : unfilteredCustomersData;
  const isCustomersLoading = salesOverviewMetric
    ? overviewCustomers.isLoading
    : isUnfilteredCustomersLoading;
  const isCustomersFetching = salesOverviewMetric
    ? overviewCustomers.isFetching
    : isUnfilteredCustomersFetching;

  // Detarmines the datatable empty status.
  const mobileError =
    isPhone && (salesOverviewMetric ? overviewCustomers.isError : queryError);
  const retryMobile = () => {
    if (salesOverviewMetric) overviewCustomers.refetch();
    else retryCustomers();
  };
  const isEmptyStatus =
    isEmpty(customersData?.data) &&
    !mobileSearch &&
    !mobileError &&
    !isCustomersLoading &&
    !tableStateChanged &&
    !salesOverviewMetric;

  const state: CustomersListContextValue = {
    mobileError,
    retryMobile,
    customersViews,
    customers: customersData?.data,
    pagination: customersData?.pagination,

    fields: resourceMeta?.fields
      ? getFieldsFromResourceMeta(resourceMeta.fields)
      : [],
    resourceMeta,
    isResourceMetaLoading,
    isResourceMetaFetching,

    isViewsLoading,
    isCustomersLoading,
    isCustomersFetching,

    isEmptyStatus,
    salesOverviewMetric,
    toggleSalesOverviewMetric,

    customersSettings,
  };

  return (
    <DashboardInsider
      loading={isViewsLoading || isResourceMetaLoading}
      name={'customers-list'}
    >
      <CustomersListContext.Provider value={state}>
        {salesOverviewMetric && overviewCustomers.isError && (
          <Callout intent="warning">
            Could not load customers for this sales metric.{' '}
            <Button small onClick={() => overviewCustomers.refetch()}>
              Try again
            </Button>
          </Callout>
        )}
        {children}
      </CustomersListContext.Provider>
    </DashboardInsider>
  );
}

const useCustomersListContext = (): CustomersListContextValue => {
  const ctx = React.useContext(CustomersListContext);
  if (!ctx) {
    throw new Error(
      'useCustomersListContext must be used within a CustomersListProvider',
    );
  }
  return ctx;
};

export { CustomersListProvider, useCustomersListContext };
