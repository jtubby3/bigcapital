import { useCustomerReturnTo } from '@/hooks/useCustomerReturnTo';
import { Intent } from '@blueprintjs/core';
import { css } from '@emotion/css';
import { Formik, Form, FormikHelpers } from 'formik';
import * as FF from 'fp-ts/function';
import { sumBy, isEmpty, defaultTo } from 'lodash';
import React from 'react';
import intl from 'react-intl-universal';
import { useHistory, useLocation } from 'react-router-dom';
import {
  InvoiceExchangeRateSync,
  InvoiceNoSyncSettingsToForm,
} from './components';
import { InvoiceTemplateDefaultsSync } from './InvoiceTemplateDefaultsSync';
import { InvoiceEntryWorkspace } from './InvoiceEntryWorkspace';
import { downloadInvoiceDocument } from './invoiceWorkflow';
import { DRAWERS } from '@/constants/drawers';
import {
  useAuthToken,
  useAuthOrganizationId,
  useDrawerActions,
  useDialogActions,
} from '@/hooks/state';
import { InvoiceFloatingActions } from './InvoiceFloatingActions';
import {
  getCreateInvoiceFormSchema,
  getEditInvoiceFormSchema,
} from './InvoiceForm.schema';
import { InvoiceFormActions } from './InvoiceFormActions';
import { InvoiceFormDialogs } from './InvoiceFormDialogs';
import { InvoiceFormFooter } from './InvoiceFormFooter';
import { InvoiceFormHeader } from './InvoiceFormHeader';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import { InvoiceFormTopBar } from './InvoiceFormTopBar';
import { InvoiceItemsEntriesEditorField } from './InvoiceItemsEntriesEditorField';
import {
  transformToEditForm,
  defaultInvoice,
  transformErrors,
  transformValueToRequest,
  resetFormState,
} from './utils';
import type { InvoiceFormValues } from './utils';
import { AppToaster, Box } from '@/components';
import { PageForm } from '@/components/PageForm';
import { withDashboardActions } from '@/containers/Dashboard/withDashboardActions';
import { useCurrentOrganizationBaseCurrency } from '@/hooks/query';
import { orderingLinesIndexes, transactionNumber } from '@/utils';

type InvoiceFormRootProps = Record<string, never>;

/**
 * Invoice form.
 */
function InvoiceFormRoot({}: InvoiceFormRootProps) {
  const baseCurrency = useCurrentOrganizationBaseCurrency();

  const history = useHistory();
  const customerReturnTo = useCustomerReturnTo();
  const { state: customerLocation } = useLocation<{ customerId?: number }>();
  const token = useAuthToken();
  const organizationId = useAuthOrganizationId();
  const { openDrawer } = useDrawerActions();
  const { openDialog } = useDialogActions();

  // Invoice form context.
  const {
    isNewMode,
    customers,
    invoice,
    estimateId,
    newInvoice,
    createInvoiceMutate,
    editInvoiceMutate,
    submitPayload,
    saleInvoiceState,
    invoiceSettings,
  } = useInvoiceFormContext();

  const invoiceNextNumber = invoiceSettings?.nextNumber as number | undefined;
  const invoiceNumberPrefix = invoiceSettings?.numberPrefix as
    | string
    | undefined;
  const invoiceAutoIncrementMode = invoiceSettings?.autoIncrement as
    | boolean
    | undefined;
  const invoiceCustomerNotes = invoiceSettings?.customerNotes as
    | string
    | undefined;
  const invoiceTermsConditions = invoiceSettings?.termsConditions as
    | string
    | undefined;

  const selectedCustomer = customers.find(
    (c) => c.id === customerLocation?.customerId,
  );

  // Invoice number.
  const invoiceNumber = transactionNumber(
    invoiceNumberPrefix,
    invoiceNextNumber,
  );
  // Form initial values.
  const isEditMode = !isEmpty(invoice) && !!invoice;
  const initialValues: InvoiceFormValues = isEditMode
    ? transformToEditForm(invoice)
    : {
        ...defaultInvoice,
        // If the auto-increment mode is enabled, take the next invoice
        // number from the settings.
        ...(invoiceAutoIncrementMode && {
          invoiceNo: invoiceNumber,
        }),
        entries: orderingLinesIndexes(defaultInvoice.entries),
        currencyCode: baseCurrency ?? '',
        invoiceMessage: defaultTo(invoiceCustomerNotes, ''),
        termsConditions: defaultTo(invoiceTermsConditions, ''),
        pdfTemplateId: saleInvoiceState?.defaultTemplateId ?? '',
        ...(Array.isArray(newInvoice) ? {} : newInvoice),
        ...(!estimateId && selectedCustomer
          ? {
              customerId: selectedCustomer.id,
              currencyCode: selectedCustomer.currencyCode,
              paymentTermsDays:
                selectedCustomer.customerProfile?.paymentTermsDays == null
                  ? ''
                  : String(selectedCustomer.customerProfile.paymentTermsDays),
            }
          : {}),
      };
  // Handles form submit.
  const handleSubmit = (
    values: InvoiceFormValues,
    { setSubmitting, setErrors, resetForm }: FormikHelpers<InvoiceFormValues>,
  ) => {
    setSubmitting(true);

    const entries = values.entries.filter(
      (item) => item.itemId && item.quantity,
    );
    const totalQuantity = sumBy(
      entries,
      (entry) => Number(entry.quantity) || 0,
    );

    // Throw danger toaster in case total quantity equals zero.
    if (totalQuantity === 0) {
      AppToaster.show({
        message: intl.get('quantity_cannot_be_zero_or_empty'),
        intent: Intent.DANGER,
      });
      setSubmitting(false);
      return;
    }
    // Transformes the values of the form to request.
    const form = {
      ...transformValueToRequest(values),
      delivered: submitPayload?.deliver ?? false,
      fromEstimateId: estimateId ? Number(estimateId) : undefined,
    };
    // Handle the request success.
    const onSuccess = async (created?: { id: number }) => {
      AppToaster.show({
        message: intl.get(
          isNewMode
            ? 'the_invoice_has_been_created_successfully'
            : 'the_invoice_has_been_edited_successfully',
          { number: values.invoiceNo },
        ),
        intent: Intent.SUCCESS,
      });
      setSubmitting(false);

      const savedId = invoice?.id ?? created?.id;
      if (submitPayload?.action && savedId) {
        if (isNewMode)
          history.replace(`/invoices/${savedId}/edit`, customerLocation);
        if (submitPayload.action === 'review-email') {
          openDrawer(DRAWERS.INVOICE_SEND_MAIL, { invoiceId: savedId });
        } else if (
          submitPayload.action === 'packing-slip-preview' ||
          submitPayload.action === 'invoice-preview'
        ) {
          openDialog('invoice-pdf-preview', {
            invoiceId: savedId,
            documentType:
              submitPayload.action === 'packing-slip-preview'
                ? 'packing-slip'
                : 'invoice',
          });
        } else {
          try {
            await downloadInvoiceDocument(
              savedId,
              submitPayload.action,
              token || '',
              organizationId || '',
            );
          } catch (error) {
            AppToaster.show({
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to generate the document.',
              intent: Intent.DANGER,
            });
          }
        }
        return;
      }
      if (!isNewMode && submitPayload?.resetForm) {
        history.push('/invoices/new');
        return;
      }
      if (
        isNewMode &&
        savedId &&
        !submitPayload?.redirect &&
        !submitPayload?.resetForm
      ) {
        history.replace(`/invoices/${savedId}/edit`);
      }
      if (submitPayload?.redirect) {
        history.push(customerReturnTo || '/invoices');
      }
      if (submitPayload?.resetForm) {
        resetFormState({ resetForm, initialValues, values });
      }
    };
    // Handle the request error.
    const onError = (error: unknown) => {
      const body = (
        error as {
          data?: { errors?: Array<{ type: string }>; message?: string };
        }
      )?.data;
      if (body && Array.isArray(body.errors))
        transformErrors(body.errors, { setErrors });
      else
        AppToaster.show({
          message:
            typeof body?.message === 'string'
              ? body.message
              : 'The invoice could not be saved. Please check the fields and try again.',
          intent: Intent.DANGER,
        });
      setSubmitting(false);
    };
    if (isEditMode && invoice) {
      editInvoiceMutate([invoice.id, form])
        .then(() => onSuccess({ id: invoice.id }))
        .catch(onError);
    } else {
      createInvoiceMutate(form).then(onSuccess).catch(onError);
    }
  };
  // Create invoice form schema.
  const CreateInvoiceFormSchema = getCreateInvoiceFormSchema();

  // Edit invoice form schema.
  const EditInvoiceFormSchema = getEditInvoiceFormSchema();

  return (
    <Formik<InvoiceFormValues>
      validationSchema={
        isNewMode ? CreateInvoiceFormSchema : EditInvoiceFormSchema
      }
      initialValues={initialValues}
      onSubmit={handleSubmit}
    >
      <Form
        className={css({
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        })}
      >
        <PageForm flex={1}>
          <PageForm.Body>
            <InvoiceEntryWorkspace>
              <InvoiceFormTopBar />
              <InvoiceFormHeader />

              <Box p="24px 32px 0">
                <h3 style={{ fontSize: 14, margin: '0 0 18px' }}>
                  Product or service
                </h3>
                <InvoiceFormActions />
                <InvoiceItemsEntriesEditorField />
              </Box>
              <InvoiceFormFooter />
            </InvoiceEntryWorkspace>
          </PageForm.Body>

          <PageForm.Footer>
            <InvoiceFloatingActions />
          </PageForm.Footer>

          {/*---------- Dialogs ----------*/}
          <InvoiceFormDialogs />

          {/*---------- Effects ----------*/}
          <InvoiceTemplateDefaultsSync />
          <InvoiceNoSyncSettingsToForm />
          <InvoiceExchangeRateSync />
        </PageForm>
      </Form>
    </Formik>
  );
}

export const InvoiceForm = FF.pipe(InvoiceFormRoot, withDashboardActions);
