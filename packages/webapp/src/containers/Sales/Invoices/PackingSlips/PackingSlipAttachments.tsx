import React, { useState } from 'react';
import { Button, Callout, Dialog, Intent, Spinner } from '@blueprintjs/core';
import { Link } from 'react-router-dom';
import { useDrawerContext } from '@/components/Drawer/DrawerProvider';
import { useDrawerActions } from '@/hooks/state';
import {
  SlipAttachment,
  packingSlipError,
  useInvoicePackingSlips,
  usePackingSlipApi,
  usePackingSlipObjectUrl,
  usePackingSlipPermissions,
  useRefreshPackingSlips,
} from './usePackingSlips';
import styles from './PackingSlips.module.scss';

export function PackingSlipPreview({
  slip,
  onClose,
}: {
  slip: Pick<SlipAttachment, 'id' | 'version' | 'name' | 'pages'>;
  onClose: () => void;
}) {
  const { url, error } = usePackingSlipObjectUrl(
    `/slips/${slip.id}/pdf?version=${slip.version}`,
  );
  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={slip.name}
      className={styles.previewDialog}
    >
      <div className={styles.previewBody}>
        {error ? (
          <Callout intent={Intent.DANGER}>{error}</Callout>
        ) : !url ? (
          <Spinner size={24} />
        ) : (
          <>
            <a
              href={url}
              download={
                slip.name.toLowerCase().endsWith('.pdf')
                  ? slip.name
                  : `${slip.name}.pdf`
              }
              className="bp4-button"
            >
              Download assigned pages PDF
            </a>
            <iframe
              src={url}
              title={`Packing slip ${slip.name}, pages ${slip.pages.join(', ')}`}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}

export function PackingSlipAttachments({ invoiceId }: { invoiceId?: number }) {
  const slips = useInvoicePackingSlips(invoiceId);
  const api = usePackingSlipApi();
  const refresh = useRefreshPackingSlips();
  const { canRemove } = usePackingSlipPermissions();
  const { name } = useDrawerContext();
  const { closeDrawer } = useDrawerActions();
  const [preview, setPreview] = useState<SlipAttachment>();
  const [removing, setRemoving] = useState<number>();
  const [error, setError] = useState('');
  async function detach(slip: SlipAttachment) {
    setRemoving(slip.id);
    setError('');
    try {
      await api.post(`/slips/${slip.id}/detach`, { version: slip.version });
      await refresh();
    } catch (error) {
      setError(packingSlipError(error));
      await refresh();
    } finally {
      setRemoving(undefined);
    }
  }
  function closeInvoice(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey)
      closeDrawer(name);
  }
  return (
    <section className={styles.attachments} aria-label="Scanned packing slips">
      <div className={styles.row}>
        <h3>Scanned packing slips</h3>
        <Link to="/invoices/packing-slips" onClick={closeInvoice}>
          Scan packing slips
        </Link>
      </div>
      <p>Confirmed slips are available when emailing this invoice.</p>
      {slips.isLoading && <Spinner size={20} />}
      {slips.isError && (
        <Callout intent={Intent.DANGER}>
          {packingSlipError(slips.error)}{' '}
          <Button minimal onClick={() => slips.refetch()}>
            Retry
          </Button>
        </Callout>
      )}
      {error && <Callout intent={Intent.DANGER}>{error}</Callout>}
      {slips.data?.length === 0 && <p>No confirmed packing slips.</p>}
      {slips.data?.map((slip) => (
        <div className={styles.attachment} key={slip.id}>
          <div>
            <strong>{slip.name}</strong>
            <div>Pages {slip.pages.join(', ')}</div>
            {slip.status !== 'attached' && (
              <Callout intent={Intent.WARNING}>
                {slip.error ||
                  'This slip needs review before it can be emailed.'}
              </Callout>
            )}
          </div>
          <Button
            disabled={slip.status !== 'attached'}
            onClick={() => setPreview(slip)}
          >
            Preview / download
          </Button>
          {!!slip.batchId && (
            <Link
              to={`/invoices/packing-slips?batch=${slip.batchId}&slip=${slip.id}`}
              onClick={closeInvoice}
            >
              Review attachment
            </Link>
          )}
          {canRemove && (
            <Button
              loading={removing === slip.id}
              disabled={!!removing}
              onClick={() => detach(slip)}
            >
              Detach
            </Button>
          )}
        </div>
      ))}
      {preview && (
        <PackingSlipPreview
          slip={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
    </section>
  );
}
