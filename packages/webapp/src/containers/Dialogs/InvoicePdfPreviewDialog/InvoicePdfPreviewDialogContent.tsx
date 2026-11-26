import { AnchorButton, Callout, Intent } from '@blueprintjs/core';
import * as FF from 'fp-ts/function';
import React from 'react';
import type { WithDialogActionsProps } from '@/containers/Dialog/withDialogActions';
import { DialogContent, PdfDocumentPreview } from '@/components';
import { withDialogActions } from '@/containers/Dialog/withDialogActions';
import { usePdfInvoice } from '@/hooks/query';

interface InvoicePdfPreviewDialogContentProps extends WithDialogActionsProps {
  subscriptionForm: {
    invoiceId: number | null;
    documentType?: 'invoice' | 'packing-slip';
  };
  dialogName?: string;
}

function InvoicePdfPreviewDialogContentInner({
  subscriptionForm: { invoiceId, documentType = 'invoice' },
}: InvoicePdfPreviewDialogContentProps): React.ReactElement {
  const { isLoading, isError, pdfUrl, filename } = usePdfInvoice(
    invoiceId as number,
    documentType,
  );

  return (
    <DialogContent>
      <div className="dialog__header-actions">
        <AnchorButton
          disabled={isLoading || isError || !pdfUrl}
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          minimal={true}
          outlined={true}
        >
          {documentType === 'packing-slip'
            ? 'Open / print packing slip'
            : 'Open / print invoice'}
        </AnchorButton>

        <AnchorButton
          disabled={isLoading || isError || !pdfUrl}
          href={pdfUrl}
          download={filename}
          minimal={true}
          outlined={true}
        >
          {documentType === 'packing-slip'
            ? 'Download packing slip'
            : 'Download invoice'}
        </AnchorButton>
      </div>

      {isError && (
        <Callout intent={Intent.DANGER}>
          The document could not be generated. Close this preview and try again.
        </Callout>
      )}
      <PdfDocumentPreview
        height={760}
        width={1000}
        isLoading={isLoading}
        isError={isError}
        url={pdfUrl}
      />
    </DialogContent>
  );
}

export const InvoicePdfPreviewDialogContent = FF.pipe(
  InvoicePdfPreviewDialogContentInner,
  withDialogActions,
);
