import { Button, Drawer, Icon, Position } from '@blueprintjs/core';
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Can } from '@/components';
import {
  AbilitySubject,
  CustomerAction,
  SaleInvoiceAction,
} from '@/constants/abilityOption';
import '@/style/pages/Dashboard/Mobile.scss';
import {
  withUniversalSearchActions,
  WithUniversalSearchActionsProps,
} from '@/containers/UniversalSearch/withUniversalSearchActions';
import {
  useDrawerActions,
  useSidebarSubmnuActions,
} from '@/hooks/state/dashboard';
import { useNotificationsUnreadCount } from '@/hooks/query/notifications';
import { DRAWERS } from '@/constants/drawers';

function DashboardMobileLayoutInner({
  children,
  openGlobalSearch,
}: { children?: React.ReactNode } & Pick<
  WithUniversalSearchActionsProps,
  'openGlobalSearch'
>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { openDrawer } = useDrawerActions();
  const { closeSidebarSubmenu } = useSidebarSubmnuActions();
  const { data: unreadCount = 0 } = useNotificationsUnreadCount();
  const [sidebar, content] = React.Children.toArray(children);

  useEffect(() => {
    setMenuOpen(false);
    closeSidebarSubmenu();
  }, [location.key, closeSidebarSubmenu]);

  return (
    <div className="mobile-dashboard">
      <header className="mobile-dashboard__header">
        <Button
          minimal
          icon="menu"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        />
        <span>Bigcapital</span>
        <Button
          minimal
          icon="notifications"
          aria-label="Notifications"
          onClick={() => openDrawer(DRAWERS.NOTIFICATIONS)}
        >
          {unreadCount > 0 && (
            <span aria-label={`${unreadCount} unread`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
        <Button
          minimal
          icon="search"
          aria-label="Search Bigcapital"
          onClick={() => openGlobalSearch()}
        />
      </header>
      <div className="mobile-dashboard__content">{content}</div>
      <nav className="mobile-dashboard__nav" aria-label="Mobile navigation">
        <NavLink exact to="/" activeClassName="is-active">
          <Icon icon="home" aria-hidden="true" />
          Home
        </NavLink>
        <Can I={SaleInvoiceAction.View} a={AbilitySubject.Invoice}>
          <NavLink to="/invoices" activeClassName="is-active">
            <Icon icon="document" aria-hidden="true" />
            Invoices
          </NavLink>
        </Can>
        <Can I={CustomerAction.View} a={AbilitySubject.Customer}>
          <NavLink to="/customers" activeClassName="is-active">
            <Icon icon="people" aria-hidden="true" />
            Customers
          </NavLink>
        </Can>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
        >
          <Icon icon="more" aria-hidden="true" />
          More
        </button>
      </nav>
      <Drawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Navigation"
        position={Position.LEFT}
        size="min(320px, 90vw)"
        className="mobile-navigation"
        canEscapeKeyClose
        canOutsideClickClose
      >
        {sidebar}
      </Drawer>
    </div>
  );
}

export const DashboardMobileLayout = withUniversalSearchActions(
  DashboardMobileLayoutInner,
);
