import { useState } from 'react';
import {
  Button,
  Callout,
  Classes,
  Dialog,
  FormGroup,
  InputGroup,
  Intent,
  Spinner,
  Tag,
} from '@blueprintjs/core';
import { Can } from '@/components';
import { AbilitySubject, CustomerAction } from '@/constants/abilityOption';
import { useCreateCustomerType, useCustomerTypes } from './useCustomerTypes';

export function CustomerTypesButton() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        minimal
        icon="tag"
        text="Customer types"
        onClick={() => setIsOpen(true)}
      />
      {isOpen && <CustomerTypesDialog onClose={() => setIsOpen(false)} />}
    </>
  );
}

function CustomerTypesDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const types = useCustomerTypes();
  const createType = useCreateCustomerType();
  return (
    <Dialog
      isOpen
      title="Customer types"
      icon="tag"
      onClose={onClose}
      style={{ width: 520 }}
    >
      <div className={Classes.DIALOG_BODY}>
        <p>
          Create reusable customer types, such as Restaurants or Temples &amp;
          Churches.
        </p>
        <Can I={CustomerAction.Edit} a={AbilitySubject.Customer}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim() || createType.isPending) return;
              try {
                await createType.mutateAsync(name.trim());
                setName('');
              } catch {
                // Keep the name available for correction or retry.
              }
            }}
          >
            <FormGroup label="Type name" labelFor="customer-type-name">
              <div style={{ display: 'flex', gap: 8 }}>
                <InputGroup
                  id="customer-type-name"
                  placeholder="e.g. Restaurants"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    createType.reset();
                  }}
                  maxLength={100}
                  fill
                  autoFocus
                  disabled={createType.isPending}
                />
                <Button
                  type="submit"
                  intent={Intent.PRIMARY}
                  icon="plus"
                  loading={createType.isPending}
                  disabled={!name.trim()}
                >
                  Add type
                </Button>
              </div>
            </FormGroup>
            {createType.isError && (
              <Callout intent={Intent.DANGER} style={{ marginBottom: 16 }}>
                {createType.error.message}
              </Callout>
            )}
          </form>
        </Can>
        {types.isLoading && <Spinner size={24} />}
        {types.isError && (
          <Callout intent={Intent.WARNING}>
            Unable to load customer types.{' '}
            <Button minimal small onClick={() => types.refetch()}>
              Retry
            </Button>
          </Callout>
        )}
        {types.isSuccess && (
          <>
            <h4 style={{ marginBottom: 12 }}>
              Customer types ({types.data.length})
            </h4>
            {types.data.length ? (
              <ul
                aria-label="Customer types"
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {types.data.map((type) => (
                  <li
                    key={type}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid #e5e9ed',
                    }}
                  >
                    <Tag minimal>{type}</Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No customer types yet. Add your first type above.</p>
            )}
          </>
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
