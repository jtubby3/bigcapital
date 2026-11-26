import { Button, Callout, Spinner } from '@blueprintjs/core';
import { useState } from 'react';
import { useCustomersListContext } from '../CustomersLanding/CustomersListProvider';
import styles from './CustomerSalesSummary.module.scss';
import { salesOverviewShares } from './salesOverview';
import { Metric, money, useWorkspaceQuery } from './useCustomerWorkspace';
import { useCurrentOrganizationBaseCurrency } from '@/hooks/query';
export function CustomerSalesSummary({
  metrics,
  loading,
  error,
  onRetry,
  activeMetric,
  onMetricClick,
}: {
  metrics?: Metric[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  activeMetric?: string;
  onMetricClick?: (key: string) => void;
}) {
  const baseCurrency = useCurrentOrganizationBaseCurrency();
  const [collapsed, setCollapsed] = useState(false);
  const shares = salesOverviewShares(metrics || []);
  return (
    <section className={styles.summary} aria-label="Customer sales summary">
      <div className={styles.sectionHeading}>
        <span>Sales overview</span>
        <Button
          minimal
          small
          icon={collapsed ? 'chevron-down' : 'chevron-up'}
          aria-label={
            collapsed ? 'Expand sales overview' : 'Collapse sales overview'
          }
          onClick={() => setCollapsed(!collapsed)}
        />
      </div>
      {!collapsed &&
        (loading ? (
          <Spinner size={22} />
        ) : error ? (
          <Callout intent="warning">
            Could not load sales totals.{' '}
            <Button small onClick={onRetry}>
              Try again
            </Button>
          </Callout>
        ) : (
          <>
            <div className={styles.metrics}>
              {metrics?.map((metric) => (
                <button
                  type="button"
                  key={metric.key}
                  className={styles.metric}
                  data-kind={metric.key}
                  title={metric.detail}
                  aria-pressed={activeMetric === metric.key}
                  onClick={() => onMetricClick?.(metric.key)}
                >
                  <span>{metric.label}</span>
                  <strong>
                    {metric.amounts.length
                      ? metric.amounts.map(({ currency, amount }) => (
                          <span key={currency}>{money(amount, currency)}</span>
                        ))
                      : money(0, baseCurrency || 'USD')}
                  </strong>
                  <small>
                    {metric.count}{' '}
                    {metric.count === 1 ? 'transaction' : 'transactions'}
                    <br />
                    {metric.detail}
                  </small>
                </button>
              ))}
            </div>
            <div
              className={styles.bar}
              aria-label="Sales overview proportions in base currency"
            >
              {metrics?.map((metric, index) => (
                <button
                  type="button"
                  key={metric.key}
                  data-kind={metric.key}
                  style={{ width: `${shares[index]}%` }}
                  title={`${metric.label}: ${money(metric.baseAmount, baseCurrency || 'USD')} in base currency (${shares[index].toFixed(1)}%)`}
                  aria-label={`Filter customers: ${metric.label}`}
                  aria-pressed={activeMetric === metric.key}
                  onClick={() => onMetricClick?.(metric.key)}
                />
              ))}
            </div>
          </>
        ))}
    </section>
  );
}
export function CustomersSalesOverview() {
  const query = useWorkspaceQuery<Metric[]>('summary');
  const { salesOverviewMetric, toggleSalesOverviewMetric } =
    useCustomersListContext();
  return (
    <CustomerSalesSummary
      metrics={query.data}
      activeMetric={salesOverviewMetric}
      onMetricClick={toggleSalesOverviewMetric}
      loading={query.isLoading}
      error={query.isError}
      onRetry={() => query.refetch()}
    />
  );
}
