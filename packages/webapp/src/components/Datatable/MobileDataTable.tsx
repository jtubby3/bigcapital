import {
  Button,
  Checkbox,
  Popover,
  Position,
  Spinner,
} from '@blueprintjs/core';
import React, { useContext, useEffect, useLayoutEffect, useState } from 'react';
import TableContext from './TableContext';
import { useMobileSearch } from '@/hooks/useMobileSearch';

/** Reuse the live table's cells, permissions, pagination and record actions. */
export function MobileDataTable() {
  const { table, props } = useContext(TableContext);
  const {
    mobileCardColumns = [],
    mobileCardFooter,
    mobileSearchPlaceholder = 'Search records…',
    loading,
    progressBarLoading,
    onCellClick,
    ContextMenu: ActionsMenu,
    selectionColumn,
    rowTestId,
    mobileError,
    onMobileRetry,
    data,
    onSelectedRowsChange,
  } = props;
  const { query, submit } = useMobileSearch();
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  const columns = mobileCardColumns
    .map((id) => table.allColumns.find((column) => column.id === id))
    .filter((column): column is NonNullable<typeof column> => !!column);
  const sort = table.state.sortBy[0];
  const {
    toggleAllRowsSelected,
    state: { pageIndex, sortBy },
  } = table;
  const resultIds = JSON.stringify(data.map((record) => record.id));
  // Positional table row IDs must never carry a selection into a new result set.
  useLayoutEffect(() => {
    toggleAllRowsSelected(false);
    onSelectedRowsChange?.([]);
  }, [
    resultIds,
    query,
    pageIndex,
    sortBy,
    toggleAllRowsSelected,
    onSelectedRowsChange,
  ]);

  return (
    <section
      className="mobile-records"
      aria-label="Records"
      aria-busy={loading || progressBarLoading}
    >
      <form
        className="mobile-records__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          table.gotoPage(0);
          submit(search);
        }}
      >
        <input
          className="bp4-input"
          type="search"
          aria-label="Search records"
          placeholder={mobileSearchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" icon="search" aria-label="Submit search" />
        {query && (
          <Button
            minimal
            aria-label="Clear search"
            icon="cross"
            onClick={() => {
              setSearch('');
              table.gotoPage(0);
              submit('');
            }}
          />
        )}
      </form>
      <div className="mobile-records__tools">
        <label>
          Sort by
          <select
            value={sort?.id || ''}
            onChange={(event) => {
              table.gotoPage(0);
              table.setSortBy(
                event.target.value
                  ? [{ id: event.target.value, desc: false }]
                  : [],
              );
            }}
          >
            <option value="">Default order</option>
            {columns
              .filter((column) => column.canSort)
              .map((column) => (
                <option key={column.id} value={column.id}>
                  {typeof column.Header === 'string'
                    ? column.Header
                    : column.id}
                </option>
              ))}
          </select>
        </label>
        {sort && (
          <Button
            minimal
            icon={sort.desc ? 'sort-desc' : 'sort-asc'}
            aria-label={sort.desc ? 'Sort ascending' : 'Sort descending'}
            onClick={() => table.setSortBy([{ ...sort, desc: !sort.desc }])}
          />
        )}
        {progressBarLoading && !loading && (
          <Spinner size={18} aria-label="Refreshing records" />
        )}
      </div>
      {loading ? (
        <div className="mobile-records__empty">
          <Spinner size={28} />
        </div>
      ) : mobileError ? (
        <div className="mobile-records__empty" role="alert">
          <p>Could not load records. Check your connection and try again.</p>
          <Button onClick={onMobileRetry} icon="refresh">
            Retry
          </Button>
        </div>
      ) : table.page.length === 0 ? (
        <p className="mobile-records__empty" role="status">
          No records found.{' '}
          {query && 'Try another search or clear your search.'}
        </p>
      ) : (
        table.page.map((row) => {
          table.prepareRow(row);
          const cells = mobileCardColumns
            .map((id) => row.allCells.find((cell) => cell.column.id === id))
            .filter((cell): cell is NonNullable<typeof cell> => !!cell);
          const primary = cells[0];
          const title = String(primary?.value || 'View record');
          const testId =
            typeof rowTestId === 'function' ? rowTestId(row) : rowTestId;
          return (
            <article
              className="mobile-record"
              key={row.id}
              data-testid={testId}
            >
              <div className="mobile-record__heading">
                <button
                  type="button"
                  className="mobile-record__title"
                  onClick={(event) => primary && onCellClick?.(primary, event)}
                >
                  {title}
                </button>
                {selectionColumn && (
                  <Checkbox
                    aria-label={`Select ${title}`}
                    checked={row.isSelected}
                    onChange={(event) =>
                      row.toggleRowSelected(event.currentTarget.checked)
                    }
                  />
                )}
                {ActionsMenu && (
                  <Popover
                    position={Position.BOTTOM_RIGHT}
                    content={<ActionsMenu {...table} row={row} />}
                  >
                    <Button
                      minimal
                      icon="more"
                      aria-label={`Actions for ${title}`}
                    />
                  </Popover>
                )}
              </div>
              <dl>
                {cells.slice(1).map((cell) => (
                  <div key={cell.column.id}>
                    <dt>{cell.column.render('Header')}</dt>
                    <dd>{cell.render('Cell')}</dd>
                  </div>
                ))}
              </dl>
              {mobileCardFooter?.(row.original)}
              <Button
                minimal
                rightIcon="chevron-right"
                className="mobile-record__details"
                onClick={(event) => primary && onCellClick?.(primary, event)}
              >
                View details
              </Button>
            </article>
          );
        })
      )}
    </section>
  );
}
