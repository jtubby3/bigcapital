import {
  AnchorButton,
  Button,
  Callout,
  Dialog,
  Spinner,
  Tag,
} from '@blueprintjs/core';
import { useEffect, useRef, useState } from 'react';
import { money } from '../CustomerWorkspace/useCustomerWorkspace';
import styles from './CustomerStatementHistory.module.scss';
import {
  useStatementPdf,
  useStatementsHistory,
  useSendStatement,
} from './useCustomerStatements';
import { PdfDocumentPreview } from '@/components';
import { CustomerAction, AbilitySubject } from '@/constants/abilityOption';
import { useAbilityContext } from '@/hooks/utils';

export function CustomerStatementHistory({
  customerId,
  onCreate,
}: {
  customerId: number;
  onCreate: () => void;
}) {
  const history = useStatementsHistory(customerId);
  const pdf = useStatementPdf();
  const send = useSendStatement();
  const ability = useAbilityContext();
  const previewRequest = useRef(0);
  useEffect(
    () => () => {
      previewRequest.current += 1;
    },
    [],
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [document, setDocument] = useState<{ url: string; filename: string }>();
  useEffect(
    () => () => {
      if (document) URL.revokeObjectURL(document.url);
    },
    [document],
  );
  const preview = async (id: number) => {
    const request = ++previewRequest.current;
    setDocument(undefined);
    setPreviewOpen(true);
    try {
      const result = await pdf.mutateAsync({ id });
      if (request === previewRequest.current) setDocument(result);
      else URL.revokeObjectURL(result.url);
    } catch {
      /* Error shown in preview. */
    }
  };
  const close = () => {
    previewRequest.current += 1;
    setPreviewOpen(false);
    setDocument(undefined);
  };
  const labels = {
    'balance-forward': 'Balance Forward',
    'open-item': 'Open Item',
    transaction: 'Transaction Statement',
  };
  return (
    <section className={styles.history}>
      <div className={styles.heading}>
        <h2>Statements</h2>
        <Button intent="primary" icon="document" onClick={onCreate}>
          Create statement
        </Button>
      </div>
      {send.isError && (
        <Callout intent="warning" style={{ marginBottom: 16 }}>
          Statement delivery could not be confirmed. Refresh the statement
          status before retrying.{' '}
          <Button small onClick={() => history.refetch()}>
            Refresh status
          </Button>
        </Callout>
      )}
      {history.isLoading ? (
        <Spinner size={24} />
      ) : history.isError ? (
        <Callout intent="warning">
          Statements could not be loaded.{' '}
          <Button onClick={() => history.refetch()}>Try again</Button>
        </Callout>
      ) : history.data?.length ? (
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th>Statement date</th>
                <th>Type</th>
                <th>Period / as of</th>
                <th>Recipient</th>
                <th>Balance / net activity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((statement) => (
                <tr key={statement.id}>
                  <td>{statement.statementDate}</td>
                  <td>{labels[statement.statementType]}</td>
                  <td>
                    {statement.statementType === 'open-item'
                      ? `As of ${statement.toDate}`
                      : `${statement.fromDate} – ${statement.toDate}`}
                  </td>
                  <td>{statement.email || 'No email'}</td>
                  <td>
                    {money(
                      statement.statementType === 'transaction'
                        ? statement.snapshot.totalCharges -
                            statement.snapshot.totalPayments
                        : statement.snapshot.closingBalance,
                      statement.snapshot.currencyCode,
                    )}
                  </td>
                  <td>
                    <Tag
                      minimal
                      intent={
                        statement.status === 'sent' ? 'primary' : undefined
                      }
                    >
                      {statement.status === 'sent' ? 'Sent' : 'Saved'}
                    </Tag>
                    {statement.sentAt && (
                      <small>
                        {new Date(statement.sentAt).toLocaleDateString()}
                      </small>
                    )}
                  </td>
                  <td>
                    <Button
                      small
                      minimal
                      icon="document-open"
                      onClick={() => preview(statement.id)}
                    >
                      View / print
                    </Button>
                    {statement.status !== 'sent' &&
                      ability.can(
                        CustomerAction.Edit,
                        AbilitySubject.Customer,
                      ) && (
                        <Button
                          small
                          minimal
                          icon="envelope"
                          disabled={!statement.email || send.isPending}
                          loading={
                            send.isPending && send.variables === statement.id
                          }
                          title={
                            statement.email
                              ? `Send to ${statement.email}`
                              : 'No email saved on this statement'
                          }
                          onClick={() => send.mutate(statement.id)}
                        >
                          Send
                        </Button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>
          <h3>No statements yet</h3>
          <p>
            Create a statement to summarize this customer's account activity.
          </p>
        </div>
      )}
      <Dialog
        isOpen={previewOpen}
        onClose={close}
        title="Statement preview"
        style={{ width: 'min(1040px, 96vw)' }}
      >
        <div className={styles.previewActions}>
          <AnchorButton
            href={document?.url}
            disabled={!document}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open / print
          </AnchorButton>
          <AnchorButton
            href={document?.url}
            disabled={!document}
            download={document?.filename}
          >
            Download PDF
          </AnchorButton>
        </div>
        {pdf.isError && (
          <Callout intent="warning">
            The statement PDF could not be loaded. Close the preview and try
            again.
          </Callout>
        )}
        <PdfDocumentPreview
          url={document?.url}
          width="100%"
          height={660}
          isLoading={pdf.isPending}
          isError={pdf.isError}
        />
      </Dialog>
    </section>
  );
}
