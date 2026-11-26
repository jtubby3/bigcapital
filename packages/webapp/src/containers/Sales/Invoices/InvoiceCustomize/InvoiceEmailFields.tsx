import {
  FFormGroup,
  FSwitch,
  FInputGroup,
  FTextArea,
  Stack,
} from '@/components';
export function InvoiceEmailFields() {
  return (
    <Stack spacing={14} style={{ padding: 20 }}>
      <h3>Invoice email</h3>
      <p>
        Set the defaults shown in Review and send. Each email can still be
        edited before sending.
      </p>
      <FFormGroup name="emailSubject" label="Email subject">
        <FInputGroup
          name="emailSubject"
          placeholder="Invoice {Invoice Number} from {Company Name}"
        />
      </FFormGroup>
      <FFormGroup name="emailMessage" label="Message to customer">
        <FTextArea
          name="emailMessage"
          rows={9}
          fill
          placeholder="Hi {Customer Name}, ..."
        />
      </FFormGroup>
      <p>
        Available fields: {'{Customer Name}'}, {'{Company Name}'},{' '}
        {'{Invoice Number}'}, {'{Invoice Amount}'}, {'{Invoice Due Amount}'} and{' '}
        {'{Invoice Due Date}'}.
      </p>
      <FSwitch name="attachInvoicePdf" label="Attach invoice PDF by default" />
    </Stack>
  );
}
