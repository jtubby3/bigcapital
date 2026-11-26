import { Tabs, TabsProps } from '@blueprintjs/core';
import { css } from '@emotion/css';

interface InvoiceCustomizeTabsProps extends TabsProps {}

export function InvoiceCustomizeTabs(props: InvoiceCustomizeTabsProps) {
  return (
    <Tabs
      className={css`
        overflow: hidden;
        min-width: 0;
        min-height: 0;
        flex: 1 1;
        display: flex;
        flex-direction: column;

        .bp4-tab-list {
          padding: 0 20px;
          flex-shrink: 0;
          overflow-x: auto;
          overflow-y: hidden;
          background: var(--color-element-customize-header-tabs-background);
          border-bottom: 1px solid var(--color-element-customize-divider);
        }
        .bp4-tab {
          line-height: 40px;
        }
        .bp4-tab:not([aria-selected='true']) {
          color: var(--color-ekement-customize-header-tabs-text);
        }
        .bp4-tab-indicator-wrapper .bp4-tab-indicator {
          height: 2px;
        }
        .bp4-tab-panel {
          margin: 0;
          min-height: 0;
          flex: 1 1 auto;
          overflow: auto;
          scrollbar-gutter: stable;
        }
      `}
      {...props}
    />
  );
}
