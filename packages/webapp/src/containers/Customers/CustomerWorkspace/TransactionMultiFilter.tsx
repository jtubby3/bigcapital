import {
  Button,
  Checkbox,
  Divider,
  Popover,
  Position,
} from '@blueprintjs/core';
import { useState } from 'react';
import styles from './CustomerWorkspace.module.scss';

export const TRANSACTION_TYPES = [
  'Invoice',
  'Payment',
  'Credit memo',
  'Estimate',
  'Sales receipt',
];
export const TRANSACTION_STATUSES = [
  'Open',
  'Overdue',
  'Partial',
  'Paid',
  'Closed',
  'Draft',
  'Accepted',
  'Rejected',
  'Converted',
];

interface TransactionMultiFilterProps {
  label: string;
  allLabel: string;
  plural: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

export function TransactionMultiFilter({
  label,
  allLabel,
  plural,
  options,
  value,
  onChange,
}: TransactionMultiFilterProps) {
  const [isOpen, setOpen] = useState(false);
  const text =
    value.length === options.length
      ? allLabel
      : value.length === 0
        ? `No ${plural}`
        : value.length === 1
          ? value[0]
          : `${value.length} ${plural}`;
  const toggle = (option: string) =>
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );

  return (
    <div className={styles.multiFilter}>
      <span>{label}</span>
      <Popover
        minimal
        position={Position.BOTTOM_LEFT}
        isOpen={isOpen}
        onInteraction={setOpen}
        content={
          <div
            className={styles.filterOptions}
            role="dialog"
            aria-label={`${label} filter options`}
          >
            <Checkbox
              checked={value.length === options.length}
              indeterminate={value.length > 0 && value.length < options.length}
              onChange={() =>
                onChange(value.length === options.length ? [] : [...options])
              }
              label={allLabel}
            />
            <Divider />
            {options.map((option) => (
              <Checkbox
                key={option}
                checked={value.includes(option)}
                onChange={() => toggle(option)}
                label={option}
              />
            ))}
          </div>
        }
      >
        <Button
          rightIcon="chevron-down"
          aria-label={`${label}: ${text}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title={value.length ? value.join(', ') : allLabel}
        >
          {text}
        </Button>
      </Popover>
    </div>
  );
}
