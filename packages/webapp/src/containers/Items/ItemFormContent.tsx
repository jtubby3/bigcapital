import layout from '@/components/EntityFormLayout.module.scss';
import { Tab, Tabs } from '@blueprintjs/core';
import { css } from '@emotion/css';
import { useState, type ReactNode } from 'react';
import { useItemFormContext } from './ItemFormProvider';
import { ItemFormSections } from './ItemFormFields';
import { ItemFormFloatingActions } from './ItemFormFloatingActions';
import { Card, Group } from '@/components';

export function ItemFormContent({
  footerActions,
}: {
  footerActions?: ReactNode;
}) {
  const { itemId, isNewMode } = useItemFormContext();
  const [selectedTabId, setSelectedTabId] = useState<string>('primary');

  const handleTabChange = (tabId: string) => {
    const sectionId = String(tabId);
    setSelectedTabId(sectionId);

    const section = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Card
      className={`${layout.root} ${css`
        padding-bottom: 0 !important;
      `}`}
    >
      <Group
        className={layout.body}
        verticalAlign={'top'}
        alignItems={'flex-start'}
        flexWrap={'nowrap'}
      >
        <Tabs
          selectedTabId={selectedTabId}
          onChange={handleTabChange}
          className={css`
            position: sticky;
            top: 20px;
          `}
          vertical
        >
          <Tab id={'primary'} title={'Basic'} />
          <Tab id={'selling'} title={'Selling'} />
          <Tab id={'purchasing'} title={'Purchasing'} />
          <Tab id={'inventory'} title={'Inventory'} />
          {itemId && !isNewMode && (
            <Tab id="price-history" title="Price history" />
          )}
        </Tabs>

        <ItemFormSections />
      </Group>
      {footerActions ?? <ItemFormFloatingActions />}
    </Card>
  );
}
