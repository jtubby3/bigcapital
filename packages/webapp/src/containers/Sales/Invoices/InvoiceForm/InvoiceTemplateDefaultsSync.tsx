import { useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import { useGetPdfTemplate } from '@/hooks/query/pdf-templates';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import type { InvoiceFormValues } from './utils';
export function InvoiceTemplateDefaultsSync() {
  const { values, setFieldValue, touched } =
    useFormikContext<InvoiceFormValues>();
  const { isNewMode, saleInvoiceState } = useInvoiceFormContext();
  const id = Number(
    values.pdfTemplateId || saleInvoiceState?.defaultTemplateId || 0,
  );
  const { data } = useGetPdfTemplate(id, { enabled: !!id && isNewMode });
  const applied = useRef<number | null>(null);
  const previousDefault = useRef(saleInvoiceState?.defaultTemplateId);
  useEffect(() => {
    const nextDefault = saleInvoiceState?.defaultTemplateId;
    if (
      isNewMode &&
      nextDefault !== previousDefault.current &&
      String(values.pdfTemplateId || '') ===
        String(previousDefault.current || '')
    ) {
      setFieldValue('pdfTemplateId', nextDefault || '', false);
    }
    previousDefault.current = nextDefault;
  }, [
    isNewMode,
    saleInvoiceState?.defaultTemplateId,
    values.pdfTemplateId,
    setFieldValue,
  ]);
  useEffect(() => {
    if (!isNewMode || !data || applied.current === id) return;
    applied.current = id;
    const a = data.attributes as Record<string, unknown>;
    if (
      !touched.invoiceMessage &&
      typeof a.defaultInvoiceMessage === 'string' &&
      a.defaultInvoiceMessage
    )
      setFieldValue('invoiceMessage', a.defaultInvoiceMessage, false);
    if (
      !touched.paymentInstructions &&
      typeof a.defaultPaymentInstructions === 'string' &&
      a.defaultPaymentInstructions
    )
      setFieldValue('paymentInstructions', a.defaultPaymentInstructions, false);
  }, [
    id,
    data,
    isNewMode,
    touched.invoiceMessage,
    touched.paymentInstructions,
    setFieldValue,
  ]);
  return null;
}
