import {
  Button,
  Callout,
  Drawer,
  Spinner,
  Tab,
  Tabs,
  InputGroup,
  Menu,
  MenuItem,
  Popover,
} from '@blueprintjs/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams, Link, useHistory, useLocation } from 'react-router-dom';
import { CustomerFormFormik } from '../CustomerForm/CustomerFormFormik';
import { CustomerFormProvider } from '../CustomerForm/CustomerFormProvider';
import { CustomerStatementHistory } from '../CustomerStatements/CustomerStatementHistory';
import {
  readCustomerFilters,
  saveCustomerFilters,
} from './customerFilterStorage';
import { CustomerInvoiceQuickView } from './CustomerInvoiceQuickView';
import styles from './CustomerWorkspace.module.scss';
import {
  TransactionMultiFilter,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from './TransactionMultiFilter';
import {
  CustomerProfile,
  Workspace,
  Transaction,
  money,
  useWorkspaceQuery,
} from './useCustomerWorkspace';
import { Can, DashboardInsider } from '@/components';
import {
  CustomerAction,
  AbilitySubject,
  SaleInvoiceAction,
  SaleEstimateAction,
  PaymentReceiveAction,
  ReportsAction,
} from '@/constants/abilityOption';
import { DialogsName } from '@/constants/dialogs';
import { AttachmentFile } from '@/containers/Attachments/UploadAttachmentsPopoverContent';
import { index as InvoicePdfPreviewDialog } from '@/containers/Dialogs/InvoicePdfPreviewDialog';
import { useCustomer } from '@/hooks/query';
import { useGetPresignedUrlAttachment } from '@/hooks/query/attachments';
import { useAuthOrganizationId, useAuthUserId } from '@/hooks/state';
import { useAbilityContext } from '@/hooks/utils';

function AttachmentList({ customerId }: { customerId: number }) {
  const query = useWorkspaceQuery<AttachmentFile[]>(
    `${customerId}/attachments`,
  );
  const { mutateAsync: openFile } = useGetPresignedUrlAttachment();
  const [error, setError] = useState(false);
  return (
    <div className={styles.detailsPanel}>
      {query.isLoading ? (
        <Spinner size={22} />
      ) : query.isError ? (
        <Callout intent="warning">
          Unable to load attachments.{' '}
          <Button onClick={() => query.refetch()}>Try again</Button>
        </Callout>
      ) : query.data?.length ? (
        query.data.map((file) => (
          <div className={styles.file} key={file.key}>
            <span>{file.originName}</span>
            <Button
              small
              onClick={async () => {
                setError(false);
                try {
                  const result = await openFile(file.key);
                  window.open(
                    result.presignedUrl,
                    '_blank',
                    'noopener,noreferrer',
                  );
                } catch {
                  setError(true);
                }
              }}
            >
              View file
            </Button>
          </div>
        ))
      ) : (
        <div className={styles.empty}>
          <h3>No attachments yet</h3>
          <p>Open Edit customer to attach documents and images.</p>
        </div>
      )}
      {error && (
        <Callout intent="warning">
          The file could not be opened. Please try again.
        </Callout>
      )}
    </div>
  );
}
function address(customer: any, kind: string) {
  return (
    [
      customer?.[`${kind}Address1`],
      customer?.[`${kind}Address2`],
      [
        customer?.[`${kind}AddressCity`],
        customer?.[`${kind}AddressState`],
        customer?.[`${kind}AddressPostcode`],
      ]
        .filter(Boolean)
        .join(', '),
      customer?.[`${kind}AddressCountry`],
    ]
      .filter(Boolean)
      .join('\n') || 'No address added'
  );
}
type CustomerWorkspaceState = {
  filter: {
    type: string[];
    status: string[];
    from: string;
    to: string;
    search: string;
  };
  page: number;
  tab: string;
};
const defaultTransactionFilter = () => ({
  type: [...TRANSACTION_TYPES],
  status: [...TRANSACTION_STATUSES],
  from: '',
  to: '',
  search: '',
});
const selectionQuery = (values: string[], options: string[]) =>
  values.length === options.length
    ? ''
    : values.length
      ? values.join(',')
      : '[]';

export function CustomerWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const organizationId = useAuthOrganizationId();
  const userId = useAuthUserId();
  const storageKey =
    organizationId && userId
      ? `bigcapital:customer-transaction-filters:v2:${encodeURIComponent(organizationId)}:${encodeURIComponent(String(userId))}`
      : undefined;
  return (
    <CustomerWorkspaceContent
      key={`${organizationId}:${userId}:${id}`}
      storageKey={storageKey}
      legacyStorageKey={
        storageKey ? `${storageKey.replace(':v2:', ':v1:')}:${id}` : undefined
      }
    />
  );
}

function CustomerWorkspaceContent({
  storageKey,
  legacyStorageKey,
}: {
  storageKey?: string;
  legacyStorageKey?: string;
}) {
  const location = useLocation<{
    customerWorkspace?: CustomerWorkspaceState;
  }>();
  const savedWorkspace = location.state?.customerWorkspace;
  const { id } = useParams<{ id: string }>(),
    customerId = Number(id);
  const history = useHistory(),
    queryClient = useQueryClient(),
    ability = useAbilityContext();
  const customerQuery = useCustomer(customerId);
  const customer = customerQuery.data as
    | (NonNullable<typeof customerQuery.data> & {
        customerProfile?: CustomerProfile;
        customerType?: string;
        code?: string;
      })
    | undefined;
  const profile = customer?.customerProfile || {};
  const [tab, setTab] = useState(savedWorkspace?.tab || 'transactions'),
    [editing, setEditing] = useState(false);
  const [quickInvoiceId, setQuickInvoiceId] = useState<number | null>(null);
  const [filter, setFilter] = useState(
      () =>
        readCustomerFilters(storageKey, legacyStorageKey) ||
        savedWorkspace?.filter ||
        defaultTransactionFilter(),
    ),
    [page, setPage] = useState(() =>
      savedWorkspace &&
      JSON.stringify(savedWorkspace.filter) === JSON.stringify(filter)
        ? savedWorkspace.page
        : 1,
    );
  useEffect(() => {
    saveCustomerFilters(storageKey, filter);
  }, [storageKey, filter]);
  const query = useWorkspaceQuery<Workspace>(
    `${customerId}?${new URLSearchParams({ ...filter, type: selectionQuery(filter.type, TRANSACTION_TYPES), status: selectionQuery(filter.status, TRANSACTION_STATUSES), page: String(page) })}`,
  );
  const hasFilters =
    filter.type.length !== TRANSACTION_TYPES.length ||
    filter.status.length !== TRANSACTION_STATUSES.length ||
    Boolean(filter.from || filter.to || filter.search);
  const update = <K extends keyof typeof filter>(
    key: K,
    value: (typeof filter)[K],
  ) => {
    setFilter((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };
  const rememberWorkspace = () => {
    const returnTo = {
      pathname: location.pathname,
      search: location.search,
      state: { ...location.state, customerWorkspace: { filter, page, tab } },
    };
    history.replace(returnTo);
    return returnTo;
  };
  const viewTransaction = (row: Transaction) => {
    const paths: Record<string, string> = {
      Invoice: 'invoices',
      Estimate: 'estimates',
      Payment: 'payments-received',
      'Credit memo': 'credit-notes',
      'Sales receipt': 'receipts',
    };
    history.push(`/${paths[row.type]}/${row.id}/edit`, {
      customerReturnTo: rememberWorkspace(),
    });
  };
  const canViewStatements = ability.can(
    ReportsAction.READ_CUSTOMERS_TRANSACTIONS,
    AbilitySubject.Report,
  );
  const createStatement = () =>
    history.push(`/customers/statements/new?customerIds=${customerId}`, {
      statementReturnTo: rememberWorkspace(),
    });
  if (customerQuery.isLoading) return <DashboardInsider loading />;
  if (customerQuery.isError || !customer)
    return (
      <DashboardInsider>
        <Callout intent="warning">
          This customer could not be loaded.{' '}
          <Button onClick={() => customerQuery.refetch()}>Try again</Button>
          <Link to="/customers">Back to customers</Link>
        </Callout>
      </DashboardInsider>
    );
  const editButton = (
    <Can I={CustomerAction.Edit} a={AbilitySubject.Customer}>
      <Button icon="edit" onClick={() => setEditing(true)}>
        Edit customer
      </Button>
    </Can>
  );
  return (
    <DashboardInsider name="customer-workspace">
      <div className={styles.workspace}>
        <div className={styles.pageHeading}>
          <Link to="/customers">‹ Customers</Link>
          <div>
            {editButton}
            <Popover
              minimal
              position="bottom-right"
              content={
                <Menu>
                  {canViewStatements && (
                    <MenuItem text="Statement" onClick={createStatement} />
                  )}
                  <Can I={SaleInvoiceAction.Create} a={AbilitySubject.Invoice}>
                    <MenuItem
                      text="Invoice"
                      onClick={() =>
                        history.push('/invoices/new', {
                          customerId,
                          customerReturnTo: rememberWorkspace(),
                        })
                      }
                    />
                  </Can>
                  <Can
                    I={SaleEstimateAction.Create}
                    a={AbilitySubject.Estimate}
                  >
                    <MenuItem
                      text="Estimate"
                      onClick={() =>
                        history.push('/estimates/new', {
                          customerId,
                          customerReturnTo: rememberWorkspace(),
                        })
                      }
                    />
                  </Can>
                  <Can
                    I={PaymentReceiveAction.Create}
                    a={AbilitySubject.PaymentReceive}
                  >
                    <MenuItem
                      text="Receive payment"
                      onClick={() =>
                        history.push('/payment-received/new', {
                          customerId,
                          customerReturnTo: rememberWorkspace(),
                        })
                      }
                    />
                  </Can>
                </Menu>
              }
            >
              <Button intent="primary" rightIcon="chevron-down">
                New transaction
              </Button>
            </Popover>
          </div>
        </div>
        <section className={styles.profileCard}>
          <div className={styles.identity}>
            <div className={styles.avatar}>
              {customer.displayName
                ?.split(/\s+/)
                .slice(0, 2)
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </div>
            <h1>{customer.displayName}</h1>
            <p>
              {customer.companyName ||
                (customer.customerType === 'business'
                  ? 'Business customer'
                  : 'Individual customer')}
            </p>
            <div className={styles.tags}>
              {profile.categories?.map((c) => <span key={c}>{c}</span>)}
              {!customer.active && <span>Inactive</span>}
            </div>
            <div className={styles.contactActions}>
              {customer.email && (
                <a href={`mailto:${customer.email}`}>
                  <Button small minimal icon="envelope">
                    Email
                  </Button>
                </a>
              )}
              {(customer.workPhone || customer.personalPhone) && (
                <a href={`tel:${customer.workPhone || customer.personalPhone}`}>
                  <Button small minimal icon="phone">
                    Call
                  </Button>
                </a>
              )}
            </div>
          </div>
          <div className={styles.contactGrid}>
            <div>
              <label>Email</label>
              {customer.email ? (
                <a href={`mailto:${customer.email}`}>{customer.email}</a>
              ) : (
                '—'
              )}
            </div>
            <div>
              <label>Phone</label>
              {customer.workPhone || '—'}
              {customer.personalPhone && (
                <small>Mobile: {customer.personalPhone}</small>
              )}
            </div>
            <div>
              <label>Billing address</label>
              <p>{address(customer, 'billing')}</p>
            </div>
            <div>
              <label>Shipping address</label>
              <p>
                {address(
                  customer,
                  profile.shippingSameAsBilling ? 'billing' : 'shipping',
                )}
              </p>
            </div>
            <div>
              <label>Notes</label>
              <p>{customer.note || 'No notes added'}</p>
            </div>
            <div>
              <label>Payment terms</label>
              {profile.paymentTermsDays === undefined
                ? 'Not set'
                : profile.paymentTermsDays === 0
                  ? 'Due on receipt'
                  : `Net ${profile.paymentTermsDays}`}
              {profile.paymentMethod && <small>{profile.paymentMethod}</small>}
            </div>
          </div>
          <aside className={styles.financial}>
            <span>Financial summary</span>
            <label>Open balance</label>
            <strong>
              {money(Number(customer.balance) || 0, customer.currencyCode)}
            </strong>
            <label>Overdue invoices</label>
            <strong className={styles.overdue}>
              {money(
                query.data?.summary
                  .find((m) => m.key === 'overdue')
                  ?.amounts.find((a) => a.currency === customer.currencyCode)
                  ?.amount || 0,
                customer.currencyCode,
              )}
            </strong>
            <small>
              {customer.currencyCode} ·{' '}
              {customer.customerType === 'business' ? 'Business' : 'Individual'}
            </small>
          </aside>
        </section>
        <div className={styles.tabs}>
          <Tabs
            selectedTabId={tab}
            onChange={(value) => setTab(String(value))}
            renderActiveTabPanelOnly
          >
            <Tab id="transactions" title="Transaction list" />
            <Tab id="details" title="Customer details" />
            <Tab id="notes" title="Notes" />
            {canViewStatements && <Tab id="statements" title="Statements" />}
            {ability.can('View', AbilitySubject.Attachment) && (
              <Tab
                id="attachments"
                title={`Documents & attachments (${profile.attachmentKeys?.length || 0})`}
              />
            )}
          </Tabs>
        </div>
        {tab === 'transactions' && (
          <section className={styles.transactionPanel}>
            <div className={styles.filters}>
              <TransactionMultiFilter
                label="Type"
                allLabel="All types"
                plural="types"
                options={TRANSACTION_TYPES}
                value={filter.type}
                onChange={(value) => update('type', value)}
              />
              <TransactionMultiFilter
                label="Status"
                allLabel="All statuses"
                plural="statuses"
                options={TRANSACTION_STATUSES}
                value={filter.status}
                onChange={(value) => update('status', value)}
              />
              <label>
                From
                <input
                  aria-label="From date"
                  type="date"
                  value={filter.from}
                  onChange={(e) => update('from', e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  aria-label="To date"
                  type="date"
                  value={filter.to}
                  onChange={(e) => update('to', e.target.value)}
                />
              </label>
              <label className={styles.search}>
                Search
                <InputGroup
                  leftIcon="search"
                  placeholder="Number or memo…"
                  value={filter.search}
                  onChange={(e) => update('search', e.target.value)}
                />
              </label>
              {hasFilters && (
                <Button
                  minimal
                  onClick={() => {
                    setFilter(defaultTransactionFilter());
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            {query.isError ? (
              <Callout intent="warning">
                Transactions could not be loaded.{' '}
                <Button onClick={() => query.refetch()}>Try again</Button>
              </Callout>
            ) : query.isLoading ? (
              <Spinner size={24} />
            ) : (
              <>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          'Date',
                          'Type',
                          'No.',
                          'Memo',
                          'Amount',
                          'Open balance',
                          'Status',
                          'Action',
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {query.data?.rows.map((row) => (
                        <tr key={`${row.type}-${row.id}`}>
                          <td>{row.date}</td>
                          <td>{row.type}</td>
                          <td>
                            <button
                              className={styles.textButton}
                              onClick={() =>
                                row.type === 'Invoice'
                                  ? setQuickInvoiceId(row.id)
                                  : viewTransaction(row)
                              }
                            >
                              {row.number || '—'}
                            </button>
                          </td>
                          <td>{row.memo || '—'}</td>
                          <td>{money(row.amount, row.currency)}</td>
                          <td>{money(row.openBalance, row.currency)}</td>
                          <td>
                            <span
                              className={styles.status}
                              data-status={row.status}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td>
                            <Button
                              small
                              minimal
                              onClick={() => viewTransaction(row)}
                            >
                              View / Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!query.data?.rows.length && (
                  <div className={styles.empty}>
                    <h3>
                      {hasFilters
                        ? 'No matching transactions'
                        : 'No transactions yet'}
                    </h3>
                    <p>
                      {hasFilters
                        ? 'Adjust the filters to see more results.'
                        : 'Invoices, payments, credits, estimates, and receipts will appear here.'}
                    </p>
                  </div>
                )}
                <div className={styles.pagination}>
                  <span>{query.data?.total || 0} transactions</span>
                  <div>
                    <Button
                      small
                      disabled={page === 1 || query.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {page} of{' '}
                      {Math.max(1, Math.ceil((query.data?.total || 0) / 25))}
                    </span>
                    <Button
                      small
                      disabled={
                        page * 25 >= (query.data?.total || 0) ||
                        query.isFetching
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
        {tab === 'details' && (
          <section className={styles.detailsPanel}>
            <div className={styles.sectionHeading}>
              <h2>Customer details</h2>
              {editButton}
            </div>
            <div className={styles.detailGrid}>
              <div>
                <label>Customer code</label>
                {customer.code || '—'}
              </div>
              <div>
                <label>Contact name</label>
                {[customer.salutation, customer.firstName, customer.lastName]
                  .filter(Boolean)
                  .join(' ') || '—'}
              </div>
              <div>
                <label>Website</label>
                {customer.website || '—'}
              </div>
              <div>
                <label>Opening balance</label>
                {money(
                  Number(customer.openingBalance) || 0,
                  customer.currencyCode,
                )}
              </div>
              {profile.customFields?.map((f, i) => (
                <div key={i}>
                  <label>{f.label}</label>
                  {f.value || '—'}
                </div>
              ))}
            </div>
            <h2>Saved addresses</h2>
            {profile.addresses?.length ? (
              <div className={styles.addresses}>
                {profile.addresses.map((a, i) => (
                  <div key={i}>
                    <h3>{a.label}</h3>
                    <p>{a.address}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                No additional addresses. Add delivery locations in Edit
                customer.
              </p>
            )}
          </section>
        )}
        {tab === 'statements' && canViewStatements && (
          <CustomerStatementHistory
            customerId={customerId}
            onCreate={createStatement}
          />
        )}
        {tab === 'notes' && (
          <section className={styles.detailsPanel}>
            <div className={styles.sectionHeading}>
              <h2>Notes</h2>
              {editButton}
            </div>
            <p className={styles.notes}>
              {customer.note || 'No notes added yet.'}
            </p>
          </section>
        )}
        {tab === 'attachments' && <AttachmentList customerId={customerId} />}
        {quickInvoiceId !== null && (
          <CustomerInvoiceQuickView
            key={quickInvoiceId}
            invoiceId={quickInvoiceId}
            onClose={() => setQuickInvoiceId(null)}
            onEdit={() =>
              viewTransaction({
                type: 'Invoice',
                id: quickInvoiceId,
              } as Transaction)
            }
          />
        )}
        <Drawer
          isOpen={editing}
          onClose={() => setEditing(false)}
          title="Edit customer"
          size="min(740px, 100vw)"
          className={styles.editor}
          canOutsideClickClose={false}
        >
          <div className={styles.editorBody}>
            <CustomerFormProvider customerId={customerId}>
              <CustomerFormFormik
                onCancel={() => setEditing(false)}
                onSubmitSuccess={() => {
                  setEditing(false);
                  queryClient.invalidateQueries({
                    queryKey: ['customers-workspace'],
                  });
                }}
              />
            </CustomerFormProvider>
          </div>
        </Drawer>
      </div>
      <InvoicePdfPreviewDialog dialogName={DialogsName.InvoicePdfForm} />
    </DashboardInsider>
  );
}
