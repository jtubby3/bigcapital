import { TabProps } from '@blueprintjs/core';
import React from 'react';
import { useBrandingState } from '../BrandingTemplates/_utils';
import { ElementPreviewState } from '../BrandingTemplates/types';
import { ElementCustomizeWorkspace } from './ElementCustomizeWorkspace';
import { ElementCustomizeProvider } from './ElementCustomizeProvider';
import {
  ElementCustomizeForm,
  ElementCustomizeFormProps,
} from './ElementCustomizerForm';
import { ElementCustomizeTabsControllerProvider } from './ElementCustomizeTabsController';
import type { FormikValues } from 'formik';
import { extractChildren } from '@/utils/extract-children';

export interface ElementCustomizeProps<T extends FormikValues, Y>
  extends ElementCustomizeFormProps<T> {
  brandingState?: Y;
  children?: React.ReactNode;
}

export interface ElementCustomizeContentProps {
  children?: React.ReactNode;
}

export function ElementCustomizeContent({
  children,
}: ElementCustomizeContentProps) {
  const PaperTemplate = React.useMemo(
    () => extractChildren(children, ElementCustomize.PaperTemplate),
    [children],
  );
  const CustomizeTabs = React.useMemo(
    () => extractChildren(children, ElementCustomize.FieldsTab),
    [children],
  );
  const brandingState = useBrandingState();
  const value = { PaperTemplate, CustomizeTabs, brandingState };

  return (
    <ElementCustomizeTabsControllerProvider>
      <ElementCustomizeProvider value={value}>
        <ElementCustomizeWorkspace />
      </ElementCustomizeProvider>
    </ElementCustomizeTabsControllerProvider>
  );
}

export function ElementCustomize<
  T extends FormikValues,
  Y extends ElementPreviewState,
>({
  initialValues,
  validationSchema,
  onSubmit,
  children,
}: ElementCustomizeProps<T, Y>) {
  return (
    <ElementCustomizeForm
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      {children}
    </ElementCustomizeForm>
  );
}

export interface ElementCustomizePaperTemplateProps {
  children?: React.ReactNode;
}

ElementCustomize.PaperTemplate = ({
  children,
}: ElementCustomizePaperTemplateProps) => {
  return <>{children}</>;
};

export interface ElementCustomizeFieldsTabProps {
  id: string;
  label: string;
  children?: React.ReactNode;
  tabProps?: Partial<TabProps>;
}

ElementCustomize.FieldsTab = ({
  id,
  label,
  children,
}: ElementCustomizeFieldsTabProps) => {
  return <>{children}</>;
};
