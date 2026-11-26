import { Button } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import type { InvoiceCustomizeFormValues } from './types';
export function InvoiceDesignPresets() {
  const { values, setValues } = useFormikContext<InvoiceCustomizeFormValues>();
  const choices = [
    { id: 'reference', name: 'Classic', color: '#555555', row: '#eef2f5' },
    { id: 'modern', name: 'Modern green', color: '#366534', row: '#edf4e8' },
    { id: 'minimal', name: 'Minimal', color: '#334155', row: '#f4f6f8' },
  ] as const;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>Choose a design</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: 8,
        }}
      >
        {choices.map((c) => (
          <Button
            key={c.id}
            active={
              values.layoutMode === 'distribution' &&
              values.designVariant === c.id
            }
            aria-label={`Use ${c.name} design`}
            onClick={() =>
              setValues({
                ...values,
                layoutMode: 'distribution',
                designVariant: c.id,
                primaryColor: c.color,
                alternateRowColors: true,
                evenRowColor: c.row,
                pageSize: 'letter',
                lineItemLabel: '',
                lineQuantityLabel: 'QTY',
                lineRateLabel: 'RATE',
                lineTotalLabel: 'AMOUNT',
                showPaymentMade: false,
                showDiscount: false,
              })
            }
          >
            <svg width="66" height="82" viewBox="0 0 66 82" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="64"
                height="80"
                fill="white"
                stroke="#ccd2d8"
              />
              <rect x="8" y="9" width="25" height="3" fill={c.color} />
              <rect x="44" y="8" width="14" height="9" fill={c.color} />
              <path
                d="M8 21h22M8 29h50M8 34h50M8 40h50M8 46h50M8 52h50"
                stroke="#c9ced5"
              />
              <rect x="8" y="37" width="50" height="7" fill={c.row} />
              <rect x="36" y="60" width="22" height="4" fill={c.color} />
            </svg>
            <div>{c.name}</div>
          </Button>
        ))}
      </div>
    </div>
  );
}
