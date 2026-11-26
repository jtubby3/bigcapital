import { Spinner, Tab } from '@blueprintjs/core';
import fieldStyles from './InvoiceEditorControls.module.scss';
import { lazy, Suspense } from 'react';
import {
  ElementCustomize,
  ElementCustomizeContent,
} from '../../../ElementCustomize/ElementCustomize';
import { initialValues } from './constants';
import { InvoiceHeaderFields } from './InvoiceHeaderFields';
import { InvoiceFooterFields } from './InvoiceFooterFields';
import { InvoiceEmailFields } from './InvoiceEmailFields';
import { InvoiceFooterImageFields } from './InvoiceFooterImageFields';
import { InvoiceAddressFields } from './InvoiceAddressFields';
import { InvoiceColumnFields } from './InvoiceColumnFields';
import { InvoiceCustomizeSchema } from './InvoiceCustomizeForm.schema';
import { InvoiceCustomizeGeneralField } from './InvoiceCustomizeGeneralFields';
import { InvoiceCustomizeTabs } from './InvoiceCustomizeTabs';
import { InvoiceCustomizeContentFields } from './InvoiceCutomizeContentFields';
import { InvoiceLayoutDesigner } from './InvoiceLayoutDesigner';
import { InvoiceLayoutFields } from './InvoiceLayoutFields';
import { InvoiceCustomizeFormValues, InvoiceCustomizeState } from './types';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { BrandingTemplateForm } from '@/containers/BrandingTemplates/BrandingTemplateForm';
import { useIsTemplateNamedFilled } from '@/containers/BrandingTemplates/utils';
import { useDrawerActions } from '@/hooks/state';

const InvoiceCustomizePaymentPreview = lazy(() =>
  import('./InvoiceCustomizePaymentPreview').then((module) => ({
    default: module.InvoiceCustomizePaymentPreview,
  })),
);

const InvoiceCustomizeMailReceiptPreview = lazy(() =>
  import('./InvoiceCustomizeMailReceiptPreview').then((module) => ({
    default: module.InvoiceCustomizeMailReceiptPreview,
  })),
);

const InvoiceCustomizePdfPreview = lazy(() =>
  import('./InvoiceCustomizePdfPreview').then((module) => ({
    default: module.InvoiceCustomizePdfPreview,
  })),
);

/**
 * Invoice branding template customize.
 * @return {JSX.Element}
 */
export function InvoiceCustomizeContent() {
  const { payload, name } = useDrawerContext();
  const { closeDrawer } = useDrawerActions();
  const templateId = payload?.templateId || null;

  const handleSuccess = () => {
    closeDrawer(name);
  };

  return (
    <BrandingTemplateForm<InvoiceCustomizeFormValues, InvoiceCustomizeState>
      templateId={templateId}
      defaultValues={initialValues}
      validationSchema={InvoiceCustomizeSchema}
      onSuccess={handleSuccess}
      resource={'SaleInvoice'}
    >
      <InvoiceCustomizeFormContent />
    </BrandingTemplateForm>
  );
}

/**
 * Invoice branding template customize preview and fields.
 * @returns {JSX.Element}
 */
function InvoiceCustomizeFormContent() {
  const isTemplateNameFilled = useIsTemplateNamedFilled();

  return (
    <div className={fieldStyles.root}>
      <ElementCustomizeContent>
        <ElementCustomize.PaperTemplate>
          <InvoiceCustomizeTabs
            defaultSelectedTabId={'pdf-document'}
            id={'customize-preview-tabs'}
            renderActiveTabPanelOnly
          >
            <Tab
              id="pdf-document"
              title={'PDF document'}
              panel={
                <Suspense fallback={<Spinner />}>
                  <InvoiceCustomizePdfPreview />
                </Suspense>
              }
            />
            <Tab
              id="visual-designer"
              title="Visual designer"
              panel={<InvoiceLayoutDesigner />}
            />
            <Tab
              id={'payment-page'}
              title={'Payment page'}
              panel={
                <Suspense fallback={<Spinner />}>
                  <InvoiceCustomizePaymentPreview />
                </Suspense>
              }
            />
            <Tab
              id={'email-receipt'}
              title={'Email receipt'}
              panel={
                <Suspense fallback={<Spinner />}>
                  <InvoiceCustomizeMailReceiptPreview mx={'auto'} />
                </Suspense>
              }
            />
          </InvoiceCustomizeTabs>
        </ElementCustomize.PaperTemplate>

        <ElementCustomize.FieldsTab id={'general'} label={'General'}>
          <InvoiceCustomizeGeneralField />
        </ElementCustomize.FieldsTab>

        <ElementCustomize.FieldsTab
          id="header"
          label="Header"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceHeaderFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="footer"
          label="Footer"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceFooterFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="email"
          label="Email"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceEmailFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="layout"
          label="Layout"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceLayoutFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="addresses"
          label="Addresses"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceAddressFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="columns"
          label="Columns"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceColumnFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id="footer-image"
          label="Bottom image"
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceFooterImageFields />
        </ElementCustomize.FieldsTab>
        <ElementCustomize.FieldsTab
          id={'content'}
          label={'Content'}
          tabProps={{ disabled: !isTemplateNameFilled }}
        >
          <InvoiceCustomizeContentFields />
        </ElementCustomize.FieldsTab>
      </ElementCustomizeContent>
    </div>
  );
}
