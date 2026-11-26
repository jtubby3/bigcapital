import * as FF from 'fp-ts/function';
import React from 'react';
import withBreadcrumbs from 'react-router-breadcrumbs-hoc';
import { useCustomerReturnTo } from '@/hooks/useCustomerReturnTo';
import { useHistory } from 'react-router-dom';
import type { DashboardBreadcrumbItem } from './DashboardBreadcrumbs';
import { If, Icon } from '@/components';
import { FormattedMessage as T } from '@/components';
import { withDashboard } from '@/containers/Dashboard/withDashboard';

interface DashboardBackLinkProps {
  dashboardBackLink: boolean | string;
  breadcrumbs: DashboardBreadcrumbItem[];
}

function DashboardBackLink({
  dashboardBackLink,
  breadcrumbs,
}: DashboardBackLinkProps) {
  const history = useHistory();
  const customerReturnTo = useCustomerReturnTo();
  const crumb = breadcrumbs[breadcrumbs.length - 2];

  const handleClick = (event: React.MouseEvent) => {
    const url =
      customerReturnTo ||
      (typeof dashboardBackLink === 'string'
        ? dashboardBackLink
        : crumb?.match.url);
    if (url) {
      history.push(url);
    }
    event.preventDefault();
  };

  return (
    <If condition={!!(dashboardBackLink && (crumb || customerReturnTo))}>
      <div className="dashboard__back-link">
        <a href="#no-link" onClick={handleClick}>
          <Icon icon={'arrow-left'} iconSize={18} />{' '}
          {customerReturnTo ? 'Back to customer' : <T id={'back_to_list'} />}
        </a>
      </div>
    </If>
  );
}

export default FF.pipe(
  DashboardBackLink,
  withDashboard(({ dashboardBackLink }) => ({
    dashboardBackLink,
  })),
  withBreadcrumbs([]) as (
    Component: React.ComponentType<any>,
  ) => React.ComponentType<any>,
);
