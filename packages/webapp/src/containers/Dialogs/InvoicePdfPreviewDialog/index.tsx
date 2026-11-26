import classNames from 'classnames';
import * as FF from 'fp-ts/function';
import React, { lazy } from 'react';
import { T, Dialog, DialogSuspense } from '@/components';
import withDialogRedux from '@/components/DialogReduxConnect';
import { CLASSES } from '@/constants/classes';

// Lazy loading the content.
const PdfPreviewDialogContent = lazy(() =>
  import('./InvoicePdfPreviewDialogContent').then((m) => ({
    default: m.InvoicePdfPreviewDialogContent,
  })),
);

interface InvoicePdfPreviewDialogProps {
  dialogName: string;
  payload: {
    invoiceId: number | null;
    documentType?: 'invoice' | 'packing-slip';
  };
  isOpen: boolean | undefined;
}

/**
 * Invoice PDF preview dialog.
 */
function InvoicePdfPreviewDialog({
  dialogName,
  payload,
  isOpen,
}: InvoicePdfPreviewDialogProps): React.ReactElement {
  return (
    <Dialog
      name={dialogName}
      title={
        payload?.documentType === 'packing-slip' ? (
          'Packing slip'
        ) : (
          <T id={'invoice_preview.dialog.title'} />
        )
      }
      className={classNames(CLASSES.DIALOG_PDF_PREVIEW)}
      autoFocus={true}
      canEscapeKeyClose={true}
      isOpen={isOpen}
      style={{ width: '1000px' }}
    >
      <DialogSuspense>
        <PdfPreviewDialogContent
          key={`${payload?.invoiceId}-${payload?.documentType || 'invoice'}`}
          dialogName={dialogName}
          subscriptionForm={payload}
        />
      </DialogSuspense>
    </Dialog>
  );
}

export const index = FF.pipe(InvoicePdfPreviewDialog, withDialogRedux());
