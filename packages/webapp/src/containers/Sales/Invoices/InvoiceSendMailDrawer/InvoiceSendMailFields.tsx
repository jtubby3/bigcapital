import React, { useState } from 'react';
import { Button, Callout, Checkbox, Intent } from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { SendMailViewMessageField } from '../../Estimates/SendMailViewDrawer/SendMailViewMessageField';
import { SendMailViewToAddressField } from '../../Estimates/SendMailViewDrawer/SendMailViewToAddressField';
import { useInvoiceMailItems, useSendInvoiceFormatArgsOptions } from './_hooks';
import { FCheckbox, FFormGroup, FInputGroup, Group, Stack } from '@/components';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { useDrawerActions } from '@/hooks/state';
import { useIsDarkMode } from '@/hooks/useDarkMode';
import { useInvoiceSendMailBoot } from './InvoiceSendMailContentBoot';
import { InvoiceSendMailFormValues } from './_types';
import { PackingSlipPreview } from '../PackingSlips/PackingSlipAttachments';
import {
  SlipAttachment,
  packingSlipPermissionDenied,
  useInvoicePackingSlips,
  usePackingSlipPermissions,
} from '../PackingSlips/usePackingSlips';
import styles from '../PackingSlips/PackingSlips.module.scss';

export function InvoiceSendMailFields() {
  const items = useInvoiceMailItems();
  const argsOptions = useSendInvoiceFormatArgsOptions();

  return (
    <Stack flex={1}>
      <Stack spacing={0} overflow="auto" flex="1" p={'30px'}>
        <SendMailViewToAddressField
          toMultiSelectProps={{ items }}
          ccMultiSelectProps={{ items }}
          bccMultiSelectProps={{ items }}
        />
        <FFormGroup label={'Subject'} name={'subject'}>
          <FInputGroup name={'subject'} large fastField />
        </FFormGroup>

        <SendMailViewMessageField argsOptions={argsOptions} />

        <Group>
          <FCheckbox name={'attachPdf'} label={'Attach invoice PDF'} />
        </Group>
        <InvoiceMailPackingSlips />
      </Stack>

      <InvoiceSendMailFooter />
    </Stack>
  );
}

function InvoiceSendMailFooter() {
  const { isSubmitting } = useFormikContext();
  const { name } = useDrawerContext();
  const { closeDrawer } = useDrawerActions();
  const isDarkMode = useIsDarkMode();

  const handleClose = () => {
    closeDrawer(name);
  };

  return (
    <Group
      py={'12px'}
      px={'16px'}
      borderTopWidth={1}
      borderTopStyle="solid"
      borderTopColor={isDarkMode ? 'rgba(255, 255, 255, 0.2)' : '#d8d8d9'}
      position={'apart'}
    >
      <Group spacing={10} ml={'auto'}>
        <Button
          disabled={isSubmitting}
          onClick={handleClose}
          style={{ minWidth: '65px' }}
        >
          Close
        </Button>

        <Button
          intent={Intent.PRIMARY}
          loading={isSubmitting}
          style={{ minWidth: '85px' }}
          type="submit"
        >
          Send Mail
        </Button>
      </Group>
    </Group>
  );
}

function InvoiceMailPackingSlips() {
  const { invoiceId } = useInvoiceSendMailBoot();
  const { data, error, isError, isFetching, refetch } =
    useInvoicePackingSlips(invoiceId);
  const { canView } = usePackingSlipPermissions();
  const canReadSlips = canView && !packingSlipPermissionDenied(error);
  const slips = canReadSlips ? data || [] : [];
  const { values, setFieldValue, isSubmitting } =
    useFormikContext<InvoiceSendMailFormValues>();
  const [preview, setPreview] = useState<SlipAttachment>();
  const removed = values.packingSlips.filter(
    (item) => !slips.some((slip) => slip.id === item.id),
  );
  if (!slips.length && !removed.length && !(canReadSlips && isError))
    return null;
  return (
    <section
      className={styles.mailAttachments}
      aria-label="Packing slip email attachments"
    >
      <h4>Packing slips</h4>
      <p>
        Select the confirmed packing slips to send with this invoice. Only their
        assigned pages will be attached.
      </p>
      {canReadSlips && isError && (
        <Callout intent={Intent.WARNING}>
          The latest packing slip list could not be loaded.
          <Button minimal disabled={isFetching} onClick={() => refetch()}>
            Refresh packing slips
          </Button>
        </Callout>
      )}
      {removed.length > 0 && (
        <Callout intent={Intent.WARNING}>
          {removed.length === 1
            ? 'A selected slip is no longer attached to this invoice.'
            : 'Some selected slips are no longer attached to this invoice.'}
          <Button
            minimal
            disabled={isSubmitting}
            onClick={() =>
              setFieldValue(
                'packingSlips',
                values.packingSlips.filter((item) => !removed.includes(item)),
              )
            }
          >
            Clear removed slips from this email
          </Button>
        </Callout>
      )}
      {slips.map((slip) => {
        const selected = values.packingSlips.some(
          (item) => item.id === slip.id,
        );
        const stale =
          slip.status !== 'attached' ||
          values.packingSlips.some(
            (item) => item.id === slip.id && item.version !== slip.version,
          );
        return (
          <div key={slip.id}>
            <div className={styles.row}>
              <Checkbox
                checked={selected}
                disabled={isSubmitting || (stale && !selected)}
                label={`${slip.name} · pages ${slip.pages.join(', ')}`}
                onChange={(event) =>
                  setFieldValue(
                    'packingSlips',
                    event.currentTarget.checked
                      ? [
                          ...values.packingSlips.filter(
                            (item) => item.id !== slip.id,
                          ),
                          { id: slip.id, version: slip.version },
                        ]
                      : values.packingSlips.filter(
                          (item) => item.id !== slip.id,
                        ),
                  )
                }
              />
              <Button minimal disabled={stale} onClick={() => setPreview(slip)}>
                Preview
              </Button>
            </div>
            {stale && (
              <Callout intent={Intent.WARNING}>
                {slip.error ||
                  'This document changed. Remove it from this email and review its invoice attachment.'}
              </Callout>
            )}
          </div>
        );
      })}
      {preview && (
        <PackingSlipPreview
          slip={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
    </section>
  );
}
