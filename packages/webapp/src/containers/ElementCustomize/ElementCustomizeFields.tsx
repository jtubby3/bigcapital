import { Button, Intent } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import * as FF from 'fp-ts/function';
import React from 'react';
import styles from './ElementCustomize.module.scss';
import { ElementCustomizeHeader } from './ElementCustomizeHeader';
import { useElementCustomizeContext } from './ElementCustomizeProvider';
import { ElementCustomizeTabs } from './ElementCustomizeTabs';
import { useElementCustomizeTabsController } from './ElementCustomizeTabsController';
import type { WithDrawerActionsProps } from '@/containers/Drawer/withDrawerActions';
import { Box, Group, Stack } from '@/components';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { withDrawerActions } from '@/containers/Drawer/withDrawerActions';

export function ElementCustomizeFields({ id }: { id?: string }) {
  return (
    <Group
      id={id}
      spacing={0}
      align={'stretch'}
      noWrap
      className={`${styles.root} ${styles.controls}`}
      data-testId="customize-controls"
    >
      <ElementCustomizeTabs />
      <ElementCustomizeFieldsMain />
    </Group>
  );
}

export function ElementCustomizeFieldsMain() {
  const { currentTabId } = useElementCustomizeTabsController();
  const { CustomizeTabs } = useElementCustomizeContext();

  const CustomizeTabPanel = React.useMemo(
    () =>
      React.Children.map(CustomizeTabs, (tab) => {
        if (React.isValidElement(tab) && tab.props.id === currentTabId) {
          return tab;
        }
        return null;
      })?.filter(Boolean),
    [CustomizeTabs, currentTabId],
  );

  return (
    <Stack spacing={0} className={styles.mainFields}>
      <ElementCustomizeHeader label={'Customize'} />

      <Stack spacing={0} flex="1 1 auto" className={styles.fieldsBody}>
        <Box
          flex={'1 1'}
          className={styles.fieldsScroll}
          data-testId="customize-fields-scroll"
        >
          {CustomizeTabPanel}
        </Box>
        <ElementCustomizeFooterActions />
      </Stack>
    </Stack>
  );
}

function ElementCustomizeFooterActionsRoot({
  closeDrawer,
}: WithDrawerActionsProps) {
  const { name } = useDrawerContext();
  const { submitForm, isSubmitting } = useFormikContext();

  const handleSubmitBtnClick = () => {
    submitForm();
  };
  const handleCancelBtnClick = () => {
    closeDrawer(name);
  };

  return (
    <Group spacing={10} className={styles.footerActions}>
      <Button
        onClick={handleSubmitBtnClick}
        intent={Intent.PRIMARY}
        style={{ minWidth: 75 }}
        loading={isSubmitting}
        type={'submit'}
      >
        Save
      </Button>
      <Button onClick={handleCancelBtnClick}>Cancel</Button>
    </Group>
  );
}

const ElementCustomizeFooterActions = FF.pipe(
  ElementCustomizeFooterActionsRoot,
  withDrawerActions,
);
