import {
  Button,
  ButtonGroup,
  Intent,
  Menu,
  MenuItem,
  Popover,
  Position,
} from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import React from 'react';
import { useCustomerReturnTo } from '@/hooks/useCustomerReturnTo';
import { useHistory } from 'react-router-dom';
import { useInvoiceFormContext } from './InvoiceFormProvider';
import styles from './InvoiceEntryWorkspace.module.scss';
import type { InvoiceAfterSaveAction } from './invoiceWorkflow';
import type { InvoiceFormValues } from './utils';
import { Group, FormattedMessage as T } from '@/components';
import { PageForm } from '@/components/PageForm';

export function InvoiceFloatingActions() {
  const history = useHistory();
  const customerReturnTo = useCustomerReturnTo();
  const { submitForm, isSubmitting } = useFormikContext<InvoiceFormValues>();
  const { setSubmitPayload, invoice } = useInvoiceFormContext();
  const save = (options: {
    redirect?: boolean;
    deliver?: boolean;
    resetForm?: boolean;
    action?: InvoiceAfterSaveAction;
  }) => {
    setSubmitPayload(options);
    submitForm();
  };
  return (
    <PageForm.FooterActions position="apart" className={styles.footerActions}>
      <Group spacing={8}>
        <Button
          minimal
          disabled={isSubmitting}
          onClick={() => history.push(customerReturnTo || '/invoices')}
        >
          Cancel
        </Button>
        <Button
          minimal
          disabled={isSubmitting || Boolean(invoice?.isDelivered)}
          onClick={() => save({ redirect: true, deliver: false })}
        >
          <T id="sales.save_for_later" />
        </Button>
      </Group>
      <Button
        minimal
        icon="box"
        disabled={isSubmitting}
        onClick={() =>
          save({
            action: 'packing-slip-preview',
            deliver: Boolean(invoice?.isDelivered),
          })
        }
      >
        Packing slip
      </Button>
      <ButtonGroup>
        <Button
          minimal
          icon="print"
          disabled={isSubmitting}
          onClick={() =>
            save({
              action: 'invoice-preview',
              deliver: Boolean(invoice?.isDelivered),
            })
          }
        >
          Preview / print invoice
        </Button>
        <Popover
          minimal
          position={Position.TOP}
          content={
            <Menu>
              <MenuItem
                text="Download invoice PDF"
                icon="document"
                onClick={() =>
                  save({
                    action: 'invoice-pdf',
                    deliver: Boolean(invoice?.isDelivered),
                  })
                }
              />
              <MenuItem
                text="Download packing slip"
                icon="box"
                onClick={() =>
                  save({
                    action: 'packing-slip',
                    deliver: Boolean(invoice?.isDelivered),
                  })
                }
              />
            </Menu>
          }
        >
          <Button
            minimal
            icon="chevron-down"
            aria-label="Invoice download options"
            disabled={isSubmitting}
          />
        </Popover>
      </ButtonGroup>
      <Group spacing={10}>
        <ButtonGroup>
          <Button
            disabled={isSubmitting}
            onClick={() => save({ redirect: true, deliver: true })}
          >
            Save and close
          </Button>
          <Popover
            minimal
            position={Position.TOP_RIGHT}
            content={
              <Menu>
                <MenuItem
                  text="Save and new"
                  onClick={() => save({ resetForm: true, deliver: true })}
                />
                <MenuItem
                  text="Save and continue editing"
                  onClick={() => save({ deliver: true })}
                />
              </Menu>
            }
          >
            <Button
              aria-label="More save options"
              disabled={isSubmitting}
              icon="chevron-down"
            />
          </Popover>
        </ButtonGroup>
        <Button
          intent={Intent.PRIMARY}
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={() => save({ action: 'review-email', deliver: true })}
        >
          Review and send
        </Button>
      </Group>
    </PageForm.FooterActions>
  );
}
