import { Button, HTMLTable, InputGroup } from '@blueprintjs/core';
import { useId, useState } from 'react';
import { useLocalStorage } from 'react-use';
import '@/style/pages/Items/PriceHistory.scss';
import {
  useItemPriceHistory,
  useCurrentOrganizationBaseCurrency,
} from '@/hooks/query';

export function ItemPriceHistory({ itemId }: { itemId: number | undefined }) {
  const id = useId();
  const [savedCount, setSavedCount] = useLocalStorage<number>(
    'item-price-history-count',
    6,
  );
  const validCount = (value: number) =>
    Number.isInteger(value) && value >= 1 && value <= 1000;
  const storedCount = validCount(savedCount ?? 6) ? (savedCount ?? 6) : 6;
  const [count, setCount] = useState(String(storedCount));
  const valid = count.trim() !== '' && validCount(Number(count));
  const limit = valid ? Number(count) : storedCount;
  const { data, isLoading, isError, isFetching, refetch } = useItemPriceHistory(
    itemId,
    limit,
  );
  const currency = useCurrentOrganizationBaseCurrency();
  const money = (value: number | null) =>
    value === null
      ? '—'
      : new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 3,
        }).format(value);
  const priceChange = (before: number | null, after: number | null) =>
    before === after ? money(after) : `${money(before)} → ${money(after)}`;

  return (
    <div className="item-price-history">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <label htmlFor={id}>Show last</label>
        <div style={{ width: 88 }}>
          <InputGroup
            id={id}
            type="number"
            aria-label="Price history count"
            min={1}
            max={1000}
            step={1}
            value={count}
            intent={valid ? 'none' : 'danger'}
            onChange={(event) => {
              const next = event.target.value;
              setCount(next);
              if (next !== '' && validCount(Number(next)))
                setSavedCount(Number(next));
            }}
            onBlur={() => {
              if (!valid) setCount(String(storedCount));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <span>price changes</span>
        <Button
          type="button"
          minimal
          icon="refresh"
          aria-label="Refresh price history"
          disabled={isFetching}
          onClick={() => refetch()}
        />
      </div>
      {!valid && <p role="alert">Enter a whole number from 1 to 1,000.</p>}
      {isLoading ? (
        <p role="status">Loading price history…</p>
      ) : isError ? (
        <p role="alert">
          Could not load price history. Use Refresh to try again.
        </p>
      ) : !data?.length ? (
        <p>
          No saved price changes yet. History starts with the next saved price
          change; earlier changes were not recorded.
        </p>
      ) : (
        <div
          className="item-price-history__scroll"
          role="region"
          aria-label="Scrollable item price history"
          tabIndex={0}
        >
          <HTMLTable
            condensed
            striped
            style={{ width: '100%' }}
            className="item-price-history__table"
            aria-label="Item price history"
          >
            <thead>
              <tr>
                <th>Date</th>
                <th>Cost price</th>
                <th>Selling price</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.map((change) => (
                <tr key={change.id}>
                  <td data-label="Date">
                    {new Date(change.changedAt).toLocaleString()}
                  </td>
                  <td data-label="Cost price">
                    {priceChange(change.oldCostPrice, change.newCostPrice)}
                  </td>
                  <td data-label="Selling price">
                    {priceChange(change.oldSellPrice, change.newSellPrice)}
                  </td>
                  <td data-label="Source">
                    {change.source === 'purchase'
                      ? 'Purchase update'
                      : 'Item edit'}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </div>
      )}
    </div>
  );
}
