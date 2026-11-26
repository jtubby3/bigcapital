import { useFormikContext } from 'formik';
import { InvoiceCustomizeFormValues } from './types';
import { CompanyLogoUpload } from '@/containers/ElementCustomize/components/CompanyLogoUpload';
import { FFormGroup, FInputGroup, FSwitch, Stack } from '@/components';

export function InvoiceFooterImageFields() {
  const { values, setFieldValue } = useFormikContext<
    InvoiceCustomizeFormValues & { _footerImageFile?: File | null }
  >();
  return (
    <Stack spacing={14} style={{ padding: 20 }}>
      <h3>Bottom image / payment QR code</h3>
      <p>
        Upload your payment QR code or another footer image. It appears below
        the document content on invoices and packing slips.
      </p>
      <FSwitch name="showFooterImage" label="Show bottom image" />
      <CompanyLogoUpload
        initialPreview={values.footerImageUri}
        title="Upload a QR code or footer image"
        onChange={(file) => {
          setFieldValue('_footerImageFile', file);
          setFieldValue('footerImageKey', '');
          setFieldValue(
            'footerImageUri',
            file ? URL.createObjectURL(file) : '',
          );
        }}
      />
      <FFormGroup name="footerImageWidth" label="Image width">
        <FInputGroup name="footerImageWidth" type="number" min={64} max={400} />
      </FFormGroup>
      <label>
        Image position
        <select
          className="bp4-input"
          aria-label="Bottom image position"
          value={values.footerImageAlign}
          onChange={(event) =>
            setFieldValue('footerImageAlign', event.target.value)
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <FFormGroup name="footerImageCaption" label="Caption">
        <FInputGroup name="footerImageCaption" placeholder="Scan to pay" />
      </FFormGroup>
    </Stack>
  );
}
