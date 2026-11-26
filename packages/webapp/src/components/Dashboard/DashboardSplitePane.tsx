import * as FF from 'fp-ts/function';
import { debounce } from 'lodash';
import React, { useState, useRef, type CSSProperties } from 'react';
import SplitPane from 'react-split-pane';
import { DashboardMobileLayout } from './DashboardMobileLayout';
import { usePhoneLayout } from '@/hooks/usePhoneLayout';
import { withDashboard } from '@/containers/Dashboard/withDashboard';

interface DashboardSplitPaneProps {
  sidebarExpended: boolean;
  children?: React.ReactNode;
}

interface SplitPaneWithChildrenProps {
  allowResize?: boolean;
  split?: 'vertical' | 'horizontal';
  minSize?: number | string;
  maxSize?: number | string;
  defaultSize?: number | string;
  size?: number | string;
  onChange?: (size: number) => void;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}

const SplitPaneComponent =
  SplitPane as unknown as React.ComponentType<SplitPaneWithChildrenProps>;

function DashboardSplitPane({
  sidebarExpended,
  children,
}: DashboardSplitPaneProps) {
  const isPhone = usePhoneLayout();
  const initialSize = 220;

  const [defaultSize, setDefaultSize] = useState(
    parseInt(localStorage.getItem('dashboard-size') || '', 10) || initialSize,
  );
  const debounceSaveSize = useRef(
    debounce((size: number) => {
      localStorage.setItem('dashboard-size', String(size));
    }, 500),
  );
  const handleChange = (size: number) => {
    debounceSaveSize.current(size);
    setDefaultSize(size);
  };
  if (isPhone) return <DashboardMobileLayout>{children}</DashboardMobileLayout>;

  return (
    <SplitPaneComponent
      allowResize={sidebarExpended}
      split="vertical"
      minSize={180}
      maxSize={300}
      defaultSize={sidebarExpended ? defaultSize : 50}
      size={sidebarExpended ? defaultSize : 50}
      onChange={handleChange}
      className="primary"
      style={
        {
          '--main-sidebar-width': `${sidebarExpended ? defaultSize : 50}px`,
        } as CSSProperties
      }
    >
      {children}
    </SplitPaneComponent>
  );
}

export default FF.pipe(
  DashboardSplitPane,
  withDashboard(({ sidebarExpended }) => ({ sidebarExpended })),
);
