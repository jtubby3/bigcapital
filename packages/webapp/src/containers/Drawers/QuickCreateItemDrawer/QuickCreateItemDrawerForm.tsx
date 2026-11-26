import { Button, Intent } from '@blueprintjs/core';
import { css } from '@emotion/css';
import { useFormikContext, type FormikHelpers } from 'formik';
import { useMemo } from 'react';
import type { CreateItemResponse } from '@bigcapital/sdk-ts';
import { ItemFormFormik } from '@/containers/Items/ItemFormFormik';
import {
  ItemFormProvider,
  useItemFormContext,
} from '@/containers/Items/ItemFormProvider';
import type {
  ItemFormValues,
  ItemFormSubmitPayload,
} from '@/containers/Items/types';
import { DrawerLoading } from '@/components';
import { DRAWERS } from '@/constants/drawers';
import { useDrawerActions } from '@/hooks/state';
import { useAddAutofillRef } from '@/hooks/state/autofill';

interface QuickCreateItemDrawerFormProps {
  itemId?: number;
  itemName?: string;
  autofillRef?: number;
}

export function QuickCreateItemDrawerForm({
  itemId,
  itemName,
  autofillRef,
}: QuickCreateItemDrawerFormProps) {
  const { closeDrawer } = useDrawerActions();
  const addAutofillRef = useAddAutofillRef();
  const initialValues = useMemo(() => ({ name: itemName ?? '' }), [itemName]);
  const close = () => closeDrawer(DRAWERS.QUICK_CREATE_ITEM);
  const handleSubmitSuccess = (
    _values: ItemFormValues,
    _form: FormikHelpers<ItemFormValues>,
    _submitPayload: ItemFormSubmitPayload,
    response: CreateItemResponse | void,
  ) => {
    const id = response?.id ?? itemId;
    if (autofillRef && id) addAutofillRef(autofillRef, { itemId: id });
    close();
  };
  return (
    <ItemFormProvider itemId={itemId} ignoreLocationState>
      <DrawerItemFormLoading>
        <div
          className={css`
            padding: 16px;
            min-width: 0;
            .page-form {
              padding: 0;
            }
          `}
        >
          <ItemFormFormik
            initialValues={initialValues}
            onSubmitSuccess={handleSubmitSuccess}
            footerActions={<QuickItemActions onCancel={close} />}
          />
        </div>
      </DrawerItemFormLoading>
    </ItemFormProvider>
  );
}

function QuickItemActions({ onCancel }: { onCancel: () => void }) {
  const { isSubmitting } = useFormikContext<ItemFormValues>();
  return (
    <div
      className={css`
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        padding: 16px 0;
        margin-top: 20px;
        border-top: 1px solid var(--color-drawer-header-border);
        position: sticky;
        bottom: 0;
        background: var(--color-card-background);
        z-index: 2;
      `}
    >
      <Button type="button" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button
        type="submit"
        intent={Intent.PRIMARY}
        loading={isSubmitting}
        disabled={isSubmitting}
      >
        Save and close
      </Button>
    </div>
  );
}

function DrawerItemFormLoading({ children }: { children: React.ReactNode }) {
  const { isFormLoading } = useItemFormContext();
  return <DrawerLoading loading={isFormLoading}>{children}</DrawerLoading>;
}
