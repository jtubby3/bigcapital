import { formatTotalQuantity } from '@bigcapital/pdf-templates';
import { css } from '@emotion/css';
import { useContext } from 'react';
import { ScrollSyncPane } from 'react-scroll-sync';
import TableContext from '@/components/Datatable/TableContext';

/** A read-only footer that shares the editable table's column widths and scroll. */
export function ItemEntriesQuantityFooter() {
  const {
    table: { footerGroups, data },
  } = useContext(TableContext);
  const total = formatTotalQuantity(
    data.filter((entry) => entry.itemId).map((entry) => entry.quantity),
  );
  return (
    <ScrollSyncPane>
      <div
        className={css`
          overflow: hidden;
        `}
      >
        <div className="tfooter" data-invoice-quantity-footer>
          {footerGroups.map((group) => (
            <div {...group.getFooterGroupProps({ className: 'tr' })}>
              {group.headers.map((column) => (
                <div
                  {...column.getFooterProps({
                    className: `td ${css`
                      padding: 12px 14px;
                      min-height: 44px;
                      border-top: 1px solid var(--x-table-border);
                      font-weight: 600;
                      text-align: right;
                      white-space: normal;
                      overflow-wrap: anywhere;
                      justify-content: flex-end;
                      align-items: center;
                    `}`,
                  })}
                >
                  {column.id === 'description' && (
                    <span
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'right',
                      }}
                    >
                      Total quantity
                    </span>
                  )}
                  {column.id === 'quantity' && (
                    <output
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'right',
                      }}
                      aria-label="Total quantity"
                      aria-live="polite"
                      data-invoice-total-quantity
                    >
                      {total}
                    </output>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ScrollSyncPane>
  );
}
