import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  Callout,
  Dialog,
  FormGroup,
  Spinner,
  Tag,
} from '@blueprintjs/core';
import { useHistory, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AbilitySubject, BillAction } from '@/constants/abilityOption';
import { DRAWERS } from '@/constants/drawers';
import { billsKeys } from '@/hooks/query/bills/query-keys';
import { useAuthOrganizationId } from '@/hooks/state';
import { useAbilityContext } from '@/hooks/utils';
import {
  withDrawerActions,
  WithDrawerActionsProps,
} from '@/containers/Drawer/withDrawerActions';
import { index as BillDrawer } from '@/containers/Drawers/BillDrawer';
import { VendorScanReview } from './VendorScanReview';
import { VendorScanSource } from './VendorScanSource';
import type { PageSelection } from './VendorScanSource';
import {
  Pairing,
  Scan,
  ScanStatus,
  ScanSummary,
  TelegramConnection,
  scanError,
  useVendorScanApi,
} from './useVendorInvoiceScans';
import styles from './VendorInvoiceScans.module.scss';

const STATUS: Record<ScanStatus, string> = {
  queued: 'Queued',
  processing: 'Reading invoice',
  review: 'Ready for review',
  failed: 'Scan failed',
  posted: 'Purchase recorded',
  cancelled: 'Cancelled',
};

const pending = (scan?: ScanSummary) =>
  scan?.status === 'queued' || scan?.status === 'processing';
const FILE_TYPES = '.pdf,.png,.jpg,.jpeg,application/pdf,image/jpeg,image/png';
const MAX_COUNT = 10;
const MAX_TOTAL = 50 * 1024 * 1024;
const MAX_SIZE = 25 * 1024 * 1024;

function TelegramPanel({
  busy,
  run,
}: {
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const { http, key } = useVendorScanApi();
  const [pairing, setPairing] = useState<Pairing>();
  const client = useQueryClient();
  const connection = useQuery({
    queryKey: [...key, 'telegram'],
    queryFn: async ({ signal }) =>
      (await http.get<TelegramConnection>('/telegram/connection', { signal }))
        .data,
    refetchInterval: pairing ? 2500 : false,
    retry: false,
  });
  const state = connection.data;
  const paired = !!state?.connected;
  useEffect(() => {
    if (paired) setPairing(undefined);
  }, [paired]);
  const username = pairing?.bot_username || state?.bot_username;
  const link =
    username && /^[A-Za-z0-9_]+$/.test(username.replace(/^@/, ''))
      ? `https://t.me/${username.replace(/^@/, '')}`
      : undefined;
  if (connection.isPending) return null;
  return (
    <section className={styles.panel} aria-label="Telegram connection">
      <div className={styles.row}>
        <div>
          <h2>Telegram</h2>
          {connection.isError ? (
            <p role="alert">{scanError(connection.error)}</p>
          ) : paired ? (
            <p>
              Connected. Send invoices in your private chat with{' '}
              {link ? (
                <a href={link} target="_blank" rel="noreferrer">
                  {username}
                </a>
              ) : (
                'your bot'
              )}
              .
            </p>
          ) : state?.enabled ? (
            <p>
              Connect your Telegram account to scan and review invoices in a
              private chat.
            </p>
          ) : (
            <p>
              Telegram is unavailable until the local server has a bot
              configured.
            </p>
          )}
        </div>
        {state?.enabled && !paired && (
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { data } = await http.post<Pairing>('/telegram/pair');
                setPairing(data);
              })
            }
          >
            Connect Telegram
          </Button>
        )}
        {paired && (
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await http.delete('/telegram/connection');
                setPairing(undefined);
                await client.invalidateQueries({
                  queryKey: [...key, 'telegram'],
                });
              })
            }
          >
            Disconnect Telegram
          </Button>
        )}
      </div>
      <Dialog
        title="Connect Telegram"
        isOpen={!!pairing && !paired}
        onClose={() => setPairing(undefined)}
        className={styles.dialog}
      >
        <div className={styles.dialogBody}>
          <p>
            Open your private chat with{' '}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer">
                {username}
              </a>
            ) : (
              'your bot'
            )}{' '}
            and send this one-time code.
          </p>
          <p className={styles.pairCode}>
            <code>/pair {pairing?.code}</code>
          </p>
          <p>Keep this window open while Big Capital checks the connection.</p>
        </div>
      </Dialog>
    </section>
  );
}

function ScanUpload({
  busy,
  upload,
}: {
  busy: boolean;
  upload: (files: File[]) => Promise<void>;
}) {
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!files.length || busy) return;
    setError('');
    if (files.length > MAX_COUNT) {
      setError(`Choose up to ${MAX_COUNT} files for one invoice.`);
      return;
    }
    if (
      files.some(
        (file) =>
          file.size < 1 ||
          file.size > MAX_SIZE ||
          !/\.(pdf|png|jpe?g)$/i.test(file.name),
      )
    ) {
      setError('Use a PDF, JPEG, or PNG up to 25 MiB per file.');
      return;
    }
    if (files.reduce((size, file) => size + file.size, 0) > MAX_TOTAL) {
      setError('Choose files totaling 50 MiB or less.');
      return;
    }
    await upload(files);
  }
  return (
    <section className={styles.panel} aria-label="Upload vendor invoice">
      <h2>New scan</h2>
      <p>
        Upload a PDF or photos of one invoice. Select all its pages together.
      </p>
      <FormGroup className={styles.field} label="Invoice files" labelFor={id}>
        <input
          id={id}
          ref={input}
          className={styles.fileInput}
          type="file"
          accept={FILE_TYPES}
          multiple
          disabled={busy}
          onChange={(event) => {
            setFiles(Array.from(event.target.files || []));
            setError('');
          }}
        />
      </FormGroup>
      {error && (
        <Callout intent="danger" role="alert">
          {error}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button
          intent="primary"
          icon="upload"
          disabled={!files.length || busy}
          loading={busy}
          onClick={submit}
        >
          Scan invoice
        </Button>
        {files.length > 0 && (
          <Button
            minimal
            disabled={busy}
            onClick={() => {
              if (input.current) input.current.value = '';
              setFiles([]);
              setError('');
            }}
          >
            Clear files
          </Button>
        )}
      </div>
    </section>
  );
}

function VendorScanWorkspace({
  openDrawer,
}: Pick<WithDrawerActionsProps, 'openDrawer'>) {
  const { http, key } = useVendorScanApi();
  const history = useHistory();
  const { pathname, search } = useLocation();
  const rawId = Number(new URLSearchParams(search).get('scan'));
  const id = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : undefined;
  const client = useQueryClient();
  const ability = useAbilityContext();
  const canView =
    ability.can(BillAction.View, AbilitySubject.Bill) &&
    ability.can('View', AbilitySubject.Attachment) &&
    ability.can('View', AbilitySubject.Item) &&
    ability.can('View', AbilitySubject.Vendor);
  const canEdit =
    canView &&
    ability.can(BillAction.Create, AbilitySubject.Bill) &&
    ability.can('Create', AbilitySubject.Attachment);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<PageSelection>();
  const lists = useQuery({
    queryKey: [...key, 'list'],
    queryFn: async ({ signal }) =>
      (await http.get<ScanSummary[]>('/', { signal })).data,
    refetchInterval: (query) =>
      query.state.data?.some(pending) ? 2500 : 12000,
    enabled: canView,
    retry: false,
  });
  const scanQuery = useQuery({
    queryKey: [...key, 'scan', id],
    queryFn: async ({ signal }) =>
      (await http.get<Scan>(`/${id}`, { signal })).data,
    refetchInterval: (query) => (pending(query.state.data) ? 2000 : 10000),
    enabled: Boolean(id && canView),
    retry: false,
  });
  const scan = scanQuery.data;
  function openScan(scanId?: number) {
    history.push({ pathname, search: scanId ? `?scan=${scanId}` : '' });
    setError('');
    setSelection(undefined);
  }
  function saveScan(value: Scan) {
    const queryKey = [...key, 'scan', value.id];
    void client.cancelQueries({ queryKey });
    client.setQueryData(queryKey, value);
    void client.invalidateQueries({ queryKey: [...key, 'list'] });
    if (value.status === 'posted') {
      void client.invalidateQueries({ queryKey: billsKeys.all() });
    }
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(scanError(error));
      if (id) void scanQuery.refetch();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    await run(async () => {
      const body = new FormData();
      for (const file of files) body.append('files', file);
      const response = await http.post<Scan>('/', body);
      saveScan(response.data);
      openScan(response.data.id);
    });
  }
  function openBill(billId: number) {
    openDrawer(DRAWERS.BILL_DETAILS, { billId });
  }
  if (!canView) {
    return (
      <Callout intent="warning">
        Vendor scans require access to bills, attachments, items, and vendors.
      </Callout>
    );
  }

  const showEditor = scan?.status === 'review' && scan.review;
  return (
    <main className={styles.page}>
      <div className={styles.row}>
        <div>
          <h1>Scan vendor invoices</h1>
          <p>
            Match invoice lines and review case quantities and costs before
            recording a bill.
          </p>
        </div>
        {id && canEdit && (
          <Button icon="add" disabled={busy} onClick={() => openScan()}>
            New scan
          </Button>
        )}
      </div>
      {error && (
        <Callout intent="danger" role="alert">
          {error}
        </Callout>
      )}
      <div className={styles.layout}>
        <aside className={styles.panel} aria-label="Recent invoices">
          <div className={styles.row}>
            <h2>Recent scans</h2>
            <Button
              icon="refresh"
              minimal
              aria-label="Refresh recent scans"
              disabled={lists.isFetching}
              onClick={() => {
                void lists.refetch();
                if (id) void scanQuery.refetch();
              }}
            />
          </div>
          {lists.isPending && <Spinner size={20} />}
          {lists.isError && (
            <Callout intent="danger">{scanError(lists.error)}</Callout>
          )}
          {lists.data?.length === 0 && <p>New scans appear here.</p>}
          <div className={styles.history}>
            {lists.data?.map((entry) => (
              <Button
                key={entry.id}
                alignText="left"
                active={entry.id === id}
                aria-current={entry.id === id ? 'page' : undefined}
                disabled={busy}
                onClick={() => openScan(entry.id)}
              >
                <strong>{entry.name || `Scan #${entry.id}`}</strong>
                <small>{STATUS[entry.status]}</small>
              </Button>
            ))}
          </div>
        </aside>
        <div className={styles.content}>
          {!id && canEdit && <ScanUpload upload={upload} busy={busy} />}
          {!id && !canEdit && <p>Select a recent scan to view it.</p>}
          {id && scanQuery.isPending && <Spinner size={24} />}
          {scanQuery.isError && (
            <Callout intent="danger" role="alert">
              {scanError(scanQuery.error)}
            </Callout>
          )}
          {scan && (
            <section className={styles.panel} aria-label="Invoice scan">
              <div className={styles.row}>
                <h2>{scan.name || `Scan #${scan.id}`}</h2>
                <Tag
                  intent={
                    scan.status === 'posted'
                      ? 'success'
                      : scan.status === 'failed'
                        ? 'danger'
                        : 'none'
                  }
                >
                  {STATUS[scan.status]}
                </Tag>
              </div>
              {scan.error && (
                <Callout
                  intent={scan.status === 'failed' ? 'danger' : 'warning'}
                >
                  {scan.error}
                </Callout>
              )}
              {pending(scan) && (
                <p aria-live="polite">
                  Processing your invoice locally. You can leave and return to
                  this review.
                </p>
              )}
              <div className={styles.actions}>
                {canEdit &&
                  (pending(scan) ||
                    scan.status === 'failed' ||
                    scan.status === 'cancelled') && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const { data } = await http.post<Scan>(
                            `/${id}/retry`,
                            { version: scan.version },
                          );
                          saveScan(data);
                        })
                      }
                    >
                      Retry scan
                    </Button>
                  )}
                {canEdit && (pending(scan) || scan.status === 'failed') && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const { data } = await http.post<Scan>(
                          `/${id}/cancel`,
                          { version: scan.version },
                        );
                        saveScan(data);
                      })
                    }
                  >
                    Cancel scan
                  </Button>
                )}
                {!!scan.bill_id && (
                  <Button
                    intent="primary"
                    onClick={() => openBill(scan.bill_id!)}
                  >
                    Open bill #{scan.bill_id}
                  </Button>
                )}
              </div>
              {showEditor ? (
                <VendorScanReview
                  key={scan.id}
                  scan={{ ...scan, review: showEditor }}
                  onChange={saveScan}
                  onRefresh={() => {
                    void scanQuery.refetch();
                  }}
                  openBill={openBill}
                  busy={busy || !canEdit}
                  run={run}
                />
              ) : (
                <VendorScanSource
                  key={scan.id}
                  scanId={scan.id}
                  files={scan.files || []}
                  selection={selection}
                  onSelect={setSelection}
                />
              )}
            </section>
          )}
          {canEdit && <TelegramPanel busy={busy} run={run} />}
        </div>
      </div>
      <BillDrawer name={DRAWERS.BILL_DETAILS} />
    </main>
  );
}

function VendorInvoiceScansPageComponent({
  openDrawer,
}: WithDrawerActionsProps) {
  const organizationId = useAuthOrganizationId();
  return <VendorScanWorkspace key={organizationId} openDrawer={openDrawer} />;
}

export const VendorInvoiceScansPage = withDrawerActions(
  VendorInvoiceScansPageComponent,
);
