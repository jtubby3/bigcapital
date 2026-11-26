import {
  FFormGroup,
  FInputGroup,
  FSwitch,
  FTextArea,
  Stack,
} from '@/components';
export function InvoiceHeaderFields() {
  return (
    <Stack spacing={14} style={{ padding: 20 }}>
      <h3>Header</h3>
      <FFormGroup
        name="companyAddressOverride"
        label="Business details for this template"
      >
        <FTextArea
          name="companyAddressOverride"
          rows={7}
          fill
          placeholder="Business name, address, phone, email and website on separate lines"
        />
      </FFormGroup>
      {(
        [
          ['showBusinessName', 'Business name'],
          ['showBusinessAddress', 'Business address'],
          ['showBusinessPhone', 'Phone'],
          ['showBusinessEmail', 'Email'],
          ['showBusinessWebsite', 'Website'],
          ['showCompanyLogo', 'Logo'],
          ['showDocumentTitle', 'Form name'],
        ] as const
      ).map(([name, label]) => (
        <FSwitch key={name} name={name} label={`Show ${label.toLowerCase()}`} />
      ))}
      <FFormGroup name="invoiceTitle" label="Form name">
        <FInputGroup name="invoiceTitle" />
      </FFormGroup>
      {(
        [
          ['showInvoiceNumber', 'invoiceNumberLabel', 'Form number'],
          ['showDateIssue', 'dateIssueLabel', 'Invoice date'],
          ['showDueDate', 'dueDateLabel', 'Due date'],
        ] as const
      ).map(([enabled, name, label]) => (
        <div key={name}>
          <FSwitch name={enabled} label={`Show ${label.toLowerCase()}`} />
          <FFormGroup name={name} label={`${label} label`}>
            <FInputGroup name={name} />
          </FFormGroup>
        </div>
      ))}
      <FSwitch name="showPaymentTerms" label="Show payment terms" />
      <FSwitch
        name="showShippingDetails"
        label="Show shipping date, carrier and tracking"
      />
      <FSwitch name="showReferenceNo" label="Show customer PO / reference" />
    </Stack>
  );
}
