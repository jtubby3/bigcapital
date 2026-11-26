import * as FF from 'fp-ts/function';
import styles from './ElementCustomize.module.scss';
import { ElementCustomizeHeader } from './ElementCustomizeHeader';
import { ElementCustomizePreviewContent } from './ElementCustomizePreviewContent';
import type { WithDrawerActionsProps } from '@/containers/Drawer/withDrawerActions';
import { Stack } from '@/components';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { withDrawerActions } from '@/containers/Drawer/withDrawerActions';

function ElementCustomizePreviewRoot({ closeDrawer }: WithDrawerActionsProps) {
  const { name } = useDrawerContext();

  const handleCloseBtnClick = () => {
    closeDrawer(name);
  };
  return (
    <Stack
      spacing={0}
      className={styles.preview}
      data-testId="customize-preview"
    >
      <ElementCustomizeHeader
        label={'Preview'}
        closeButton
        onClose={handleCloseBtnClick}
      />
      <ElementCustomizePreviewContent />
    </Stack>
  );
}

export const ElementCustomizePreview = FF.pipe(
  ElementCustomizePreviewRoot,
  withDrawerActions,
);
