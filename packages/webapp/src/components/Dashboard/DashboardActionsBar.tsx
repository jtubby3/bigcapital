import { Navbar } from '@blueprintjs/core';
import clsx from 'classnames';
import React from 'react';
import { usePhoneLayout } from '@/hooks/usePhoneLayout';

interface DashboardActionsBarProps {
  children?: React.ReactNode;
  className?: string;
  name?: string;
}

export function DashboardActionsBar({
  className,
  children,
  name,
}: DashboardActionsBarProps) {
  const isPhone = usePhoneLayout();
  const actions = (
    <div
      className={clsx(
        {
          'dashboard__actions-bar': true,
          [`dashboard__actions-bar--${name}`]: !!name,
        },
        className,
      )}
    >
      <Navbar className="navbar--dashboard-actions-bar">{children}</Navbar>
    </div>
  );
  return isPhone ? (
    <details className="mobile-page-actions">
      <summary>Page actions</summary>
      {actions}
    </details>
  ) : (
    actions
  );
}
