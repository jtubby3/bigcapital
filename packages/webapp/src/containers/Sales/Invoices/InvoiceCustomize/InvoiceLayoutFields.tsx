import { useFormikContext } from 'formik';
import fieldStyles from './InvoiceEditorControls.module.scss';
import { Button } from '@blueprintjs/core';
import { InvoiceCustomizeFormValues } from './types';
import {
  FFormGroup,
  FInputGroup,
  FSwitch,
  FTextArea,
  Stack,
} from '@/components';

export function InvoiceLayoutFields() {
  const { values, setFieldValue, setValues } =
    useFormikContext<InvoiceCustomizeFormValues>();
  return (
    <Stack spacing={16} style={{ padding: 20 }}>
      <h3>Invoice layout</h3>
      <Button
        onClick={() =>
          setValues({
            ...values,
            layoutMode: 'distribution',
            pageSize: 'letter',
            documentFontSize: 14,
            invoiceTitle: 'INVOICE',
            lineItemLabel: '',
            lineRateLabel: 'RATE',
            lineQuantityLabel: 'QTY',
            lineTotalLabel: 'AMOUNT',
            showDiscount: false,
            showPaymentMade: false,
            alternateRowColors: true,
            billedToLabel: 'BILL TO',
            shipToLabel: 'SHIP TO',
            invoiceNumberLabel: 'INVOICE #',
            dateIssueLabel: 'DATE',
            dueDateLabel: 'DUE DATE',
            subtotalLabel: 'SUBTOTAL',
            totalLabel: 'TOTAL',
            dueAmountLabel: 'BALANCE DUE',
            statementLabel: '',
          })
        }
      >
        Use distributor reference design
      </Button>
      <p>
        Customize a standard form or open the Visual designer tab to position
        sections. Each template can be selected when creating an invoice.
      </p>
      <FFormGroup name="invoiceTitle" label="Document title">
        <FInputGroup name="invoiceTitle" />
      </FFormGroup>
      <label>
        Layout
        <select
          className="bp4-input"
          style={{ width: '100%' }}
          aria-label="Layout"
          value={values.layoutMode}
          onChange={(event) => setFieldValue('layoutMode', event.target.value)}
        >
          <option value="standard">Standard form</option>
          <option value="distribution">
            Distributor form (reference design)
          </option>
          <option value="designer">Visual designer</option>
        </select>
      </label>
      <label>
        Paper size
        <select
          className="bp4-input"
          style={{ width: '100%' }}
          aria-label="Paper size"
          value={values.pageSize}
          onChange={(event) => setFieldValue('pageSize', event.target.value)}
        >
          <option value="letter">US Letter</option>
          <option value="a4">A4</option>
        </select>
      </label>
      <label>
        Font
        <select
          className="bp4-input"
          style={{ width: '100%' }}
          aria-label="Font"
          value={values.fontFamily}
          onChange={(event) => setFieldValue('fontFamily', event.target.value)}
        >
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
          <option value="Times New Roman">Times New Roman</option>
        </select>
      </label>
      <FFormGroup name="documentFontSize" label="Font size (points)">
        <input
          id="documentFontSize"
          className="bp4-input"
          type="number"
          min={8}
          max={24}
          step={0.5}
          value={Number(values.documentFontSize || 12) * 0.75}
          onChange={(event) =>
            setFieldValue(
              'documentFontSize',
              (Number(event.target.value) * 4) / 3,
            )
          }
        />
      </FFormGroup>
      <fieldset>
        <legend>Page margins (inches)</legend>
        <p>Keep at least 0.25 inches on every edge for safe printing.</p>
        <div className={fieldStyles.marginGrid}>
          {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => {
            const name = `pageMargin${side}` as const;
            return (
              <FFormGroup key={side} name={name} label={`${side} margin`}>
                <input
                  id={name}
                  className="bp4-input"
                  type="number"
                  min={0.25}
                  max={2}
                  step={0.05}
                  value={Math.max(0.25, values[name] ?? 0.5)}
                  onChange={(event) =>
                    setFieldValue(name, Number(event.target.value))
                  }
                />
              </FFormGroup>
            );
          })}
        </div>
      </fieldset>
      <label>
        Logo position
        <select
          className="bp4-input"
          aria-label="Logo position"
          value={values.logoPosition}
          onChange={(event) =>
            setFieldValue('logoPosition', event.target.value)
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <FFormGroup
        name="companyAddressOverride"
        label="Company details for this template"
      >
        <FTextArea
          name="companyAddressOverride"
          rows={6}
          fill
          placeholder="Leave blank to use company profile. First line is the company name."
        />
      </FFormGroup>
      <FFormGroup name="logoWidth" label="Top-right logo width">
        <FInputGroup name="logoWidth" type="number" min={80} max={350} />
      </FFormGroup>
      <FFormGroup name="headerText" label="Header text">
        <FTextArea
          name="headerText"
          rows={3}
          fill
          placeholder="Company slogan or remittance instructions"
        />
      </FFormGroup>
      <FFormGroup name="footerText" label="Footer text">
        <FTextArea
          name="footerText"
          rows={4}
          fill
          placeholder="Thank you for your business"
        />
      </FFormGroup>
      <FSwitch name="showLineDescription" label="Show product descriptions" />
    </Stack>
  );
}
