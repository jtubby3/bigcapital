import { useFormikContext } from 'formik';
import type { InvoiceCustomizeFormValues } from './types';
import {
  FFormGroup,
  FInputGroup,
  FSwitch,
  FTextArea,
  Stack,
} from '@/components';
export function InvoiceFooterFields() {
  const { values, setFieldValue } =
    useFormikContext<InvoiceCustomizeFormValues>();
  return (
    <Stack spacing={14} style={{ padding: 20 }}>
      <h3>Footer and defaults</h3>
      <FFormGroup
        name="defaultInvoiceMessage"
        label="Default note to customer on new invoices"
      >
        <FTextArea name="defaultInvoiceMessage" rows={4} fill />
      </FFormGroup>
      <FFormGroup
        name="defaultPaymentInstructions"
        label="Default payment instructions on new invoices"
      >
        <FTextArea name="defaultPaymentInstructions" rows={3} fill />
      </FFormGroup>
      <FSwitch name="showStatement" label="Show note to customer" />
      <FFormGroup name="statementLabel" label="Customer note heading">
        <FInputGroup name="statementLabel" />
      </FFormGroup>
      <FSwitch name="showDiscount" label="Show discount" />
      <FSwitch name="showPaymentMade" label="Show payments received" />
      <FSwitch name="showDueAmount" label="Show balance due" />
      <FFormGroup name="footerText" label="Footer text">
        <FTextArea name="footerText" rows={4} fill />
      </FFormGroup>
      <FFormGroup name="footerTextSize" label="Footer text size (pixels)">
        <FInputGroup name="footerTextSize" type="number" min={8} max={32} />
      </FFormGroup>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        Footer text alignment
        <select
          className="bp4-input"
          aria-label="Footer text alignment"
          style={{ width: '100%', maxWidth: '100%' }}
          value={values.footerTextAlign}
          onChange={(event) =>
            setFieldValue('footerTextAlign', event.target.value)
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <p>
        Use Bottom image to upload an independent payment QR image below this
        content.
      </p>
    </Stack>
  );
}
