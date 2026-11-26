import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  FormGroup,
  HTMLSelect,
  InputGroup,
  Spinner,
} from '@blueprintjs/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styles from './CustomerStatements.module.scss';
import {
  customerStatementReturnTo,
  sendUnsentStatements,
  statementDates,
  statementPeriod,
  statementRecipients,
  statementTotals,
  validateStatementForm,
} from './statementForm';
import {
  SavedStatement,
  StatementDraft,
  useSaveStatements,
  useSendStatement,
  useStatementPdf,
  useStatementPreview,
  useStatementRecipients,
} from './useCustomerStatements';
import type { LocationDescriptorObject } from 'history';
import { AbilitySubject, CustomerAction } from '@/constants/abilityOption';
import { useAuthOrganizationId, useAuthUserId } from '@/hooks/state';
import { useAbilityContext } from '@/hooks/utils';

const amount = (value: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(value);
const typeDescriptions = {
  'balance-forward':
    'Shows the opening balance and charges, payments, and credits during the selected period.',
  'open-item':
    'Shows invoices with an outstanding balance as of the statement date.',
  transaction:
    'Shows invoices and sales receipts dated in the selected period, with the amounts received against them.',
};
type ReturnState = {
  customerReturnTo?: LocationDescriptorObject;
  statementReturnTo?: LocationDescriptorObject;
};
type SavedBatch = { key: string; statements: SavedStatement[] };

export function CreateCustomerStatements() {
  const location = useLocation<ReturnState>();
  const organization = useAuthOrganizationId();
  const user = useAuthUserId();
  const ids =
    new URLSearchParams(location.search).get('customerIds') || undefined;
  return (
    <StatementForm
      key={`${organization}:${user}:${ids || 'all'}`}
      customerIds={ids}
    />
  );
}

function StatementForm({ customerIds }: { customerIds?: string }) {
  const history = useHistory();
  const location = useLocation<ReturnState>();
  const ability = useAbilityContext();
  const canSave = ability.can(CustomerAction.Edit, AbilitySubject.Customer);
  const recipientsQuery = useStatementRecipients(customerIds);
  const recipients = recipientsQuery.data || [];
  const initialized = useRef(false);
  const mounted = useRef(true);
  const operationLock = useRef(false);
  const [dates, setDates] = useState(statementDates);
  const [statementType, setStatementType] =
    useState<StatementDraft['statementType']>('balance-forward');
  const [includePaymentLinks, setIncludePaymentLinks] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedBatch, setSavedBatch] = useState<SavedBatch>();
  const [pdf, setPdf] = useState<{ url: string; filename: string }>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (recipientsQuery.data && !initialized.current) {
      initialized.current = true;
      setSelected(recipientsQuery.data.map((customer) => customer.id));
      setEmails(
        Object.fromEntries(
          recipientsQuery.data.map((customer) => [
            customer.id,
            customer.email || '',
          ]),
        ),
      );
    }
  }, [recipientsQuery.data]);
  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    },
    [pdf],
  );

  const draft = useMemo<StatementDraft>(
    () => ({
      ...statementPeriod(statementType, dates),
      statementType,
      includePaymentLinks,
      recipients: statementRecipients(selected, emails),
    }),
    [dates, statementType, includePaymentLinks, selected, emails],
  );
  const fingerprint = JSON.stringify(draft);
  useEffect(() => {
    setSavedBatch(undefined);
    setSuccess('');
    setError('');
  }, [fingerprint]);
  const validation = validateStatementForm(draft);
  const preview = useStatementPreview(validation ? undefined : draft);
  const save = useSaveStatements();
  const send = useSendStatement();
  const pdfMutation = useStatementPdf();
  const currentBatch = savedBatch?.key === fingerprint ? savedBatch : undefined;
  const snapshots =
    currentBatch?.statements.map((statement) => statement.snapshot) ||
    preview.data ||
    [];
  const totals = statementTotals(snapshots);
  const loadingPreview = !currentBatch && preview.isFetching;
  const previewError = !currentBatch && preview.isError;
  const hasUnsent = currentBatch?.statements.some(
    (statement) => statement.status !== 'sent',
  );
  const canAct =
    !busy &&
    !validation &&
    !recipientsQuery.isError &&
    !recipientsQuery.isLoading &&
    !loadingPreview &&
    !previewError &&
    !!snapshots.length;
  const close = () =>
    history.push(
      customerStatementReturnTo(location.state?.statementReturnTo) ||
        customerStatementReturnTo(location.state?.customerReturnTo) ||
        '/customers',
    );

  const act = async (action: 'preview' | 'save' | 'send' | 'close') => {
    if (operationLock.current) return;
    const problem = validateStatementForm(draft, action === 'send');
    if (problem) {
      setError(problem);
      return;
    }
    if (action !== 'preview' && !canSave) {
      setError(
        'You do not have permission to save or send customer statements.',
      );
      return;
    }
    operationLock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (action === 'preview') {
        const file = await pdfMutation.mutateAsync(
          currentBatch
            ? { ids: currentBatch.statements.map((statement) => statement.id) }
            : { draft },
        );
        if (mounted.current) setPdf(file);
        else URL.revokeObjectURL(file.url);
        return;
      }
      const statements =
        currentBatch?.statements || (await save.mutateAsync(draft));
      let batch = { key: fingerprint, statements };
      if (mounted.current) setSavedBatch(batch);
      if (action === 'send') {
        const result = await sendUnsentStatements(statements, (id) =>
          send.mutateAsync(id),
        );
        batch = { ...batch, statements: result.statements };
        if (!mounted.current) return;
        setSavedBatch(batch);
        if (result.failedIds.length) {
          setError(
            `${result.failedIds.length} statement${result.failedIds.length === 1 ? '' : 's'} saved but could not be sent. Select Retry unsent to try again. Successfully sent statements will not be sent again.`,
          );
          return;
        }
      }
      if (!mounted.current) return;
      if (action === 'close') close();
      else
        setSuccess(
          `${statements.length} statement${statements.length === 1 ? '' : 's'} ${action === 'send' ? 'saved and sent' : 'saved'}.`,
        );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to complete this action. Please try again.',
        );
    } finally {
      operationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const toggle = (id: number, checked: boolean) =>
    setSelected((ids) =>
      checked ? [...ids, id] : ids.filter((value) => value !== id),
    );
  const allSelected =
    recipients.length > 0 && selected.length === recipients.length;

  return (
    <div className={`${styles.page} bp4-dark`}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CUSTOMERS</span>
          <h1>Create statements</h1>
        </div>
        <Button
          icon="cross"
          minimal
          aria-label="Close statements"
          onClick={close}
          disabled={busy}
        />
      </header>
      <main className={styles.main}>
        <section className={styles.summary} aria-label="Statement settings">
          <fieldset disabled={busy} className={styles.settings}>
            <FormGroup label="Statement date" labelFor="statement-date">
              <InputGroup
                id="statement-date"
                type="date"
                value={dates.statementDate}
                onChange={(event) =>
                  setDates({ ...dates, statementDate: event.target.value })
                }
              />
            </FormGroup>
            <FormGroup label="Statement type" labelFor="statement-type">
              <HTMLSelect
                id="statement-type"
                fill
                value={statementType}
                onChange={(event) =>
                  setStatementType(
                    event.target.value as StatementDraft['statementType'],
                  )
                }
                options={[
                  { value: 'balance-forward', label: 'Balance Forward' },
                  { value: 'open-item', label: 'Open Item' },
                  { value: 'transaction', label: 'Transaction Statement' },
                ]}
              />
            </FormGroup>
            <p className={styles.description}>
              {typeDescriptions[statementType]}
            </p>
            <div className={styles.paymentLinks}>
              <Checkbox
                checked={includePaymentLinks}
                onChange={(event) =>
                  setIncludePaymentLinks(event.currentTarget.checked)
                }
                label="Payment button and links on PDF"
              />
              <p>Includes existing invoice payment links where available.</p>
            </div>
          </fieldset>
          <div className={styles.total} aria-live="polite">
            <span>
              {statementType === 'transaction'
                ? 'Net activity'
                : 'Total balance'}
            </span>
            {loadingPreview ? (
              <Spinner size={24} />
            ) : totals.length ? (
              totals.map((total) => (
                <strong key={total.currencyCode}>
                  {amount(total.amount, total.currencyCode)}{' '}
                  <small>{total.currencyCode}</small>
                </strong>
              ))
            ) : (
              <strong>—</strong>
            )}
            <p>
              {selected.length} customer{selected.length === 1 ? '' : 's'}{' '}
              selected
            </p>
          </div>
        </section>
        {statementType !== 'open-item' && (
          <fieldset className={styles.period} disabled={busy}>
            <FormGroup label="Start date" labelFor="statement-start">
              <InputGroup
                id="statement-start"
                type="date"
                value={dates.fromDate}
                max={dates.toDate || undefined}
                onChange={(event) =>
                  setDates({ ...dates, fromDate: event.target.value })
                }
              />
            </FormGroup>
            <FormGroup label="End date" labelFor="statement-end">
              <InputGroup
                id="statement-end"
                type="date"
                value={dates.toDate}
                min={dates.fromDate || undefined}
                onChange={(event) =>
                  setDates({ ...dates, toDate: event.target.value })
                }
              />
            </FormGroup>
            <p>Balances reflect transactions through the end date.</p>
          </fieldset>
        )}
        <div className={styles.messages} aria-live="polite">
          {error && (
            <Callout intent="danger" role="alert">
              {error}
            </Callout>
          )}
          {success && (
            <Callout intent="success" role="status">
              {success}
            </Callout>
          )}
          {!canSave && (
            <Callout intent="warning">
              You can preview statements. Customer edit permission is required
              to save or send.
            </Callout>
          )}
          {validation && initialized.current && (
            <Callout intent="warning">{validation}</Callout>
          )}
          {previewError && (
            <Callout intent="danger">
              Unable to calculate statement balances.{' '}
              <Button small onClick={() => preview.refetch()}>
                Try again
              </Button>
            </Callout>
          )}
        </div>
        <section
          className={styles.recipients}
          aria-label="Statement recipients"
        >
          <div className={styles.sectionHeading}>
            <h2>Recipients</h2>
            <span>
              {selected.length} of {recipients.length} selected
            </span>
          </div>
          {recipientsQuery.isLoading ? (
            <div className={styles.empty}>
              <Spinner size={28} />
              <p>Loading customers…</p>
            </div>
          ) : recipientsQuery.isError ? (
            <Callout intent="danger">
              Unable to load customers.{' '}
              <Button small onClick={() => recipientsQuery.refetch()}>
                Try again
              </Button>
            </Callout>
          ) : !recipients.length ? (
            <div className={styles.empty}>
              <h3>No customers available</h3>
              <p>Add an active customer to create a statement.</p>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}>
                      <Checkbox
                        aria-label="Select all customers"
                        checked={allSelected}
                        indeterminate={selected.length > 0 && !allSelected}
                        disabled={busy}
                        onChange={(event) =>
                          setSelected(
                            event.currentTarget.checked
                              ? recipients.map((customer) => customer.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>Customer</th>
                    <th>Email address</th>
                    <th className={styles.balance}>
                      {statementType === 'transaction'
                        ? 'Net activity'
                        : 'Statement balance'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((customer) => {
                    const checked = selected.includes(customer.id);
                    const snapshot = snapshots.find(
                      (value) => value.customerId === customer.id,
                    );
                    const invalidEmail =
                      checked &&
                      !!emails[customer.id]?.trim() &&
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                        emails[customer.id].trim(),
                      );
                    return (
                      <tr
                        key={customer.id}
                        className={checked ? styles.selected : undefined}
                      >
                        <td className={styles.checkCell}>
                          <Checkbox
                            aria-label={`Select ${customer.displayName}`}
                            checked={checked}
                            disabled={busy}
                            onChange={(event) =>
                              toggle(customer.id, event.currentTarget.checked)
                            }
                          />
                        </td>
                        <td>
                          <span className={styles.customerName}>
                            {customer.displayName}
                          </span>
                          <small>{customer.currencyCode}</small>
                        </td>
                        <td>
                          <InputGroup
                            type="email"
                            aria-label={`Statement email for ${customer.displayName}`}
                            aria-invalid={invalidEmail || undefined}
                            placeholder="Enter email address"
                            value={emails[customer.id] || ''}
                            disabled={busy}
                            intent={invalidEmail ? 'danger' : 'none'}
                            onChange={(event) =>
                              setEmails((values) => ({
                                ...values,
                                [customer.id]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className={styles.balance}>
                          {checked &&
                          snapshot &&
                          !loadingPreview &&
                          !previewError
                            ? amount(
                                snapshot.closingBalance,
                                snapshot.currencyCode,
                              )
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.note}>
            Email edits apply to these statements only. Save keeps a copy
            without sending an email.
          </p>
        </section>
      </main>
      <footer className={styles.footer}>
        <Button outlined onClick={close} disabled={busy}>
          Cancel
        </Button>
        <div className={styles.footerActions}>
          <Button
            outlined
            icon="print"
            disabled={!canAct}
            onClick={() => act('preview')}
          >
            Print or Preview
          </Button>
          {canSave && (
            <>
              <Button outlined disabled={!canAct} onClick={() => act('save')}>
                Save
              </Button>
              <Button outlined disabled={!canAct} onClick={() => act('close')}>
                Save and close
              </Button>
              <Button
                intent="primary"
                disabled={!canAct}
                loading={busy}
                onClick={() => act('send')}
              >
                {hasUnsent ? 'Retry unsent' : 'Save and send'}
              </Button>
            </>
          )}
        </div>
      </footer>
      <Dialog
        isOpen={!!pdf}
        onClose={() => setPdf(undefined)}
        title="Statement preview"
        className={styles.pdfDialog}
      >
        {pdf && (
          <>
            <div className={styles.pdfActions}>
              <a href={pdf.url} target="_blank" rel="noreferrer">
                Open PDF to print
              </a>
              <a href={pdf.url} download={pdf.filename}>
                Download PDF
              </a>
            </div>
            <iframe
              title="Customer statements PDF preview"
              src={pdf.url}
              className={styles.pdfFrame}
            />
            <p className={styles.pdfHint}>
              If your browser cannot display the preview, open or download the
              PDF above.
            </p>
          </>
        )}
      </Dialog>
    </div>
  );
}
