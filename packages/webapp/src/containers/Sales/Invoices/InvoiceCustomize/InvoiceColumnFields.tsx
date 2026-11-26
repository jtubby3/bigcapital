import {
  normalizeInvoiceColumns,
  invoiceCustomizationDefaults,
  InvoiceColumnId,
} from '@bigcapital/pdf-templates';
import { Button } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { InvoiceCustomizeFormValues } from './types';
import { FColorInput } from '@/components/Forms/FColorInput';
import { FFormGroup, FInputGroup, FSwitch, Stack } from '@/components';

const columns: Record<
  InvoiceColumnId,
  { name: string; label: string; visible: string }
> = {
  item: { name: 'Product', label: 'lineItemLabel', visible: 'showLineItem' },
  quantity: {
    name: 'Quantity',
    label: 'lineQuantityLabel',
    visible: 'showLineQuantity',
  },
  rate: { name: 'Unit price', label: 'lineRateLabel', visible: 'showLineRate' },
  discount: {
    name: 'Discount',
    label: 'lineDiscountLabel',
    visible: 'showLineDiscount',
  },
  total: { name: 'Amount', label: 'lineTotalLabel', visible: 'showLineTotal' },
};

export function InvoiceColumnFields() {
  const { values, setFieldValue, setFieldTouched } =
    useFormikContext<InvoiceCustomizeFormValues>();
  const order = normalizeInvoiceColumns(values.lineColumns);
  const move = (index: number, direction: number) => {
    const next = [...order];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setFieldValue('lineColumns', next);
  };
  return (
    <Stack spacing={16} style={{ padding: 20 }}>
      <h3>Line item columns</h3>
      <FSwitch name="showTotalQuantity" label="Show total quantity" />
      {values.showTotalQuantity && (
        <FFormGroup name="totalQuantityLabel" label="Total quantity label">
          <FInputGroup name="totalQuantityLabel" placeholder="Total Packages" />
        </FFormGroup>
      )}
      <p>
        Add the sum of all line-item quantities below the Quantity column on
        invoices and packing slips. This is a display total only.
      </p>
      <FSwitch
        name="alternateRowColors"
        label="Alternate line-item row colors"
      />
      {values.alternateRowColors && (
        <>
          <FFormGroup name="oddRowColor" label="First row color">
            <FColorInput
              name="oddRowColor"
              inputProps={{ id: 'oddRowColor', name: 'oddRowColor' }}
            />
          </FFormGroup>
          <FFormGroup name="evenRowColor" label="Alternating row color">
            <FColorInput
              name="evenRowColor"
              inputProps={{ id: 'evenRowColor', name: 'evenRowColor' }}
            />
          </FFormGroup>
        </>
      )}
      <p>Choose the columns, change their labels, and arrange their order.</p>
      <label>
        Description placement
        <select
          className="bp4-input"
          aria-label="Description placement"
          value={values.descriptionPlacement}
          onChange={(event) =>
            setFieldValue('descriptionPlacement', event.target.value)
          }
        >
          <option value="auto">Use design default</option>
          <option value="separate">Separate description column</option>
          <option value="under-item">Below product name</option>
        </select>
      </label>
      <FFormGroup name="lineDescriptionLabel" label="Description heading">
        <FInputGroup name="lineDescriptionLabel" />
      </FFormGroup>
      <details open>
        <summary>Column widths</summary>
        <p>
          Drag a slider or enter a width. Widths are proportional so the table
          always fits the page.
        </p>
        {(
          [
            'item',
            'description',
            'quantity',
            'rate',
            'discount',
            'total',
          ] as const
        ).map((id) => {
          const name = `lineColumnWidths.${id}`;
          const label = `${id[0].toUpperCase() + id.slice(1)} width`;
          const fallback = invoiceCustomizationDefaults.lineColumnWidths[id];
          const value = Number(values.lineColumnWidths?.[id] ?? fallback);
          return (
            <FFormGroup key={id} name={name} label={label}>
              <div>
                <FInputGroup name={name} type="number" min={5} max={80} />
                <input
                  type="range"
                  aria-label={`${label} slider`}
                  min={5}
                  max={80}
                  step={1}
                  value={
                    Number.isFinite(value)
                      ? Math.max(5, Math.min(80, value))
                      : fallback
                  }
                  onChange={(event) =>
                    setFieldValue(name, Number(event.target.value))
                  }
                  onBlur={() => setFieldTouched(name, true)}
                  style={{
                    width: '100%',
                    display: 'block',
                    margin: '12px 0 0',
                    accentColor: '#137cbd',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </FFormGroup>
          );
        })}
      </details>
      {order.map((id, index) => {
        const column = columns[id];
        return (
          <div
            key={id}
            style={{ borderBottom: '1px solid #ddd', paddingBottom: 12 }}
          >
            <FSwitch
              name={column.visible}
              label={`Show ${column.name.toLowerCase()}`}
            />
            <FFormGroup name={column.label} label={`${column.name} heading`}>
              <FInputGroup name={column.label} />
            </FFormGroup>
            <Button
              type="button"
              small
              icon="arrow-up"
              aria-label={`Move ${column.name} earlier`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <Button
              type="button"
              small
              icon="arrow-down"
              aria-label={`Move ${column.name} later`}
              disabled={index === order.length - 1}
              onClick={() => move(index, 1)}
            />
          </div>
        );
      })}
    </Stack>
  );
}
