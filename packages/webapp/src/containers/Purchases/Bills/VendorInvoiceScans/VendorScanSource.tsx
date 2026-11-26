import { useState } from 'react';
import { Button, Callout, Dialog, Spinner } from '@blueprintjs/core';
import { ScanFile, useVendorScanImage } from './useVendorInvoiceScans';
import styles from './VendorInvoiceScans.module.scss';

export interface PageSelection {
  fileId: number;
  page: number;
}

export function VendorScanSource({
  scanId,
  files,
  selection,
  onSelect,
}: {
  scanId: number;
  files: ScanFile[];
  selection?: PageSelection;
  onSelect: (selection: PageSelection) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const file =
    files.find((entry) => entry.id === selection?.fileId) || files[0];
  const count = file?.page_count || 0;
  const page =
    file?.id === selection?.fileId
      ? Math.max(1, Math.min(selection?.page || 1, count))
      : 1;
  const preview = useVendorScanImage(
    file && count ? `/${scanId}/files/${file.id}/pages/${page}` : undefined,
  );
  if (!file) return null;
  return (
    <section className={styles.source} aria-label="Original invoice">
      <h3>Original invoice</h3>
      {files.length > 1 ? (
        <select
          className={styles.control}
          aria-label="Source document"
          value={file.id}
          onChange={(event) =>
            onSelect({ fileId: Number(event.target.value), page: 1 })
          }
        >
          {files.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      ) : (
        <p>{file.name}</p>
      )}
      {count > 0 && (
        <div className={styles.actions}>
          <Button
            icon="chevron-left"
            aria-label="Previous source page"
            disabled={page <= 1}
            onClick={() => onSelect({ fileId: file.id, page: page - 1 })}
          />
          <span>
            Page {page} of {count}
          </span>
          <Button
            icon="chevron-right"
            aria-label="Next source page"
            disabled={page >= count}
            onClick={() => onSelect({ fileId: file.id, page: page + 1 })}
          />
        </div>
      )}
      {preview.error && <Callout intent="warning">{preview.error}</Callout>}
      {count > 0 && !preview.error && !preview.url && <Spinner size={24} />}
      {preview.url && (
        <button
          type="button"
          className={styles.sourceImage}
          onClick={() => setZoom(true)}
          aria-label={`Enlarge original invoice page ${page}`}
        >
          <img src={preview.url} alt={`Original invoice, page ${page}`} />
        </button>
      )}
      {preview.url && (
        <Dialog
          className={styles.sourceDialog}
          isOpen={zoom}
          onClose={() => setZoom(false)}
          title={`Original invoice · Page ${page}`}
        >
          <img
            className={styles.zoomImage}
            src={preview.url}
            alt={`Original invoice, page ${page}`}
          />
        </Dialog>
      )}
    </section>
  );
}
