import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Callout, FormGroup, InputGroup } from '@blueprintjs/core';
import { Prompt } from 'react-router-dom';
import { VendorScanOptionPicker, Picker } from './VendorScanOptionPicker';
import { VendorScanSource, PageSelection } from './VendorScanSource';
import {
  PurchasePreview,
  Review,
  Scan,
  ScanLine,
  scanError,
  useVendorScanApi,
} from './useVendorInvoiceScans';
import styles from './VendorInvoiceScans.module.scss';

const makeLine = (): ScanLine => ({
  code: '',
  description: '',
  billing_unit: 'CS',
  pack: '',
  shipped: '',
  unit_price: '',
  amount: '',
  confirmed: false,
  remember: false,
  cases_per_unit: '1',
});

function Input({
  label,
  value,
  onChange,
  type = 'text',
  decimal = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
  decimal?: boolean;
}) {
  const id = useId();
  return (
    <FormGroup className={styles.field} label={label} labelFor={id}>
      <InputGroup
        id={id}
        type={type}
        value={value || ''}
        inputMode={decimal ? 'decimal' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormGroup>
  );
}

function SelectField({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string | number | null;
  onClick: () => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <Button
        alignText="left"
        onClick={onClick}
        fill
        aria-label={value ? `Change ${label}: ${value}` : `Choose ${label}`}
      >
        {value || `Choose ${label}`}
      </Button>
    </div>
  );
}

function Check({
  children,
  checked,
  onChange,
  disabled,
}: {
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span>{children}</span>
    </label>
  );
}

function money(value: string | number, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function caseValues(line: ScanLine) {
  const shipped = Number(line.shipped);
  const perUnit = Number(line.cases_per_unit);
  const unitPrice = Number(line.unit_price);
  if (
    !line.shipped ||
    !line.unit_price ||
    shipped <= 0 ||
    perUnit <= 0 ||
    ![shipped, perUnit, unitPrice].every(Number.isFinite)
  )
    return null;
  return {
    quantity: Number((shipped * perUnit).toFixed(6)),
    cost: unitPrice / perUnit,
  };
}

export function VendorScanReview({
  scan,
  onChange,
  onRefresh,
  openBill,
  busy,
  run,
}: {
  scan: Scan & { review: Review };
  onChange: (scan: Scan) => void;
  onRefresh: () => void;
  openBill: (billId: number) => void;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const { http } = useVendorScanApi();
  const [saved, setSaved] = useState(scan);
  const [review, setReview] = useState(scan.review);
  const [preview, setPreview] = useState<PurchasePreview>();
  const [picker, setPicker] = useState<Picker>();
  const [selection, setSelection] = useState<PageSelection>();
  const [lineIndex, setLineIndex] = useState(0);
  const [names, setNames] = useState<
    Partial<
      Record<
        'warehouse_id' | 'branch_id' | 'shipping_item_id' | 'tax_rate_id',
        string
      >
    >
  >({});
  const dirty = review !== saved.review;
  const stale = scan.version !== saved.version;
  const line = review.lines[lineIndex];

  useEffect(() => {
    if (!dirty && stale) reset(scan);
  }, [dirty, stale, scan]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  function reset(value: Scan & { review: Review }) {
    setSaved(value);
    setReview(value.review);
    setPreview(undefined);
    setNames({});
    setLineIndex((index) =>
      Math.min(index, Math.max(value.review.lines.length - 1, 0)),
    );
  }

  function update(patch: Partial<Review>) {
    setReview((current) => ({ ...current, ...patch }));
    setPreview(undefined);
  }

  function patchLine(patch: Partial<ScanLine>) {
    update({
      lines: review.lines.map((entry, index) =>
        index === lineIndex ? { ...entry, ...patch } : entry,
      ),
    });
  }

  function selectLine(index: number) {
    setLineIndex(index);
    const entry = review.lines[index];
    if (entry?.file_id && entry.page) {
      setSelection({ fileId: entry.file_id, page: entry.page });
    }
  }

  function chooseVendor() {
    setPicker({
      kind: 'vendor',
      label: 'Choose vendor',
      choose: (vendor) => {
        if (!vendor) return;
        if (vendor.id === review.vendor_id) {
          update({ vendor_name: vendor.name });
          return;
        }
        update({
          vendor_id: vendor.id,
          vendor_name: vendor.name,
          receipt_checked: false,
          lines: review.lines.map((entry) => ({
            ...entry,
            item_id: null,
            item_name: undefined,
            confirmed: false,
            remember: false,
            cases_per_unit: '',
          })),
        });
      },
    });
  }

  function chooseItem() {
    setPicker({
      kind: 'item',
      label: 'Choose inventory item',
      choose: (item) => {
        if (!item || item.id === line.item_id) return;
        patchLine({
          item_id: item.id,
          item_name: item.name,
          confirmed: false,
          remember: false,
          ...(line.item_id ? { cases_per_unit: '' } : {}),
        });
      },
    });
  }

  function chooseField(
    field: keyof typeof names,
    kind: Picker['kind'],
    label: string,
  ) {
    setPicker({
      kind,
      label: `Choose ${label}`,
      canClear: true,
      choose: (option) => {
        update({ [field]: option?.id ?? null });
        setNames((current) => ({ ...current, [field]: option?.name }));
      },
    });
  }

  async function save() {
    const { data } = await http.put<Scan & { review: Review }>(`/${scan.id}`, {
      version: saved.version,
      review,
    });
    setSaved(data);
    setReview(data.review);
    onChange(data);
    return data;
  }

  async function checkPurchase() {
    await run(async () => {
      if (dirty) await save();
      const response = await http.get<PurchasePreview>(`/${scan.id}/preview`);
      setPreview(response.data);
    });
  }

  async function postPurchase() {
    if (dirty || stale || !preview?.ready || !preview.token) return;
    await run(async () => {
      try {
        const { data } = await http.post<Scan>(`/${scan.id}/post`, {
          version: saved.version,
          preview_token: preview.token,
        });
        onChange(data);
      } catch (error) {
        // A timeout can occur after the committed bill. Refetch before offering another post.
        setPreview(undefined);
        onRefresh();
        throw error;
      }
    });
  }

  const values = line && caseValues(line);
  const confirmed = review.lines.filter(
    (entry) => entry.confirmed && entry.item_id,
  ).length;
  return (
    <>
      <Prompt
        when={dirty}
        message="You have unsaved invoice edits. Leave this review?"
      />
      {stale && dirty && (
        <Callout intent="warning" role="alert">
          This review changed in Big Capital or Telegram. Reload the saved
          review to continue.
          <Button onClick={() => reset(scan)}>
            Discard my edits and reload
          </Button>
        </Callout>
      )}
      <h2>Review invoice</h2>
      {review.warnings.length > 0 && (
        <Callout intent="warning" title="Check against the original invoice">
          <ul>
            {review.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className={styles.reviewLayout}>
        <fieldset className={styles.editor} disabled={busy || stale}>
          <section className={styles.panel} aria-label="Invoice details">
            <h3>Invoice details</h3>
            <div className={styles.fields}>
              <SelectField
                label="vendor"
                value={
                  review.vendor_id
                    ? review.vendor_name || `#${review.vendor_id}`
                    : undefined
                }
                onClick={chooseVendor}
              />
              {review.vendor_name && !review.vendor_id && (
                <p className={styles.field}>
                  Vendor read from invoice: {review.vendor_name}
                </p>
              )}
              <Input
                label="Vendor invoice number"
                value={review.invoice_number}
                onChange={(invoice_number) =>
                  update({ invoice_number, receipt_checked: false })
                }
              />
              <Input
                label="Invoice date"
                value={review.bill_date}
                type="date"
                onChange={(bill_date) =>
                  update({ bill_date, receipt_checked: false })
                }
              />
              <Input
                label="Due date"
                value={review.due_date}
                type="date"
                onChange={(due_date) => update({ due_date })}
              />
              <Input
                label="Currency"
                value={review.currency}
                onChange={(currency) =>
                  update({ currency: currency.toUpperCase() })
                }
              />
              <Input
                label="Exchange rate"
                value={review.exchange_rate}
                decimal
                onChange={(exchange_rate) => update({ exchange_rate })}
              />
              <SelectField
                label="warehouse"
                value={
                  names.warehouse_id ||
                  (review.warehouse_id && `#${review.warehouse_id}`)
                }
                onClick={() =>
                  chooseField('warehouse_id', 'warehouse', 'warehouse')
                }
              />
              <SelectField
                label="branch"
                value={
                  names.branch_id ||
                  (review.branch_id && `#${review.branch_id}`)
                }
                onClick={() => chooseField('branch_id', 'branch', 'branch')}
              />
              <Input
                label="Invoice total"
                value={review.total}
                decimal
                onChange={(total) => update({ total })}
              />
              <Input
                label="Discount"
                value={review.discount}
                decimal
                onChange={(discount) => update({ discount })}
              />
              <Input
                label="Delivery charge"
                value={review.shipping}
                decimal
                onChange={(shipping) => update({ shipping })}
              />
              {Number(review.shipping) > 0 && (
                <SelectField
                  label="delivery expense item"
                  value={
                    names.shipping_item_id ||
                    (review.shipping_item_id && `#${review.shipping_item_id}`)
                  }
                  onClick={() =>
                    chooseField(
                      'shipping_item_id',
                      'charge',
                      'delivery expense item',
                    )
                  }
                />
              )}
              <Input
                label="Tax"
                value={review.tax}
                decimal
                onChange={(tax) => update({ tax })}
              />
              {Number(review.tax) > 0 && (
                <SelectField
                  label="tax rate"
                  value={
                    names.tax_rate_id ||
                    (review.tax_rate_id && `#${review.tax_rate_id}`)
                  }
                  onClick={() => chooseField('tax_rate_id', 'tax', 'tax rate')}
                />
              )}
            </div>
          </section>
          <section className={styles.panel} aria-label="Invoice items">
            <div className={styles.row}>
              <h3>Invoice items</h3>
              <Button
                icon="add"
                onClick={() => {
                  setLineIndex(review.lines.length);
                  update({ lines: [...review.lines, makeLine()] });
                }}
              >
                Add item line
              </Button>
            </div>
            {line ? (
              <>
                <p>
                  {confirmed} of {review.lines.length} matches confirmed
                </p>
                <div className={styles.lineNav}>
                  <Button
                    icon="chevron-left"
                    aria-label="Previous item"
                    disabled={lineIndex === 0}
                    onClick={() => selectLine(lineIndex - 1)}
                  />
                  <select
                    className={styles.control}
                    aria-label="Invoice item line"
                    value={lineIndex}
                    onChange={(event) => selectLine(Number(event.target.value))}
                  >
                    {review.lines.map((entry, index) => (
                      <option key={index} value={index}>
                        {`${index + 1}. ${entry.code || entry.description || 'New line'}${entry.confirmed ? ' · Confirmed' : ''}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    icon="chevron-right"
                    aria-label="Next item"
                    disabled={lineIndex === review.lines.length - 1}
                    onClick={() => selectLine(lineIndex + 1)}
                  />
                </div>
                {line.attention && (
                  <Callout className={styles.spaced} intent="warning">
                    {line.attention}
                  </Callout>
                )}
                <div className={styles.fields}>
                  <Input
                    label="Vendor product code"
                    value={line.code}
                    onChange={(code) =>
                      patchLine({
                        code,
                        confirmed: false,
                        remember: false,
                        cases_per_unit: '',
                      })
                    }
                  />
                  <Input
                    label="Vendor description"
                    value={line.description}
                    onChange={(description) =>
                      patchLine({ description, confirmed: false })
                    }
                  />
                  <Input
                    label="Billing unit"
                    value={line.billing_unit}
                    onChange={(billing_unit) =>
                      patchLine({
                        billing_unit,
                        confirmed: false,
                        cases_per_unit: '',
                      })
                    }
                  />
                  <Input
                    label="Vendor pack"
                    value={line.pack}
                    onChange={(pack) =>
                      patchLine({ pack, confirmed: false, cases_per_unit: '' })
                    }
                  />
                  <Input
                    label="Shipped quantity"
                    value={line.shipped}
                    decimal
                    onChange={(shipped) => patchLine({ shipped })}
                  />
                  <Input
                    label="Price per vendor billing unit"
                    value={line.unit_price}
                    decimal
                    onChange={(unit_price) => patchLine({ unit_price })}
                  />
                  <Input
                    label="Invoice line amount"
                    value={line.amount}
                    decimal
                    onChange={(amount) => patchLine({ amount })}
                  />
                  <Input
                    label="Cases per vendor billing unit"
                    value={line.cases_per_unit}
                    decimal
                    onChange={(cases_per_unit) =>
                      patchLine({ cases_per_unit, confirmed: false })
                    }
                  />
                </div>
                {values && (
                  <p className={styles.caseSummary}>
                    <strong>{values.quantity} cases</strong> ·{' '}
                    {money(values.cost, review.currency)} per case
                  </p>
                )}
                <SelectField
                  label="item"
                  value={line.item_id && (line.item_name || `#${line.item_id}`)}
                  onClick={chooseItem}
                />
                <Check
                  checked={line.confirmed}
                  disabled={!line.item_id}
                  onChange={(confirmed) =>
                    patchLine({
                      confirmed,
                      ...(!confirmed ? { remember: false } : {}),
                    })
                  }
                >
                  Confirm product match
                </Check>
                <Check
                  checked={!!line.remember}
                  disabled={!line.confirmed || !line.code || !review.vendor_id}
                  onChange={(remember) => patchLine({ remember })}
                >
                  Remember this vendor code
                </Check>
                <Button
                  minimal
                  intent="danger"
                  onClick={() => {
                    const lines = review.lines.filter(
                      (_, index) => index !== lineIndex,
                    );
                    update({ lines });
                    setLineIndex(
                      Math.max(0, Math.min(lineIndex, lines.length - 1)),
                    );
                  }}
                >
                  Remove this line
                </Button>
              </>
            ) : (
              <p>
                Check the original invoice and add any product lines that could
                not be read.
              </p>
            )}
          </section>
          <section className={styles.panel} aria-label="Review actions">
            <Check
              checked={review.receipt_checked}
              onChange={(receipt_checked) => update({ receipt_checked })}
            >
              I checked that this stock was not already recorded in Big Capital.
            </Check>
            <div className={styles.actions}>
              <Button
                disabled={!dirty}
                onClick={() =>
                  run(async () => {
                    await save();
                  })
                }
              >
                Save review
              </Button>
              <Button intent="primary" onClick={checkPurchase}>
                Preview purchase
              </Button>
            </div>
          </section>
          {preview && (
            <section className={styles.panel} aria-label="Purchase preview">
              <h3>Purchase preview</h3>
              {preview.issues?.length > 0 && (
                <Callout intent="warning" title="Resolve these before posting">
                  <ul>
                    {preview.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              {!!preview.bill_id && (
                <Button onClick={() => openBill(preview.bill_id!)}>
                  Open existing bill #{preview.bill_id}
                </Button>
              )}
              {preview.ready && (
                <>
                  <p>
                    <strong>
                      {review.vendor_name || `Vendor #${review.vendor_id}`}
                    </strong>{' '}
                    · Invoice {review.invoice_number}
                  </p>
                  <dl className={styles.totals}>
                    <dt>Invoice date</dt>
                    <dd>{review.bill_date}</dd>
                    <dt>Total cases</dt>
                    <dd>
                      {Number(
                        review.lines
                          .reduce(
                            (sum, entry) =>
                              sum + (caseValues(entry)?.quantity || 0),
                            0,
                          )
                          .toFixed(6),
                      )}
                    </dd>
                    <dt>Delivery</dt>
                    <dd>{money(review.shipping, review.currency)}</dd>
                    <dt>Tax</dt>
                    <dd>{money(review.tax, review.currency)}</dd>
                    <dt>Discount</dt>
                    <dd>{money(review.discount, review.currency)}</dd>
                    <dt>Invoice total</dt>
                    <dd>{money(review.total, review.currency)}</dd>
                    {review.warehouse_id && (
                      <>
                        <dt>Warehouse</dt>
                        <dd>
                          {names.warehouse_id || `#${review.warehouse_id}`}
                        </dd>
                      </>
                    )}
                  </dl>
                  {!!preview.prices?.length && (
                    <ul className={styles.prices}>
                      {preview.prices.map((price) => (
                        <li key={price.item_id}>
                          <strong>{price.name}</strong>
                          <span>
                            Cost per case {price.old_cost} → {price.new_cost}
                          </span>
                          <span>
                            Selling price {price.old_sell} → {price.new_sell}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    intent="primary"
                    disabled={!preview.token}
                    onClick={postPurchase}
                  >
                    Confirm and record purchase
                  </Button>
                </>
              )}
            </section>
          )}
        </fieldset>
        <VendorScanSource
          scanId={scan.id}
          files={scan.files}
          selection={selection}
          onSelect={setSelection}
        />
      </div>
      {picker && (
        <VendorScanOptionPicker
          picker={picker}
          onClose={() => setPicker(undefined)}
        />
      )}
    </>
  );
}
