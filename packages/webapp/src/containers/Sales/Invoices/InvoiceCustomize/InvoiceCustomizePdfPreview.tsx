import {
  InvoicePaperTemplate,
  InvoicePaperTemplateProps,
  InvoiceSectionId,
  invoicePreviewAddresses,
} from '@bigcapital/pdf-templates';
import { useElementCustomizeTabsController } from '@/containers/ElementCustomize/ElementCustomizeTabsController';
import { useFormikContext } from 'formik';
import * as FF from 'fp-ts/function';
import { initialValues } from './constants';
import { InvoiceCustomizeFormValues } from './types';
import { InvoicePreviewFit } from './InvoicePreviewFit';
import { useElementCustomizeContext } from '@/containers/ElementCustomize/ElementCustomizeProvider';
import {
  paperTemplatePreviewStyle,
  pickPaperTemplateProps,
} from '@/containers/ElementCustomize/paperTemplatePreview';

/**
 * Injects the `InvoicePaperTemplate` component props from the form and branding states.
 * @param {React.ComponentType<P>} Component
 * @returns {JSX.Element}
 */
const withInvoicePreviewTemplateProps = <P extends object>(
  Component: React.ComponentType<P>,
) => {
  return (props: Omit<P, keyof InvoicePaperTemplateProps>) => {
    const { values } = useFormikContext<InvoiceCustomizeFormValues>();
    const { setCurrentTabId, currentTabId } =
      useElementCustomizeTabsController();
    const { brandingState } = useElementCustomizeContext();

    const mergedProps = pickPaperTemplateProps<InvoicePaperTemplateProps>(
      { ...brandingState, ...values },
      initialValues,
    );

    return (
      <InvoicePreviewFit paperWidth={values.pageSize === 'letter' ? 816 : 794}>
        <style>{`[data-invoice-document] [role=group]:hover, [data-invoice-document] [role=group][aria-current=true] { outline: 1px dashed #95a7b8; }`}</style>
        <Component
          {...invoicePreviewAddresses}
          invoiceNumber="3299"
          dateIssue="11/05/2026"
          dueDate="11/20/2026"
          paymentTerms="Net 15"
          subtotal="1,130.00"
          shippingCharge="598.65"
          total="$1,728.65"
          dueAmount="$1,728.65"
          paymentMade="0.00"
          discount=""
          taxes={[]}
          termsConditions=""
          lines={[
            {
              item: 'PET12FB-28-198',
              description: '12oz PET "FB" Energy 38mm DBJ 28/gr (198/bdl)',
              quantity: '12',
              rate: '85.00',
              total: '1,020.00',
            },
            {
              item: 'CAP-BLACK',
              description: 'Black 358DBJ Screw Cap (2,500/cs)',
              quantity: '1',
              rate: '110.00',
              total: '110.00',
            },
          ]}
          {...(props as P)}
          {...mergedProps}
          statement={
            values.defaultInvoiceMessage ||
            'We appreciate your business and look forward to helping you again soon.'
          }
          paymentInstructions={values.defaultPaymentInstructions}
          sectionAttributes={(id: InvoiceSectionId) => {
            const target =
              id === 'items'
                ? 'columns'
                : ['customerAddress', 'shippingAddress'].includes(id)
                  ? 'addresses'
                  : ['totals', 'terms', 'statement', 'footer'].includes(id)
                    ? 'footer'
                    : 'header';
            return {
              role: 'group',
              tabIndex: 0,
              'aria-label': `Edit ${id} section`,
              'aria-current': currentTabId === target ? 'true' : undefined,
              onClick: () => setCurrentTabId(target),
              onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setCurrentTabId(target);
                }
              },
              style: {
                cursor: 'pointer',
                outline:
                  currentTabId === target ? '1px dashed #9eabb8' : undefined,
              },
            };
          }}
          style={paperTemplatePreviewStyle}
        />
      </InvoicePreviewFit>
    );
  };
};

export const InvoiceCustomizePdfPreview = FF.pipe(
  InvoicePaperTemplate,
  withInvoicePreviewTemplateProps,
);
