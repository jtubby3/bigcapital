import styles from './ElementCustomize.module.scss';
import { useElementCustomizeContext } from './ElementCustomizeProvider';
import { Stack } from '@/components';

export function ElementCustomizePreviewContent() {
  const { PaperTemplate } = useElementCustomizeContext();

  return (
    <Stack
      backgroundColor="var(--color-element-customize-preview-background)"
      overflow="auto"
      flex="1 1 0%"
      spacing={0}
      className={styles.previewContent}
    >
      {PaperTemplate}
    </Stack>
  );
}
