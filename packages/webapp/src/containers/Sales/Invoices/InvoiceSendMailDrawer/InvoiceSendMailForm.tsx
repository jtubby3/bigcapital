import { Button, Callout, Intent, Spinner } from '@blueprintjs/core';
import { css } from '@emotion/css';
import { Form, Formik, FormikHelpers } from 'formik';
import { useState } from 'react';
import { InvoiceSendMailFormValues } from './_types';
import { useInvoiceSendMailBoot } from './InvoiceSendMailContentBoot';
import { InvoiceSendMailFormSchema } from './InvoiceSendMailForm.schema';
import { AppToaster } from '@/components';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { useSendSaleInvoiceMail } from '@/hooks/query';
import { useDrawerActions } from '@/hooks/state';
import { transformToForm } from '@/utils';
import {
  packingSlipError,
  packingSlipPermissionDenied,
  useInvoicePackingSlips,
  usePackingSlipApi,
  usePackingSlipPermissions,
} from '../PackingSlips/usePackingSlips';

const initialValues: InvoiceSendMailFormValues = {
  subject: '',
  message: '',
  to: [],
  cc: [],
  bcc: [],
  attachPdf: true,
  packingSlips: [],
};

interface InvoiceSendMailFormProps {
  children: React.ReactNode;
}

async function showMailResult(
  api: ReturnType<typeof usePackingSlipApi>,
  jobId: string,
) {
  const deadline = new AbortController();
  const timeout = window.setTimeout(() => deadline.abort(), 60_000);
  let statusUnavailable = false;
  try {
    while (!deadline.signal.aborted) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      if (deadline.signal.aborted) break;
      try {
        const result = await api.get<{ state: string; error?: string }>(
          `/mail-jobs/${encodeURIComponent(jobId)}`,
          deadline.signal,
        );
        statusUnavailable = false;
        if (result.state === 'completed') {
          AppToaster.show({
            message: 'Invoice email sent.',
            intent: Intent.SUCCESS,
          });
          return;
        }
        if (result.state === 'failed') {
          AppToaster.show({
            message: result.error
              ? `Invoice email failed. ${result.error}`
              : 'Invoice email failed.',
            intent: Intent.DANGER,
            timeout: 0,
          });
          return;
        }
      } catch {
        statusUnavailable = true;
      }
    }
    AppToaster.show({
      message: statusUnavailable
        ? 'The invoice email was queued. Its current status could not be checked.'
        : 'The invoice email is still queued or processing.',
      intent: Intent.WARNING,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function InvoiceSendMailForm({ children }: InvoiceSendMailFormProps) {
  const { mutateAsync: sendInvoiceMail } = useSendSaleInvoiceMail();
  const { invoiceId, invoiceMailState } = useInvoiceSendMailBoot();
  const slips = useInvoicePackingSlips(invoiceId);
  const { canView } = usePackingSlipPermissions();
  const api = usePackingSlipApi();
  const [excludeForbiddenSlips, setExcludeForbiddenSlips] = useState(false);
  const loadSlips = canView && !excludeForbiddenSlips;
  const forbidden = packingSlipPermissionDenied(slips.error);

  const { name } = useDrawerContext();
  const { closeDrawer } = useDrawerActions();

  if (
    loadSlips &&
    (slips.isLoading || (slips.isFetching && !slips.isFetchedAfterMount))
  )
    return <Spinner size={20} />;
  if (loadSlips && slips.isError && !slips.data)
    return (
      <Callout intent={Intent.DANGER}>
        Packing slips could not be loaded. {packingSlipError(slips.error)}
        <Button minimal onClick={() => slips.refetch()}>
          Retry
        </Button>
        {forbidden && (
          <Button onClick={() => setExcludeForbiddenSlips(true)}>
            Continue with invoice only
          </Button>
        )}
      </Callout>
    );
  const selectedSlips =
    canView && !forbidden
      ? (slips.data || []).filter((slip) => slip.status === 'attached')
      : [];
  const _initialValues: InvoiceSendMailFormValues = {
    ...initialValues,
    ...transformToForm(invoiceMailState, initialValues),
    attachPdf:
      excludeForbiddenSlips || selectedSlips.length > 0
        ? true
        : (invoiceMailState?.attachInvoice ?? true),
    packingSlips: selectedSlips.map(({ id, version }) => ({ id, version })),
  };
  const handleSubmit = (
    values: InvoiceSendMailFormValues,
    { setSubmitting }: FormikHelpers<InvoiceSendMailFormValues>,
  ) => {
    if (
      values.packingSlips.some(
        ({ id, version }) =>
          !selectedSlips.some(
            (slip) => slip.id === id && slip.version === version,
          ),
      )
    ) {
      AppToaster.show({
        message:
          'Remove changed packing slips from the selection before sending.',
        intent: Intent.DANGER,
      });
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    const { attachPdf, ...mailValues } = values;
    sendInvoiceMail({
      id: invoiceId,
      values: { ...mailValues, attachInvoice: attachPdf },
    })
      .then(({ jobId }) => {
        AppToaster.show({
          message: 'The invoice mail has been queued for sending.',
          intent: Intent.SUCCESS,
        });
        setSubmitting(false);
        closeDrawer(name);
        if (jobId) void showMailResult(api, jobId);
      })
      .catch((error) => {
        setSubmitting(false);
        if (loadSlips) void slips.refetch();
        AppToaster.show({
          message: packingSlipError(error),
          intent: Intent.DANGER,
        });
      });
  };

  return (
    <Formik
      initialValues={_initialValues}
      validationSchema={InvoiceSendMailFormSchema}
      onSubmit={handleSubmit}
    >
      <Form
        className={css`
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        `}
      >
        {children}
      </Form>
    </Formik>
  );
}
