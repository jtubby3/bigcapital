import React, { useEffect, useState } from 'react';
import {
  Button,
  Callout,
  Dialog,
  InputGroup,
  Intent,
  Spinner,
  Tag,
  TextArea,
} from '@blueprintjs/core';
import { useHistory, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BatchSummary,
  InvoiceCandidate,
  PackingSlip,
  ScanBatch,
  ScanFile,
  packingSlipError,
  usePackingSlipApi,
  usePackingSlipObjectUrl,
  usePackingSlipPermissions,
  useRefreshPackingSlips,
} from './usePackingSlips';
import { PackingSlipPreview } from './PackingSlipAttachments';
import { parsePageGroups } from './pageGroups';
import styles from './PackingSlips.module.scss';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const pending = (batch?: ScanBatch) =>
  !batch?.cancelled &&
  batch?.files?.some((file) => ['queued', 'processing'].includes(file.status));

export function PackingSlipsPage() {
  const api = usePackingSlipApi();
  const refresh = useRefreshPackingSlips();
  const { canView, canEdit, canRemove } = usePackingSlipPermissions();
  const history = useHistory();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('batch')) || undefined;
  const requestedSlip = Number(params.get('slip')) || undefined;
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const [review, setReview] = useState<PackingSlip>();
  const [regroup, setRegroup] = useState<ScanFile>();
  const [preview, setPreview] = useState<PackingSlip>();
  const health = useQuery<{ available: boolean; message: string }, Error>({
    queryKey: [...api.queryKey, 'health'],
    queryFn: ({ signal }) => api.get('/health', signal),
    enabled: canEdit,
    retry: false,
  });
  const batches = useQuery<BatchSummary[], Error>({
    queryKey: [...api.queryKey, 'batches'],
    queryFn: ({ signal }) => api.get('/batches', signal),
    enabled: canView,
  });
  const batch = useQuery<ScanBatch, Error>({
    queryKey: [...api.queryKey, 'batch', id],
    queryFn: ({ signal }) => api.get(`/batches/${id}`, signal),
    enabled: !!id && canView,
    refetchInterval: (query) => (pending(query.state.data) ? 2000 : false),
    refetchIntervalInBackground: false,
  });
  const current = batch.data;
  const reviewId = review?.id ?? requestedSlip;
  const selectedReview = current?.slips.find((slip) => slip.id === reviewId);
  const selectedFile = current?.files.find((file) => file.id === regroup?.id);
  function closeReview() {
    setReview(undefined);
    if (requestedSlip) {
      params.delete('slip');
      history.replace({
        pathname: location.pathname,
        search: params.toString(),
      });
    }
  }
  function selectBatch(batchId: number) {
    setError('');
    setReview(undefined);
    setRegroup(undefined);
    setPreview(undefined);
    setUploadFailures([]);
    history.replace({
      pathname: location.pathname,
      search: `?batch=${batchId}`,
    });
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (error) {
      setError(packingSlipError(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    setError('');
    setUploadFailures([]);
    if (files.length + (current?.files.length || 0) > 20) {
      setError(
        'A batch can contain at most 20 files. Start a new batch for more files.',
      );
      return;
    }
    const invalid = files.filter(
      (file) =>
        file.size > MAX_FILE_SIZE || !/\.(pdf|png|jpe?g)$/i.test(file.name),
    );
    if (invalid.length) {
      setError(
        `Choose PDF, PNG or JPEG scans up to 25 MiB each. Check: ${invalid.map((file) => file.name).join(', ')}`,
      );
      return;
    }
    setBusy(true);
    try {
      let batchId = id;
      if (!batchId) {
        const created = await api.post<BatchSummary>('/batches');
        batchId = created.id;
        selectBatch(batchId);
      }
      const failed: string[] = [];
      for (const [index, file] of files.entries()) {
        setUploadProgress(
          `Uploading file ${index + 1} of ${files.length} · ${file.name}`,
        );
        try {
          await api.upload(batchId, file);
        } catch (error) {
          failed.push(`${file.name}: ${packingSlipError(error)}`);
        }
      }
      setUploadFailures(failed);
      await refresh();
    } catch (error) {
      setError(packingSlipError(error));
    } finally {
      setBusy(false);
      setUploadProgress('');
    }
  }
  if (!canView)
    return (
      <Callout intent={Intent.WARNING}>
        Viewing scanned packing slips requires invoice and attachment access.
      </Callout>
    );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Packing slips</h1>
          <p>
            Scan, verify and attach original pages to existing customer
            invoices.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              history.push('/invoices/packing-slips');
              setReview(undefined);
              setRegroup(undefined);
              setPreview(undefined);
              setUploadFailures([]);
              setError('');
            }}
            disabled={busy}
          >
            New batch
          </Button>
        )}
      </header>
      <Callout className={styles.notice}>
        Uploading scans matches documents to invoices. Send customer emails
        separately from each invoice.
      </Callout>
      {health.isLoading && <p>Checking local scanner…</p>}
      {(health.isError || health.data?.available === false) && (
        <Callout intent={Intent.WARNING}>
          {health.data?.message ||
            'Local scan service is unavailable. You can still review existing batches.'}
          <Button minimal onClick={() => health.refetch()}>
            Check again
          </Button>
        </Callout>
      )}
      {error && (
        <Callout intent={Intent.DANGER} role="alert">
          {error}
        </Callout>
      )}
      {uploadFailures.length > 0 && (
        <Callout
          intent={Intent.DANGER}
          title="Some uploads failed"
          role="alert"
        >
          <ul>
            {uploadFailures.map((failure, index) => (
              <li key={index}>{failure}</li>
            ))}
          </ul>
          Uploaded files are saved. Choose only the failed files to try again.
        </Callout>
      )}
      <div className={styles.layout}>
        <aside className={styles.history} aria-label="Recent scan batches">
          <h3>Recent batches</h3>
          {batches.isLoading && <Spinner size={20} />}
          {batches.isError && (
            <Callout intent={Intent.DANGER}>
              {packingSlipError(batches.error)}
              <Button minimal onClick={() => batches.refetch()}>
                Retry
              </Button>
            </Callout>
          )}
          {batches.data?.length === 0 && (
            <p>Your scan history will appear here.</p>
          )}
          {batches.data?.map((item) => (
            <Button
              key={item.id}
              active={id === item.id}
              aria-current={id === item.id ? 'page' : undefined}
              disabled={busy}
              fill
              alignText="left"
              onClick={() => selectBatch(item.id)}
            >
              <span>Batch {item.id}</span>
              <small>
                {item.createdAt
                  ? new Date(item.createdAt).toLocaleString()
                  : ''}
                {item.cancelled ? ' · Cancelled' : ''}
              </small>
            </Button>
          ))}
        </aside>
        <section className={styles.content} aria-label="Batch review">
          <div className={styles.upload}>
            <h2>{id ? `Batch ${id}` : 'Start a scan batch'}</h2>
            <p>
              A mixed PDF can contain multiple customers. Review page groups
              before confirming uncertain matches.
            </p>
            {canEdit && (
              <>
                <label htmlFor="packing-slip-files">
                  Choose scans · PDF, PNG or JPEG · 25 MiB each · 200 pages per
                  file · 20 files and 500 pages per batch
                </label>
                <input
                  id="packing-slip-files"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  disabled={
                    busy ||
                    current?.cancelled ||
                    (!!id && !current) ||
                    !health.data?.available ||
                    health.isError
                  }
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files || []);
                    event.currentTarget.value = '';
                    void upload(files);
                  }}
                />
              </>
            )}
            {busy && <div role="status">{uploadProgress || 'Saving…'}</div>}
          </div>
          {batch.isFetching && !current && id && <Spinner size={24} />}
          {batch.isError && (
            <Callout intent={Intent.DANGER}>
              {packingSlipError(batch.error)}{' '}
              <Button minimal onClick={() => batch.refetch()}>
                Retry
              </Button>
            </Callout>
          )}
          {current && (
            <>
              <div className={styles.row}>
                <h2>Files and matches</h2>
                <div className={styles.buttons}>
                  <Button disabled={busy} onClick={() => batch.refetch()}>
                    Refresh
                  </Button>
                  {canEdit && !current.cancelled && pending(current) && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(() => api.post(`/batches/${id}/cancel`))
                      }
                    >
                      Cancel pending scans
                    </Button>
                  )}
                </div>
              </div>
              {!!current.cancelled && (
                <Callout intent={Intent.WARNING}>
                  Batch cancelled. Existing results remain available for review.
                </Callout>
              )}
              {pending(current) && (
                <p role="status">
                  {
                    current.files.filter((file) => file.status === 'ready')
                      .length
                  }{' '}
                  of {current.files.length} files ready. Processing scans
                  locally.
                </p>
              )}
              {requestedSlip && !selectedReview && (
                <Callout intent={Intent.WARNING}>
                  This packing slip is no longer in the batch. Review the
                  current page groups.
                </Callout>
              )}
              {current.files.length === 0 && <p>No files uploaded yet.</p>}
              {current.files.map((file) => (
                <article key={file.id} className={styles.file}>
                  <div className={styles.row}>
                    <div>
                      <h3>{file.name}</h3>
                      <Tag>{file.status}</Tag>
                      {file.pageCount ? (
                        <span> · {file.pageCount} pages</span>
                      ) : null}
                    </div>
                    <div className={styles.buttons}>
                      {canEdit &&
                        ['failed', 'queued', 'processing'].includes(file.status) &&
                        !current.cancelled && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              run(() => api.post(`/files/${file.id}/retry`))
                            }
                          >
                            {file.status === 'failed' ? 'Retry file' : 'Check / resume processing'}
                          </Button>
                        )}
                      {!!file.pageCount &&
                        ['ready', 'cancelled'].includes(file.status) && (
                          <Button
                            disabled={busy}
                            onClick={() => setRegroup(file)}
                          >
                            {canRemove
                              ? 'Review / split pages'
                              : 'View source pages'}
                          </Button>
                        )}
                    </div>
                  </div>
                  {file.error && (
                    <Callout intent={Intent.DANGER}>{file.error}</Callout>
                  )}
                  {current.slips
                    .filter((slip) => slip.fileId === file.id)
                    .map((slip) => (
                      <div className={styles.slip} key={slip.id}>
                        <div>
                          <strong>Pages {slip.pages.join(', ')}</strong>{' '}
                          <Tag
                            intent={
                              slip.status === 'attached'
                                ? Intent.SUCCESS
                                : ['review', 'stale'].includes(slip.status)
                                  ? Intent.WARNING
                                  : Intent.NONE
                            }
                          >
                            {slip.status === 'attached'
                              ? 'Confirmed'
                              : ['review', 'stale'].includes(slip.status)
                                ? 'Needs review'
                                : slip.status}
                          </Tag>
                          <p>
                            {slip.invoiceNo
                              ? `${slip.invoiceNo} · ${slip.customerName || ''}`
                              : 'No confirmed invoice'}
                          </p>
                          <Evidence slip={slip} />
                          {slip.error && (
                            <Callout intent={Intent.WARNING}>
                              {slip.error}
                            </Callout>
                          )}
                        </div>
                        <div className={styles.buttons}>
                          <Button onClick={() => setPreview(slip)}>
                            Preview PDF
                          </Button>
                          <Button
                            intent={Intent.PRIMARY}
                            disabled={busy}
                            onClick={() => setReview(slip)}
                          >
                            Review invoice
                          </Button>
                          {canRemove &&
                            ['attached', 'stale'].includes(slip.status) && (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  run(() =>
                                    api.post(`/slips/${slip.id}/detach`, {
                                      version: slip.version,
                                    }),
                                  )
                                }
                              >
                                Detach
                              </Button>
                            )}
                          {canRemove && slip.status !== 'ignored' && (
                            <Button
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api.post(`/slips/${slip.id}/ignore`, {
                                    version: slip.version,
                                  }),
                                )
                              }
                            >
                              Ignore
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </article>
              ))}
            </>
          )}
        </section>
      </div>
      {selectedReview && (
        <InvoiceReview
          key={selectedReview.id}
          slip={selectedReview}
          canConfirm={canEdit && (!selectedReview.invoiceId || canRemove)}
          onClose={closeReview}
        />
      )}
      {selectedFile && current && (
        <PageGroups
          key={selectedFile.id}
          file={selectedFile}
          slips={current.slips.filter(
            (slip) => slip.fileId === selectedFile.id,
          )}
          canRegroup={canRemove}
          onClose={() => setRegroup(undefined)}
        />
      )}
      {preview && (
        <PackingSlipPreview
          slip={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
    </main>
  );
}

function Evidence({ slip }: { slip: PackingSlip }) {
  const evidence = slip.evidence;
  if (!evidence) return null;
  return (
    <div className={styles.evidence}>
      <div>
        {evidence.manualConfirmation
          ? 'Manually confirmed'
          : evidence.verified
            ? 'Verified'
            : 'Needs verification'}{' '}
        · {evidence.route.replace(/-/g, ' ')}
      </div>
      <ul>
        {evidence.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function SourcePage({ fileId, page }: { fileId: number; page: number }) {
  const { url, error } = usePackingSlipObjectUrl(
    `/files/${fileId}/pages/${page}`,
  );
  return (
    <div className={styles.sourcePage}>
      {error ? (
        <Callout intent={Intent.DANGER}>{error}</Callout>
      ) : url ? (
        <img src={url} alt={`Original scanned page ${page}`} />
      ) : (
        <Spinner size={24} />
      )}
    </div>
  );
}

function InvoiceReview({
  slip,
  canConfirm,
  onClose,
}: {
  slip: PackingSlip;
  canConfirm: boolean;
  onClose: () => void;
}) {
  const api = usePackingSlipApi();
  const refresh = useRefreshPackingSlips();
  const [version] = useState(slip.version);
  const changed = slip.version !== version;
  const [search, setSearch] = useState(slip.invoiceNo || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [invoice, setInvoice] = useState<InvoiceCandidate>();
  const [page, setPage] = useState(slip.pages[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  const candidates = useQuery<InvoiceCandidate[], Error>({
    queryKey: [...api.queryKey, 'candidates', debouncedSearch],
    queryFn: ({ signal }) =>
      api.get(
        `/candidates?search=${encodeURIComponent(debouncedSearch)}`,
        signal,
      ),
    enabled: debouncedSearch.length > 0,
  });
  const searching = search.trim() !== debouncedSearch;
  async function confirm() {
    if (!canConfirm || changed || !invoice?.eligible || searching) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.post<{ status: 'attached' | 'duplicate' }>(
        `/slips/${slip.id}/confirm`,
        {
          invoiceId: invoice.id,
          version,
          invoiceFingerprint: invoice.fingerprint,
        },
      );
      if (result.status === 'duplicate') {
        setError('These pages are already attached as another packing slip.');
        await refresh();
        return;
      }
      await refresh();
      onClose();
    } catch (error) {
      setError(packingSlipError(error));
      await refresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      isOpen
      onClose={saving ? undefined : onClose}
      title={`Verify pages ${slip.pages.join(', ')}`}
      className={styles.reviewDialog}
      canEscapeKeyClose={!saving}
      canOutsideClickClose={!saving}
    >
      <div className={styles.reviewBody}>
        <div>
          <label htmlFor="review-source-page">Original page</label>
          <select
            id="review-source-page"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {slip.pages.map((page) => (
              <option key={page} value={page}>
                Page {page}
              </option>
            ))}
          </select>
          <SourcePage fileId={slip.fileId} page={page} />
        </div>
        <div className={styles.reviewFields}>
          <Evidence slip={slip} />
          {!!slip.evidence?.candidates.length && (
            <div>
              <h4>Possible matches</h4>
              {slip.evidence.candidates.map((candidate) => (
                <div className={styles.candidateHint} key={candidate.invoiceId}>
                  <Button
                    minimal
                    disabled={saving}
                    onClick={() => {
                      setInvoice(undefined);
                      setSearch(candidate.invoiceNo);
                    }}
                  >
                    {candidate.invoiceNo} · {candidate.customerName}
                  </Button>
                  <ul>
                    {candidate.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <label htmlFor="packing-slip-invoice-search">
            Search invoice number or customer
          </label>
          <InputGroup
            id="packing-slip-invoice-search"
            value={search}
            disabled={saving}
            onChange={(event) => {
              setSearch(event.target.value);
              setInvoice(undefined);
            }}
            placeholder="Invoice number or customer"
          />
          {(searching || candidates.isFetching) && <Spinner size={20} />}
          {!searching && candidates.isError && (
            <Callout intent={Intent.DANGER}>
              {packingSlipError(candidates.error)}
              <Button minimal onClick={() => candidates.refetch()}>
                Retry search
              </Button>
            </Callout>
          )}
          {!searching && candidates.data?.length === 0 && debouncedSearch && (
            <p>No matching invoices.</p>
          )}
          <div className={styles.candidates}>
            {!searching &&
              candidates.data?.map((candidate) => (
                <Button
                  key={candidate.id}
                  fill
                  alignText="left"
                  active={invoice?.id === candidate.id}
                  aria-pressed={invoice?.id === candidate.id}
                  disabled={saving}
                  onClick={() => setInvoice(candidate)}
                >
                  {candidate.invoiceNo} · {candidate.customerName}
                  {!candidate.eligible ? ' · Draft' : ''}
                </Button>
              ))}
          </div>
          {invoice && (
            <div className={styles.invoiceFacts}>
              <strong>
                {invoice.invoiceNo} · {invoice.customerName}
              </strong>
              <dl>
                <dt>Invoice date</dt>
                <dd>{invoice.invoiceDate || '—'}</dd>
                <dt>Ship date</dt>
                <dd>{invoice.shippingDate || '—'}</dd>
                <dt>Ship to</dt>
                <dd>{invoice.shippingAddress || '—'}</dd>
                <dt>Reference</dt>
                <dd>{invoice.referenceNo || '—'}</dd>
                <dt>Tracking</dt>
                <dd>{invoice.trackingNo || '—'}</dd>
              </dl>
              <ul>
                {invoice.entries.map((entry, index) => (
                  <li key={index}>
                    {entry.code} {entry.name || entry.description} ·{' '}
                    {entry.quantity} {entry.unit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Callout intent={Intent.WARNING}>
            Compare the customer, reference and items against the original
            pages. Conflicting evidence requires correction before attachment.
          </Callout>
          {!canConfirm && !!slip.invoiceId && (
            <Callout intent={Intent.WARNING}>
              Replacing this invoice attachment requires permission to edit the
              invoice and remove attachments.
            </Callout>
          )}
          {changed && (
            <Callout intent={Intent.WARNING}>
              This slip changed during review. Close and reopen it to check the
              latest version.
            </Callout>
          )}
          {error && (
            <Callout intent={Intent.DANGER} role="alert">
              {error}
            </Callout>
          )}
          <div className={styles.buttons}>
            <Button disabled={saving} onClick={onClose}>
              Close
            </Button>
            {canConfirm && (
              <Button
                intent={Intent.PRIMARY}
                disabled={!invoice?.eligible || changed || searching}
                loading={saving}
                onClick={confirm}
              >
                Confirm invoice attachment
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function PageGroups({
  file,
  slips,
  canRegroup,
  onClose,
}: {
  file: ScanFile;
  slips: PackingSlip[];
  canRegroup: boolean;
  onClose: () => void;
}) {
  const api = usePackingSlipApi();
  const refresh = useRefreshPackingSlips();
  const [value, setValue] = useState(
    slips.map((slip) => slip.pages.join(', ')).join('\n'),
  );
  const [versions] = useState(() =>
    slips.map(({ id, version }) => ({ id, version })),
  );
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pageCount = file.pageCount || 0;
  const changed =
    versions.length !== slips.length ||
    versions.some(
      ({ id, version }, index) =>
        id !== slips[index].id || version !== slips[index].version,
    );
  let validation = '';
  try {
    parsePageGroups(value, pageCount);
  } catch (error) {
    validation = packingSlipError(error);
  }
  async function save() {
    if (!canRegroup || changed) return;
    setError('');
    let groups: number[][];
    try {
      groups = parsePageGroups(value, pageCount);
    } catch (error) {
      setError(packingSlipError(error));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/files/${file.id}/regroup`, { groups, versions });
      await refresh();
      onClose();
    } catch (error) {
      setError(packingSlipError(error));
      await refresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      isOpen
      title={`Review all pages · ${file.name}`}
      onClose={saving ? undefined : onClose}
      className={styles.reviewDialog}
      canEscapeKeyClose={!saving}
      canOutsideClickClose={!saving}
    >
      <div className={styles.reviewBody}>
        <div>
          <label htmlFor="group-source-page">Original page</label>
          <select
            id="group-source-page"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index} value={index + 1}>
                Page {index + 1}
              </option>
            ))}
          </select>
          <SourcePage fileId={file.id} page={page} />
        </div>
        <div className={styles.reviewFields}>
          {canRegroup && (
            <>
              <h3>One packing slip per line</h3>
              <p>
                Separate page numbers with commas. Assign every original page
                exactly once. Keep different customers in separate groups.
              </p>
              <label htmlFor="packing-slip-page-groups">
                Page groups (all {pageCount} pages)
              </label>
              <TextArea
                id="packing-slip-page-groups"
                fill
                rows={10}
                value={value}
                disabled={saving}
                onChange={(event) => setValue(event.target.value)}
                placeholder={'1, 2\n3\n4, 5'}
                aria-describedby="packing-slip-group-validation"
              />
              <p id="packing-slip-group-validation" role="status">
                {validation || 'Every page is assigned exactly once.'}
              </p>
              <Callout intent={Intent.WARNING}>
                Saving replaces every slip in this file and removes its previous
                invoice attachments. Review the new matches afterward. Include
                unwanted pages in their own group, then ignore that slip.
              </Callout>
              {changed && (
                <Callout intent={Intent.WARNING}>
                  The groups changed during review. Close and reopen to check
                  the latest groups.
                </Callout>
              )}
            </>
          )}
          {error && (
            <Callout intent={Intent.DANGER} role="alert">
              {error}
            </Callout>
          )}
          <div className={styles.buttons}>
            <Button disabled={saving} onClick={onClose}>
              Close
            </Button>
            {canRegroup && (
              <Button
                intent={Intent.PRIMARY}
                loading={saving}
                disabled={!!validation || changed}
                onClick={save}
              >
                Replace groups and review matches
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
