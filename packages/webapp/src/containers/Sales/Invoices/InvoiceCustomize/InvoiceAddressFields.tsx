import { invoiceAddressTokens } from '@bigcapital/pdf-templates';
import {
  FFormGroup,
  FInputGroup,
  FSwitch,
  FTextArea,
  Stack,
} from '@/components';

export function InvoiceAddressFields() {
  return (
    <Stack spacing={18} style={{ padding: 20 }}>
      <h3>Invoice addresses</h3>
      <p>
        Addresses use the selected customer's billing and shipping details. Edit
        those details on the customer record. Each block can be positioned
        separately in Visual designer.
      </p>
      <FSwitch name="showCustomerAddress" label="Show Bill To address" />
      <FFormGroup name="billedToLabel" label="Bill To heading">
        <FInputGroup name="billedToLabel" />
      </FFormGroup>
      <FFormGroup name="billToAddressFormat" label="Bill To address format">
        <FTextArea name="billToAddressFormat" rows={7} fill />
      </FFormGroup>
      <FSwitch name="showShippingAddress" label="Show Ship To address" />
      <FFormGroup name="shipToLabel" label="Ship To heading">
        <FInputGroup name="shipToLabel" />
      </FFormGroup>
      <FFormGroup name="shipToAddressFormat" label="Ship To address format">
        <FTextArea name="shipToAddressFormat" rows={7} fill />
      </FFormGroup>
      <p>
        Arrange tokens on separate lines, remove fields you do not need, or add
        text. Empty lines are omitted. A customer without shipping details has
        no Ship To block on the printed invoice.
      </p>
      <div>
        <strong>Available tokens</strong>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
        >
          {Object.keys(invoiceAddressTokens).map((token) => (
            <code key={token}>{`{${token}}`}</code>
          ))}
        </div>
      </div>
    </Stack>
  );
}
