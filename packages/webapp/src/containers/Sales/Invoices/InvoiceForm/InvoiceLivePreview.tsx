import { InvoicePaperTemplate } from '@bigcapital/pdf-templates';
import { Spinner } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import React from 'react';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import {
  useInvoiceAggregatedTaxRates,
  useInvoiceDueAmountFormatted,
  useInvoicePaidAmountFormatted,
  useInvoiceSubtotalFormatted,
  useInvoiceTotalFormatted,
  useInvoiceDiscountAmountFormatted,
} from './utils';
import type { InvoiceFormValues } from './utils';
import {
  useGetPdfTemplate,
  useGetPdfTemplateBrandingState,
} from '@/hooks/query/pdf-templates';
import { formattedAmount } from '@/utils';

export function InvoiceLivePreview() {
  const { values } = useFormikContext<InvoiceFormValues>();
  const { items, saleInvoiceState } = useInvoiceFormContext();
  const id = Number(
    values.pdfTemplateId || saleInvoiceState?.defaultTemplateId || 0,
  );
  const { data: template, isLoading } = useGetPdfTemplate(id ?? 0, {
    enabled: Boolean(id),
  });
  const { data: branding, isLoading: brandingLoading } =
    useGetPdfTemplateBrandingState();
  const total = useInvoiceTotalFormatted();
  const subtotal = useInvoiceSubtotalFormatted();
  const dueAmount = useInvoiceDueAmountFormatted();
  const paymentMade = useInvoicePaidAmountFormatted();
  const discount = useInvoiceDiscountAmountFormatted();
  const taxes = useInvoiceAggregatedTaxRates();
  if (isLoading || brandingLoading) return <Spinner />;
  return (
    <InvoicePaperTemplate
      {...branding}
      {...template?.attributes}
      companyLogoUri={template?.companyLogoUri || branding?.companyLogoUri}
      invoiceNumber={values.invoiceNo}
      dateIssue={values.invoiceDate}
      dueDate={values.dueDate}
      billingAddressText={values.billingAddressText ?? ''}
      shippingAddressText={values.shippingAddressText ?? ''}
      shippingMethod={values.shippingMethod}
      shippingDate={values.shippingDate}
      trackingNo={values.trackingNo}
      referenceNo={values.referenceNo}
      paymentInstructions={values.paymentInstructions}
      paymentTerms={
        values.paymentTermsDays === ''
          ? ''
          : values.paymentTermsDays === '0'
            ? 'Due on receipt'
            : `Net ${values.paymentTermsDays}`
      }
      termsConditions={values.termsConditions}
      statement={values.invoiceMessage}
      total={total}
      subtotal={subtotal}
      dueAmount={dueAmount}
      paymentMade={paymentMade}
      discount={Number(values.discount) ? discount : ''}
      adjustment={
        Number(values.adjustment)
          ? formattedAmount(Number(values.adjustment), values.currencyCode)
          : ''
      }
      shippingCharge={
        Number(values.shippingCharge)
          ? formattedAmount(Number(values.shippingCharge), values.currencyCode)
          : ''
      }
      taxes={taxes.map((tax) => ({
        label: tax.label,
        amount: tax.taxAmountFormatted,
      }))}
      lines={values.entries
        .filter((entry) => entry.itemId)
        .map((entry) => ({
          item:
            items.find((item) => String(item.id) === String(entry.itemId))
              ?.name || '',
          description: entry.description,
          quantity: String(entry.quantity),
          quantityValue: Number(entry.quantity),
          rate: formattedAmount(Number(entry.rate), values.currencyCode),
          discount: Number(entry.discount)
            ? formattedAmount(
                (Number(entry.rate) *
                  Number(entry.quantity) *
                  Number(entry.discount)) /
                  100,
                values.currencyCode,
              )
            : '',
          total: formattedAmount(
            Number(entry.amount) +
              (values.inclusiveExclusiveTax === 'exclusive'
                ? Number(entry.taxAmount || 0)
                : 0),
            values.currencyCode,
          ),
        }))}
    />
  );
}
