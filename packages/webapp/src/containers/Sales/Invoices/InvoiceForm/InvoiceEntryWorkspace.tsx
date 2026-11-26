import { Button, Intent } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { InvoiceLivePreview } from './InvoiceLivePreview';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import styles from './InvoiceEntryWorkspace.module.scss';
import { useInvoiceDueAmountFormatted } from './utils';
import type { InvoiceFormValues } from './utils';
import { FFormGroup, FSwitch } from '@/components';
import { DRAWERS } from '@/constants/drawers';
import { useDrawerActions } from '@/hooks/state';

export function InvoiceEntryWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  const [manage, setManage] = useState(false);
  const { values, setFieldValue } = useFormikContext<InvoiceFormValues>();
  const { brandingTemplates, paymentServices } = useInvoiceFormContext();
  const { openDrawer } = useDrawerActions();
  const history = useHistory();
  const due = useInvoiceDueAmountFormatted();
  const paymentsEnabled = Object.values(values.paymentMethods).some(
    (method) => method.enable,
  );
  const methods = Array.isArray(paymentServices) ? paymentServices : [];
  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Invoice view">
          <Button
            minimal
            role="tab"
            aria-selected={!preview}
            className={!preview ? styles.activeTab : ''}
            onClick={() => setPreview(false)}
          >
            Edit
          </Button>
          <Button
            minimal
            role="tab"
            aria-selected={preview}
            className={preview ? styles.activeTab : ''}
            onClick={() => setPreview(true)}
          >
            Payer view
          </Button>
        </div>
        <Button
          minimal
          icon="cog"
          aria-expanded={manage}
          onClick={() => setManage(!manage)}
        >
          Manage
        </Button>
      </div>
      <div className={styles.body}>
        <main className={styles.main}>
          <div className={styles.status}>
            <span>
              Online payments{' '}
              <strong>{paymentsEnabled ? 'On' : 'Not enabled'}</strong>{' '}
              <Button minimal small onClick={() => setManage(true)}>
                Edit
              </Button>
            </span>
            <span>
              Balance due{' '}
              <strong data-testId="invoice-entry-balance-due">{due}</strong>
            </span>
          </div>
          <div hidden={preview}>{children}</div>
          {preview && (
            <div className={styles.preview} aria-label="Invoice payer preview">
              <InvoiceLivePreview />
            </div>
          )}
        </main>
        {manage && (
          <aside className={styles.manage} aria-label="Invoice settings">
            <details open>
              <summary>Payment methods</summary>
              {methods.length ? (
                methods.map((service) => (
                  <FSwitch
                    key={service.id}
                    name={`paymentMethods.${service.id}.enable`}
                    label="Card payments"
                  />
                ))
              ) : (
                <>
                  <p>
                    Connect a payment service to accept online payments on your
                    invoices.
                  </p>
                  <Button
                    small
                    intent={Intent.PRIMARY}
                    onClick={() => history.push('/preferences/payment-methods')}
                  >
                    Set up payments
                  </Button>
                </>
              )}
            </details>
            <details open>
              <summary>Design</summary>
              <FFormGroup name="pdfTemplateId" label="Invoice template">
                <select
                  id="pdfTemplateId"
                  className="bp4-input"
                  value={values.pdfTemplateId}
                  onChange={(event) =>
                    setFieldValue('pdfTemplateId', event.target.value)
                  }
                >
                  <option value="">Default template</option>
                  {brandingTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.templateName}
                    </option>
                  ))}
                </select>
              </FFormGroup>
              <Button
                style={{ marginTop: 12 }}
                small
                onClick={() =>
                  openDrawer(DRAWERS.BRANDING_TEMPLATES, {
                    resource: 'SaleInvoice',
                  })
                }
              >
                Customize templates
              </Button>
            </details>
            <details>
              <summary>Invoice workflow</summary>
              <p>
                Save and close posts the invoice. Save for later keeps it
                unposted. Review and send saves the invoice and opens an email
                review; it does not send automatically.
              </p>
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}
