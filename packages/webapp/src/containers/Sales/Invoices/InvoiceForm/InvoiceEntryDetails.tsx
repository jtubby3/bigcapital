import { useFormikContext } from 'formik';
import React, { useEffect, useRef } from 'react';
import { InvoiceExchangeRateInputField } from './components';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import styles from './InvoiceEntryWorkspace.module.scss';
import { customerAddressText, invoiceDueDate } from './invoiceWorkflow';
import { customerNameFieldShouldUpdate } from './utils';
import type { InvoiceFormValues } from './utils';
import { CustomersSelect, FFormGroup, FInputGroup } from '@/components';
import { useCustomerUpdateExRate } from '@/containers/Entries/withExRateItemEntriesPriceRecalc';
import { useCustomer } from '@/hooks/query';

export function InvoiceEntryDetails() {
  const { values, setFieldValue, setFieldTouched } =
    useFormikContext<InvoiceFormValues>();
  const { customers } = useInvoiceFormContext();
  const { data: customer } = useCustomer(
    values.customerId ? Number(values.customerId) : undefined,
  );
  const lastCustomer = useRef<string | null>(null);
  const updateExchangeRate = useCustomerUpdateExRate();

  useEffect(() => {
    const id = String(values.customerId || '');
    if (!id) {
      lastCustomer.current = null;
      return;
    }
    if (!customer || String(customer.id) !== id || lastCustomer.current === id)
      return;
    const first = lastCustomer.current === null;
    lastCustomer.current = id;
    if (!first || values.billingAddressText == null)
      setFieldValue(
        'billingAddressText',
        customerAddressText(customer, 'billing'),
        false,
      );
    if (!first || values.shippingAddressText == null)
      setFieldValue(
        'shippingAddressText',
        customerAddressText(customer, 'shipping'),
        false,
      );
    if (!first || !values.recipientEmail)
      setFieldValue('recipientEmail', customer.email || '', false);
  }, [
    customer,
    values.customerId,
    values.billingAddressText,
    values.shippingAddressText,
    values.recipientEmail,
    setFieldValue,
  ]);

  useEffect(() => {
    const dueDate = invoiceDueDate(values.invoiceDate, values.paymentTermsDays);
    if (dueDate && dueDate !== values.dueDate)
      setFieldValue('dueDate', dueDate, false);
  }, [
    values.invoiceDate,
    values.paymentTermsDays,
    values.dueDate,
    setFieldValue,
  ]);

  const dateField = (
    name: 'invoiceDate' | 'dueDate' | 'shippingDate',
    label: string,
  ) => (
    <FFormGroup name={name} label={label}>
      <input
        id={name}
        name={name}
        className="bp4-input"
        type="date"
        value={values[name] || ''}
        onBlur={() => setFieldTouched(name, true)}
        onChange={(event) => {
          setFieldValue(name, event.target.value);
          if (name === 'dueDate') setFieldValue('paymentTermsDays', '', false);
        }}
      />
    </FFormGroup>
  );

  return (
    <section
      className={styles.customerPanel}
      aria-label="Customer and shipping details"
    >
      <div className={styles.customerPicker}>
        <FFormGroup name="customerId" label="Customer">
          <CustomersSelect
            name="customerId"
            items={customers}
            placeholder="Select a customer"
            allowCreate
            fastField
            shouldUpdate={customerNameFieldShouldUpdate}
            shouldUpdateDeps={{ items: customers }}
            buttonProps={{ 'data-testId': 'invoice-customer-select' }}
            onItemChange={(selected: { id: number; currencyCode: string }) => {
              if (values.customerId !== selected.id) {
                setFieldValue('billingAddressText', null, false);
                setFieldValue('shippingAddressText', null, false);
                setFieldValue('recipientEmail', '', false);
                setFieldValue('customerId', selected.id);
                setFieldValue('currencyCode', selected.currencyCode);
              }
              updateExchangeRate(selected);
            }}
          />
        </FFormGroup>
        <FFormGroup name="recipientEmail" label="Customer email">
          <FInputGroup
            name="recipientEmail"
            type="email"
            placeholder="Email address for this invoice"
          />
        </FFormGroup>
        <span className={styles.smallHint}>
          Add Cc/Bcc recipients when you review the email.
        </span>
        <InvoiceExchangeRateInputField />
      </div>
      <div className={styles.fieldGrid}>
        <div className={styles.fieldColumn}>
          <FFormGroup name="billingAddressText" label="Bill to">
            <textarea
              id="billingAddressText"
              name="billingAddressText"
              className="bp4-input"
              rows={5}
              value={values.billingAddressText ?? ''}
              placeholder="Billing address"
              maxLength={4000}
              onChange={(event) =>
                setFieldValue('billingAddressText', event.target.value)
              }
            />
          </FFormGroup>
          <span className={styles.smallHint}>
            Saved on this invoice only. Your customer profile stays unchanged.
          </span>
        </div>
        <div className={styles.fieldColumn}>
          <FFormGroup name="shippingAddressText" label="Ship to">
            <textarea
              id="shippingAddressText"
              name="shippingAddressText"
              className="bp4-input"
              rows={5}
              value={values.shippingAddressText ?? ''}
              placeholder="Shipping address"
              maxLength={4000}
              onChange={(event) =>
                setFieldValue('shippingAddressText', event.target.value)
              }
            />
          </FFormGroup>
          <span className={styles.smallHint}>
            Saved on this invoice only. Your customer profile stays unchanged.
          </span>
        </div>
        <div className={styles.fieldColumn}>
          <FFormGroup name="shippingMethod" label="Ship via">
            <FInputGroup
              name="shippingMethod"
              placeholder="Carrier or delivery method"
            />
          </FFormGroup>
          {dateField('shippingDate', 'Shipping date')}
          <FFormGroup name="trackingNo" label="Tracking no.">
            <FInputGroup name="trackingNo" />
          </FFormGroup>
          <FFormGroup name="referenceNo" label="Customer PO / reference">
            <FInputGroup
              name="referenceNo"
              data-testId="invoice-reference-input"
            />
          </FFormGroup>
        </div>
        <div className={styles.fieldColumn}>
          <FFormGroup name="invoiceNo" label="Invoice no.">
            <FInputGroup
              name="invoiceNo"
              data-testId="invoice-number-input"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setFieldValue('invoiceNo', event.target.value);
                setFieldValue('invoiceNoManually', event.target.value);
              }}
            />
          </FFormGroup>
          <FFormGroup name="paymentTermsDays" label="Terms">
            <select
              id="paymentTermsDays"
              name="paymentTermsDays"
              className="bp4-input"
              value={values.paymentTermsDays}
              onChange={(event) =>
                setFieldValue('paymentTermsDays', event.target.value)
              }
            >
              <option value="">Custom</option>
              <option value="0">Due on receipt</option>
              {[7, 15, 30, 45, 60, 90].map((days) => (
                <option key={days} value={days}>
                  Net {days}
                </option>
              ))}
            </select>
          </FFormGroup>
          {dateField('invoiceDate', 'Invoice date')}
          {dateField('dueDate', 'Due date')}
        </div>
      </div>
    </section>
  );
}
