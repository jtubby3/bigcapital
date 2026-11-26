import {
  defaultInvoiceLayout,
  InvoicePaperTemplate,
  InvoicePaperTemplateProps,
  InvoiceSectionId,
  invoicePreviewAddresses,
  moveInvoiceSection,
  normalizeInvoiceLayout,
} from '@bigcapital/pdf-templates';
import { Button, Callout } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { useState } from 'react';
import { initialValues } from './constants';
import fieldStyles from './InvoiceEditorControls.module.scss';
import { InvoiceCustomizeFormValues } from './types';
import type { DragEvent } from 'react';
import { useElementCustomizeContext } from '@/containers/ElementCustomize/ElementCustomizeProvider';
import { pickPaperTemplateProps } from '@/containers/ElementCustomize/paperTemplatePreview';

const sectionLabels: Record<InvoiceSectionId, string> = {
  header: 'Invoice header and logo',
  companyAddress: 'Company address',
  customerAddress: 'Bill To address',
  shippingAddress: 'Ship To address',
  items: 'Line items',
  totals: 'Totals',
  terms: 'Terms and conditions',
  statement: 'Invoice message',
  footer: 'Footer',
};
const dragType = 'application/x-bigcapital-invoice-section';

export function InvoiceLayoutDesigner() {
  const { values, setFieldValue } =
    useFormikContext<InvoiceCustomizeFormValues>();
  const { brandingState } = useElementCustomizeContext();
  const [selected, setSelected] = useState<InvoiceSectionId>('header');
  const [reference, setReference] = useState('');
  const [opacity, setOpacity] = useState(0.25);
  const [error, setError] = useState('');
  const layout = normalizeInvoiceLayout(values.sectionLayout);
  const position = layout.find((section) => section.id === selected)!;
  const enabled = values.layoutMode === 'designer';
  const templateProps = pickPaperTemplateProps<InvoicePaperTemplateProps>(
    { ...brandingState, ...values },
    initialValues,
  );

  const move = (id: InvoiceSectionId, change: Partial<typeof position>) => {
    setFieldValue('sectionLayout', moveInvoiceSection(layout, id, change));
    setSelected(id);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData(dragType) as InvoiceSectionId;
    if (!enabled || !layout.some((section) => section.id === id)) return;
    const grid = event.currentTarget.querySelector<HTMLElement>(
      '[data-invoice-layout]',
    );
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const styles = getComputedStyle(grid);
    const gap = parseFloat(styles.rowGap) || 0;
    const rows = styles.gridTemplateRows.split(' ').map(parseFloat);
    let row = 1;
    let bottom = rows[0] || 56;
    while (row < rows.length && event.clientY - rect.top > bottom + gap / 2) {
      bottom += gap + rows[row];
      row++;
    }
    move(id, {
      column: Math.floor((event.clientX - rect.left) / (rect.width / 12)) + 1,
      row,
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <Callout title="Design your invoice">
        Drag sections on the invoice, or select one and use the position
        controls or arrow keys. Sections snap to a 12 column grid. Rows grow
        with their contents so longer invoices can continue onto additional
        pages.
      </Callout>
      <div className={fieldStyles.designerControls}>
        <Button
          type="button"
          active={enabled}
          onClick={() =>
            setFieldValue('layoutMode', enabled ? 'standard' : 'designer')
          }
        >
          {enabled ? 'Use standard layout' : 'Enable visual layout'}
        </Button>
        <label className={fieldStyles.designerField}>
          Section
          <select
            className="bp4-input"
            aria-label="Section"
            value={selected}
            onChange={(event) =>
              setSelected(event.target.value as InvoiceSectionId)
            }
          >
            {layout.map(({ id }) => (
              <option key={id} value={id}>
                {sectionLabels[id]}
              </option>
            ))}
          </select>
        </label>
        {(['column', 'row', 'width'] as const).map((field) => (
          <label
            key={field}
            className={fieldStyles.designerField}
            style={{ textTransform: 'capitalize' }}
          >
            {field}
            <input
              className="bp4-input"
              aria-label={`Section ${field}`}
              type="number"
              style={{ width: 75 }}
              disabled={!enabled}
              value={position[field]}
              min={field === 'width' ? 3 : 1}
              max={
                field === 'row'
                  ? 64
                  : field === 'column'
                    ? 13 - position.width
                    : 12
              }
              onChange={(event) =>
                move(selected, { [field]: event.target.valueAsNumber })
              }
            />
          </label>
        ))}
        <Button
          type="button"
          disabled={!enabled}
          onClick={() =>
            setFieldValue(
              'sectionLayout',
              defaultInvoiceLayout.map((entry) => ({ ...entry })),
            )
          }
        >
          Reset positions
        </Button>
      </div>
      <details
        className={fieldStyles.referenceGuide}
        style={{ marginBottom: 16 }}
      >
        <summary>Match an existing invoice</summary>
        <p>
          Load a PNG or JPEG of your invoice as a guide, then adjust the
          sections, columns, fonts, and labels. The image stays in this tab and
          is excluded from the saved template and PDF.
        </p>
        <input
          aria-label="Invoice reference image"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setError('');
            if (!file) return;
            if (
              !['image/png', 'image/jpeg'].includes(file.type) ||
              file.size > 10 * 1024 * 1024
            ) {
              setError('Choose a PNG or JPEG image smaller than 10 MB.');
              return;
            }
            const reader = new FileReader();
            reader.onerror = () =>
              setError('The reference image could not be read.');
            reader.onload = () => setReference(String(reader.result));
            reader.readAsDataURL(file);
          }}
        />
        {reference && (
          <>
            <label className={fieldStyles.referenceControl}>
              Reference opacity
              <input
                aria-label="Reference opacity"
                type="range"
                min={0}
                max={0.8}
                step={0.05}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
            <Button type="button" small onClick={() => setReference('')}>
              Remove reference
            </Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </details>
      <div
        onDragOver={(event) => {
          if (enabled) event.preventDefault();
        }}
        onDrop={drop}
        style={{
          position: 'relative',
          width: values.pageSize === 'letter' ? 816 : 794,
          margin: '0 auto',
        }}
      >
        <InvoicePaperTemplate
          {...invoicePreviewAddresses}
          {...templateProps}
          sectionAttributes={
            enabled
              ? (id) => ({
                  draggable: true,
                  tabIndex: 0,
                  role: 'button',
                  'aria-label': `Move ${sectionLabels[id]}`,
                  title: sectionLabels[id],
                  onClick: () => setSelected(id),
                  onDragStart: (event) => {
                    event.dataTransfer.setData(dragType, id);
                    event.dataTransfer.effectAllowed = 'move';
                  },
                  onKeyDown: (event) => {
                    const current = layout.find(
                      (section) => section.id === id,
                    )!;
                    const moves = {
                      ArrowLeft: { column: current.column - 1 },
                      ArrowRight: { column: current.column + 1 },
                      ArrowUp: { row: current.row - 1 },
                      ArrowDown: { row: current.row + 1 },
                    };
                    const change = moves[event.key as keyof typeof moves];
                    if (change) {
                      event.preventDefault();
                      move(id, change);
                    }
                  },
                  style: {
                    outline:
                      id === selected
                        ? '2px solid #2c3dd8'
                        : '1px dashed #a7b6c2',
                    outlineOffset: 3,
                    cursor: 'move',
                    minHeight: 30,
                  },
                })
              : undefined
          }
        />
        {reference && (
          <img
            alt="Invoice layout reference"
            src={reference}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              opacity,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
