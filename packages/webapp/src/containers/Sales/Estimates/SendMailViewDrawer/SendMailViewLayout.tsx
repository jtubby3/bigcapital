import React from 'react';
import { Stack } from '@/components';
import styles from './SendMailViewLayout.module.scss';
import { useIsDarkMode } from '@/hooks/useDarkMode';

interface SendMailViewLayoutProps {
  header?: React.ReactNode;
  fields?: React.ReactNode;
  preview?: React.ReactNode;
}

export function SendMailViewLayout({
  header,
  fields,
  preview,
}: SendMailViewLayoutProps) {
  const isDarkMode = useIsDarkMode();

  return (
    <Stack spacing={0} flex={1} minHeight={0} overflow="hidden">
      {header}

      <div className={styles.body}>
        <Stack
          bg={isDarkMode ? 'var(--color-dark-gray2)' : 'white'}
          className={styles.fields}
          spacing={0}
          borderRightWidth={1}
          borderRightStyle="solid"
          borderRightColor={isDarkMode ? 'rgba(255, 255, 255, 0.2)' : '#dcdcdd'}
        >
          {fields}
        </Stack>

        <Stack
          bg={isDarkMode ? 'var(--color-dark-gray2)' : '#F5F5F5'}
          className={styles.preview}
        >
          {preview}
        </Stack>
      </div>
    </Stack>
  );
}
