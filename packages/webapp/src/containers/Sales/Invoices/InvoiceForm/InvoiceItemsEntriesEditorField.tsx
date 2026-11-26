import { Button } from '@blueprintjs/core';
import { defaultInvoiceEntry } from './utils';
import { FastField } from 'formik';
import React from 'react';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import { entriesFieldShouldUpdate } from './utils';
import type { InvoiceFormValues } from './utils';
import type { FieldProps } from 'formik';
import { ItemsEntriesTable } from '@/containers/Entries/ItemsEntriesTable';
import { ITEM_TYPE } from '@/containers/Entries/utils';
import { TaxType } from '@/interfaces/TaxRates';

/**
 * Invoice items entries editor field.
 */
export function InvoiceItemsEntriesEditorField() {
  const { items, taxRates } = useInvoiceFormContext();

  return (
    <FastField
      name={'entries'}
      items={items}
      taxRates={taxRates}
      shouldUpdate={entriesFieldShouldUpdate}
    >
      {({
        form: { values, setFieldValue },
        field: { value },
        meta: { error },
      }: FieldProps<any[], InvoiceFormValues>) => (
        <>
          <ItemsEntriesTable
            showTotalQuantity
            value={value}
            onChange={(entries) => {
              setFieldValue('entries', entries);
            }}
            items={items}
            taxRates={taxRates}
            itemType={ITEM_TYPE.SELLABLE}
            errors={error}
            linesNumber={2}
            currencyCode={values.currencyCode}
            isInclusiveTax={values.inclusiveExclusiveTax === TaxType.Inclusive}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button
              small
              icon="add"
              onClick={() =>
                setFieldValue('entries', [
                  ...value,
                  { ...defaultInvoiceEntry, index: value.length + 1 },
                ])
              }
            >
              Add product or service
            </Button>
            <Button
              small
              minimal
              onClick={() =>
                setFieldValue('entries', [{ ...defaultInvoiceEntry, index: 1 }])
              }
            >
              Clear all lines
            </Button>
          </div>
        </>
      )}
    </FastField>
  );
}
