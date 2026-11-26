import {
  Button,
  Checkbox,
  InputGroup,
  HTMLSelect,
  Tag,
  Callout,
} from '@blueprintjs/core';
import { useFormikContext } from 'formik';
import { useState } from 'react';
import { Box, FFormGroup, FInputGroup, Can } from '@/components';
import { CustomerFormSectionTitle } from './CustomerFormSectionTitle';
import { CustomerFormValues } from './utils';
import { useCustomerFormContext } from './CustomerFormProvider';
import { useWorkspaceQuery } from '../CustomerWorkspace/useCustomerWorkspace';
import { useCustomerTypes } from '../CustomerTypes/useCustomerTypes';
import {
  UploadAttachmentsPopoverContent,
  AttachmentFile,
} from '@/containers/Attachments/UploadAttachmentsPopoverContent';
import { AbilitySubject } from '@/constants/abilityOption';

export function CustomerCategoriesFields() {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  const [category, setCategory] = useState('');
  const query = useCustomerTypes();
  const categories = values.customerProfile.categories || [];
  const add = () => {
    const name = category.trim();
    if (name && !categories.some((c) => c.toLowerCase() === name.toLowerCase()))
      setFieldValue('customerProfile.categories', [...categories, name]);
    setCategory('');
  };
  return (
    <Box data-section-id="additional">
      <CustomerFormSectionTitle>
        Customer categories & custom fields
      </CustomerFormSectionTitle>
      <FFormGroup
        name="customerProfile.categories"
        label="Customer categories"
        inline
        helperText="Add your own types, such as Retail, Wholesale, or Temples & Churches."
      >
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <InputGroup
              aria-label="Customer category"
              placeholder="Choose or add a category"
              list="customer-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              maxLength={100}
            />
            <Button type="button" onClick={add}>
              Add
            </Button>
          </div>
          {query.isError && (
            <Callout intent="warning" style={{ marginTop: 8 }}>
              Customer types could not be loaded. You can still enter a
              category.
            </Callout>
          )}
          <datalist id="customer-category-options">
            {query.data?.map((c) => <option key={c} value={c} />)}
          </datalist>
          <div
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}
          >
            {categories.map((c) => (
              <Tag
                key={c}
                onRemove={() =>
                  setFieldValue(
                    'customerProfile.categories',
                    categories.filter((v) => v !== c),
                  )
                }
              >
                {c}
              </Tag>
            ))}
          </div>
        </>
      </FFormGroup>
      {(values.customerProfile.customFields || []).map((field, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <FFormGroup
            name={`customerProfile.customFields.${i}.label`}
            label="Field name"
            inline
          >
            <FInputGroup
              name={`customerProfile.customFields.${i}.label`}
              placeholder="e.g. Delivery instructions"
              fill
            />
          </FFormGroup>
          <FFormGroup
            name={`customerProfile.customFields.${i}.value`}
            label="Value"
            inline
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <FInputGroup
                name={`customerProfile.customFields.${i}.value`}
                fill
              />
              <Button
                type="button"
                minimal
                intent="danger"
                aria-label="Remove custom field"
                icon="trash"
                onClick={() =>
                  setFieldValue(
                    'customerProfile.customFields',
                    values.customerProfile.customFields?.filter(
                      (_, index) => index !== i,
                    ),
                  )
                }
              />
            </div>
          </FFormGroup>
        </div>
      ))}
      <Button
        type="button"
        icon="plus"
        onClick={() =>
          setFieldValue('customerProfile.customFields', [
            ...(values.customerProfile.customFields || []),
            { label: '', value: '' },
          ])
        }
      >
        Add custom field
      </Button>
    </Box>
  );
}
export function CustomerPaymentFields() {
  return (
    <>
      <FFormGroup
        name="customerProfile.paymentTermsDays"
        label="Payment terms"
        inline
      >
        <PaymentTermsSelect />
      </FFormGroup>
      <FFormGroup
        name="customerProfile.paymentMethod"
        label="Payment method"
        inline
      >
        <FInputGroup
          name="customerProfile.paymentMethod"
          placeholder="e.g. Check, ACH, cash"
          fill
        />
      </FFormGroup>
    </>
  );
}
function PaymentTermsSelect() {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  return (
    <HTMLSelect
      aria-label="Payment terms"
      value={values.customerProfile.paymentTermsDays ?? ''}
      onChange={(e) =>
        setFieldValue(
          'customerProfile.paymentTermsDays',
          e.target.value === '' ? undefined : Number(e.target.value),
        )
      }
      options={[
        { label: 'Select terms', value: '' },
        ...[0, 7, 10, 15, 30, 45, 60, 90].map((days) => ({
          label: days ? `Net ${days}` : 'Due on receipt',
          value: days,
        })),
      ]}
    />
  );
}
export function CustomerSavedAddresses() {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  const addresses = values.customerProfile.addresses || [];
  return (
    <Box data-section-id="savedAddresses">
      <CustomerFormSectionTitle>Additional addresses</CustomerFormSectionTitle>
      <p>Save other delivery locations for this customer.</p>
      {addresses.map((a, i) => (
        <div
          key={i}
          style={{
            padding: 12,
            border: '1px solid #dce3e8',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <FFormGroup
            name={`customerProfile.addresses.${i}.label`}
            label="Address name"
            inline
          >
            <FInputGroup
              name={`customerProfile.addresses.${i}.label`}
              placeholder="e.g. Warehouse"
              fill
            />
          </FFormGroup>
          <FFormGroup
            name={`customerProfile.addresses.${i}.address`}
            label="Address"
            inline
          >
            <AddressText index={i} />
          </FFormGroup>
          <Button
            type="button"
            small
            minimal
            intent="danger"
            onClick={() =>
              setFieldValue(
                'customerProfile.addresses',
                addresses.filter((_, index) => index !== i),
              )
            }
          >
            Remove address
          </Button>
        </div>
      ))}
      <Button
        type="button"
        icon="plus"
        onClick={() =>
          setFieldValue('customerProfile.addresses', [
            ...addresses,
            { label: '', address: '' },
          ])
        }
      >
        Add address
      </Button>
    </Box>
  );
}
function AddressText({ index }: { index: number }) {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  return (
    <textarea
      aria-label="Saved address"
      className="bp4-input bp4-fill"
      rows={3}
      value={values.customerProfile.addresses?.[index].address}
      onChange={(e) =>
        setFieldValue(
          `customerProfile.addresses.${index}.address`,
          e.target.value,
        )
      }
    />
  );
}
export function CustomerShippingSameAsBilling() {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  return (
    <Checkbox
      checked={values.customerProfile.shippingSameAsBilling || false}
      onChange={(e) =>
        setFieldValue(
          'customerProfile.shippingSameAsBilling',
          e.currentTarget.checked,
        )
      }
    >
      Same as billing address
    </Checkbox>
  );
}
export function CustomerAttachmentsFields() {
  const { values, setFieldValue } = useFormikContext<CustomerFormValues>();
  const { customerId } = useCustomerFormContext();
  const { data: files, isError } = useWorkspaceQuery<AttachmentFile[]>(
    `${customerId}/attachments`,
    !!customerId,
  );
  const [uploaded, setUploaded] = useState<AttachmentFile[]>([]);
  const keys = values.customerProfile.attachmentKeys || [];
  const value = [...(files || []), ...uploaded].filter(
    (file, i, all) =>
      keys.includes(file.key) && all.findIndex((f) => f.key === file.key) === i,
  );
  return (
    <Can I="Create" a={AbilitySubject.Attachment}>
      <Box data-section-id="attachments">
        <CustomerFormSectionTitle>Attachments</CustomerFormSectionTitle>
        {isError && (
          <Callout intent="warning">
            Existing attachments could not be loaded. They will remain saved.
          </Callout>
        )}
        <UploadAttachmentsPopoverContent
          value={value}
          onChange={(next) => {
            setUploaded(next);
            setFieldValue('customerProfile.attachmentKeys', [
              ...keys.filter((key) => !value.some((file) => file.key === key)),
              ...next.map((file) => file.key),
            ]);
          }}
        />
      </Box>
    </Can>
  );
}
