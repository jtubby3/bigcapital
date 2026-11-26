import React from 'react';
import { FFormGroup, FTextArea } from '@/components';
import styles from './InvoiceEntryWorkspace.module.scss';

export function InvoiceFormFooterLeft() {
  return (
    <div className={styles.footerNotes}>
      <FFormGroup name="paymentInstructions" label="Payment instructions">
        <FTextArea
          name="paymentInstructions"
          rows={3}
          fill
          placeholder="Tell your customer how you want to get paid."
        />
      </FFormGroup>
      <FFormGroup name="invoiceMessage" label="Note to customer">
        <FTextArea
          name="invoiceMessage"
          rows={3}
          fill
          placeholder="A message for your customer"
        />
      </FFormGroup>
      <FFormGroup name="internalNotes" label="Internal notes (hidden)">
        <FTextArea
          name="internalNotes"
          rows={3}
          fill
          placeholder="Only your team can see these notes."
        />
      </FFormGroup>
      <FFormGroup name="statementMemo" label="Internal memo (hidden)">
        <FTextArea
          name="statementMemo"
          rows={2}
          fill
          placeholder="An internal reference retained with this invoice"
        />
      </FFormGroup>
      <details>
        <summary>Terms and conditions</summary>
        <FFormGroup name="termsConditions" label="Terms and conditions">
          <FTextArea name="termsConditions" rows={3} fill />
        </FFormGroup>
      </details>
    </div>
  );
}
