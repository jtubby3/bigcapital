import { useEffect, useState } from 'react';
import {
  Button,
  Callout,
  Dialog,
  InputGroup,
  Spinner,
} from '@blueprintjs/core';
import { useQuery } from '@tanstack/react-query';
import {
  Option,
  OptionKind,
  scanError,
  useVendorScanApi,
} from './useVendorInvoiceScans';
import styles from './VendorInvoiceScans.module.scss';

export interface Picker {
  kind: OptionKind;
  label: string;
  choose: (value: Option | null) => void;
  canClear?: boolean;
}

export function VendorScanOptionPicker({
  picker,
  onClose,
}: {
  picker: Picker;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { http, key } = useVendorScanApi();
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search.trim()), 180);
    return () => clearTimeout(timeout);
  }, [search]);
  const options = useQuery({
    queryKey: [...key, 'options', picker.kind, query],
    queryFn: async ({ signal }) =>
      (
        await http.get<Option[]>('/options', {
          signal,
          params: { kind: picker.kind, search: query },
        })
      ).data,
    retry: false,
  });
  function choose(option: Option | null) {
    picker.choose(option);
    onClose();
  }
  return (
    <Dialog
      isOpen
      className={styles.dialog}
      title={picker.label}
      onClose={onClose}
    >
      <div className={styles.dialogBody}>
        <InputGroup
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={`Search ${picker.kind}`}
          leftIcon="search"
          placeholder={
            picker.kind === 'item' || picker.kind === 'charge'
              ? 'Search by name or code'
              : 'Search by name'
          }
          autoFocus
        />
        {options.isPending || search.trim() !== query ? (
          <Spinner size={20} />
        ) : null}
        {options.isError && (
          <Callout intent="danger" role="alert">
            {scanError(options.error)}
          </Callout>
        )}
        {search.trim() === query && options.data?.length === 0 && (
          <p>No matches found.</p>
        )}
        <div className={styles.options}>
          {picker.canClear && (
            <Button minimal onClick={() => choose(null)}>
              Clear selection
            </Button>
          )}
          {search.trim() === query &&
            options.data?.map((option) => (
              <Button
                alignText="left"
                key={option.id}
                onClick={() => choose(option)}
              >
                <strong>
                  {option.name}
                  {option.rate != null ? ` · ${option.rate}%` : ''}
                </strong>
                {option.code && <small>{option.code}</small>}
                {option.description && <small>{option.description}</small>}
              </Button>
            ))}
        </div>
      </div>
    </Dialog>
  );
}
