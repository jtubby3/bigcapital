import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Knex } from 'knex';
import { isEmail } from 'class-validator';
import { ACCOUNT_TYPE } from '@/constants/accounts';
import { AccountingBasis } from '@/common/types/AccountingBasis';
import { Account } from '@/modules/Accounts/models/Account.model';
import { AccountTransaction } from '@/modules/Accounts/models/AccountTransaction.model';
import { Customer } from '@/modules/Customers/models/Customer';
import { SaleInvoice } from '@/modules/SaleInvoices/models/SaleInvoice';
import { SaleReceipt } from '@/modules/SaleReceipts/models/SaleReceipt';
import { CreditNote } from '@/modules/CreditNotes/models/CreditNote';
import { ManualJournal } from '@/modules/ManualJournals/models/ManualJournal';
import { PaymentLink } from '@/modules/PaymentLinks/models/PaymentLink';
import { PUBLIC_PAYMENT_LINK } from '@/modules/SaleInvoices/constants';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { TENANCY_DB_CONNECTION } from '@/modules/Tenancy/TenancyDB/TenancyDB.constants';
import { Mail } from '@/modules/Mail/Mail';
import { MailTransporter } from '@/modules/Mail/MailTransporter.service';
import { CustomerStatement } from './CustomerStatement.model';
import { CustomerStatementPdf } from './CustomerStatementPdf.service';
import {
  SavedStatement,
  StatementDraft,
  StatementSnapshot,
} from './CustomerStatements.types';
import {
  buildStatementSnapshot,
  statementDay,
  StatementSettlement,
  validateSavedStatementIds,
  validateStatementDraft,
} from './statementSnapshot';

@Injectable()
export class CustomerStatementsService {
  constructor(
    @Inject(TENANCY_DB_CONNECTION) private readonly tenantDb: () => Knex,
    @Inject(CustomerStatement.name)
    private readonly statementModel: TenantModelProxy<typeof CustomerStatement>,
    @Inject(Customer.name)
    private readonly customerModel: TenantModelProxy<typeof Customer>,
    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
    @Inject(AccountTransaction.name)
    private readonly transactionModel: TenantModelProxy<
      typeof AccountTransaction
    >,
    @Inject(SaleInvoice.name)
    private readonly invoiceModel: TenantModelProxy<typeof SaleInvoice>,
    @Inject(CreditNote.name)
    private readonly creditModel: TenantModelProxy<typeof CreditNote>,
    @Inject(ManualJournal.name)
    private readonly journalModel: TenantModelProxy<typeof ManualJournal>,
    private readonly tenancyContext: TenancyContext,
    private readonly pdfRenderer: CustomerStatementPdf,
    private readonly mailTransporter: MailTransporter,
    @Inject(PaymentLink.name)
    private readonly paymentLinkModel: typeof PaymentLink,
    private readonly config: ConfigService,
    @Inject(SaleReceipt.name)
    private readonly receiptModel: TenantModelProxy<typeof SaleReceipt>,
  ) {}

  async recipients(customerIds?: number[]) {
    const query = this.customerModel().query().orderBy('displayName');
    if (customerIds) query.whereIn('id', customerIds);
    else query.where('active', true);
    const customers = await query;
    if (customerIds && customers.length !== customerIds.length)
      throw new NotFoundException('Customer not found');
    return customers.map((customer) => ({
      id: customer.id,
      displayName: customer.displayName,
      email: customer.email || '',
      currencyCode: customer.currencyCode,
      balance: Number(customer.balance || 0),
    }));
  }

  async preview(input: unknown): Promise<StatementSnapshot[]> {
    const draft = validateStatementDraft(input);
    return this.tenantDb().transaction((trx) => this.snapshots(draft, trx), {
      isolationLevel: 'repeatable read',
    });
  }

  async previewPdf(input: unknown): Promise<Buffer> {
    return this.pdfRenderer.pdf(await this.preview(input));
  }

  async savedPdf(input: unknown): Promise<Buffer> {
    const ids = validateSavedStatementIds(input);
    const records = await this.statementModel().query().whereIn('id', ids);
    if (records.length !== ids.length)
      throw new NotFoundException('Statement not found');
    const byId = new Map(records.map((record) => [record.id, record.snapshot]));
    return this.pdfRenderer.pdf(ids.map((id) => byId.get(id)));
  }

  async save(input: unknown): Promise<SavedStatement[]> {
    const draft = validateStatementDraft(input);
    return this.tenantDb().transaction(
      async (trx) => {
        const snapshots = await this.snapshots(draft, trx);
        const saved: SavedStatement[] = [];
        // MariaDB cannot return every inserted id from a batch insert; keep all inserts in one transaction.
        for (const snapshot of snapshots) {
          const record = await this.statementModel().query(trx).insertAndFetch({
            customerId: snapshot.customerId,
            statementType: snapshot.statementType,
            statementDate: snapshot.statementDate,
            fromDate: snapshot.fromDate,
            toDate: snapshot.toDate,
            email: snapshot.email,
            status: 'saved',
            snapshot,
            createdAt: new Date(),
          });
          saved.push(this.saved(record));
        }
        return saved;
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async list(customerId?: number): Promise<SavedStatement[]> {
    if (
      customerId &&
      !(await this.customerModel().query().findById(customerId))
    )
      throw new NotFoundException('Customer not found');
    const query = this.statementModel()
      .query()
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc');
    if (customerId) query.where('customerId', customerId);
    return (await query).map((record) => this.saved(record));
  }

  async pdf(id: number): Promise<Buffer> {
    const record = await this.statementModel().query().findById(id);
    if (!record) throw new NotFoundException('Statement not found');
    return this.pdfRenderer.pdf([record.snapshot]);
  }

  async send(id: number): Promise<SavedStatement> {
    return this.tenantDb().transaction(async (trx) => {
      // Serialize delivery attempts, including concurrent clicks, without changing immutable financial content.
      const record = await this.statementModel()
        .query(trx)
        .findById(id)
        .forUpdate();
      if (!record) throw new NotFoundException('Statement not found');
      if (record.status === 'sent') return this.saved(record);
      if (!record.email || !isEmail(record.email))
        throw new BadRequestException(
          'A valid recipient email is required to send',
        );
      const content = await this.pdfRenderer.pdf([record.snapshot]);
      const mail = new Mail()
        .setTo(record.email)
        .setSubject(`Statement ${record.statementDate}`)
        .setContent('<p>Please find your customer statement attached.</p>')
        .setAttachments([{ filename: `statement-${id}.pdf`, content }]);
      try {
        const delivery = await this.mailTransporter.send(mail);
        if (
          delivery?.rejected?.length ||
          (Array.isArray(delivery?.accepted) && !delivery.accepted.length)
        ) {
          throw new Error('Recipient rejected');
        }
      } catch (_error) {
        throw new BadGatewayException(
          'Statement email could not be delivered. Please try again.',
        );
      }
      const updated = await this.statementModel()
        .query(trx)
        .patchAndFetchById(id, {
          status: 'sent',
          sentAt: new Date(),
        });
      return this.saved(updated);
    });
  }

  private saved(record: CustomerStatement): SavedStatement {
    return {
      id: record.id,
      customerId: record.customerId,
      statementType: record.statementType,
      statementDate: statementDay(record.statementDate),
      fromDate: statementDay(record.fromDate),
      toDate: statementDay(record.toDate),
      email: record.email,
      status: record.status,
      createdAt:
        record.createdAt instanceof Date
          ? record.createdAt.toISOString()
          : record.createdAt,
      sentAt:
        record.sentAt instanceof Date
          ? record.sentAt.toISOString()
          : record.sentAt,
      snapshot: record.snapshot,
    };
  }

  private async snapshots(
    draft: StatementDraft,
    trx: Knex.Transaction,
  ): Promise<StatementSnapshot[]> {
    const customerIds = draft.recipients.map(
      (recipient) => recipient.customerId,
    );
    const customers = await this.customerModel()
      .query(trx)
      .whereIn('id', customerIds);
    if (customers.length !== customerIds.length)
      throw new NotFoundException('Customer not found');
    const accounts = await this.accountModel()
      .query(trx)
      .where('accountType', ACCOUNT_TYPE.ACCOUNTS_RECEIVABLE);
    const [ledger, invoices, credits, journals, tenant, receipts] =
      await Promise.all([
        this.transactionModel()
          .query(trx)
          .whereIn('contactId', customerIds)
          .whereIn(
            'accountId',
            accounts.map((account) => account.id),
          )
          .where('date', '<=', draft.toDate)
          .modify('filterByBasis', AccountingBasis.Accrual),
        this.invoiceModel()
          .query(trx)
          .whereIn('customerId', customerIds)
          .where('invoiceDate', '<=', draft.toDate),
        this.creditModel()
          .query(trx)
          .whereIn('customerId', customerIds)
          .whereNotNull('openedAt'),
        this.journalModel().query(trx).select('id').whereNotNull('publishedAt'),
        this.tenancyContext.getTenant(true),
        this.receiptModel()
          .query(trx)
          .whereIn('customerId', customerIds)
          .where('receiptDate', '>=', draft.fromDate)
          .where('receiptDate', '<=', draft.toDate)
          .whereNotNull('closedAt'),
      ]);
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const payments: StatementSettlement[] = invoiceIds.length
      ? await trx('paymentReceivesEntries as entry')
          .join(
            'paymentReceives as payment',
            'payment.id',
            'entry.paymentReceiveId',
          )
          .whereIn('entry.invoiceId', invoiceIds)
          .whereIn('payment.customerId', customerIds)
          .where('payment.paymentDate', '<=', draft.toDate)
          .select(
            'entry.invoiceId',
            'entry.paymentAmount as amount',
            'payment.paymentDate as date',
          )
      : [];
    const appliedCredits: StatementSettlement[] = invoiceIds.length
      ? await trx('creditNoteAppliedInvoice as entry')
          .join('creditNotes as credit', 'credit.id', 'entry.creditNoteId')
          .whereIn('entry.invoiceId', invoiceIds)
          .whereIn('credit.customerId', customerIds)
          .whereNotNull('credit.openedAt')
          .where('credit.creditNoteDate', '<=', draft.toDate)
          .where(
            'entry.createdAt',
            '<',
            `${momentNextDay(draft.toDate)} 00:00:00`,
          )
          .select('entry.invoiceId', 'entry.amount', 'entry.createdAt as date')
      : [];
    const publishedCreditIds = new Set(credits.map((credit) => credit.id));
    const publishedJournalIds = new Set(journals.map((journal) => journal.id));
    const postedLedger = ledger.filter(
      (entry) =>
        (entry.referenceType !== 'CreditNote' ||
          publishedCreditIds.has(entry.referenceId)) &&
        (!['ManualJournal', 'Journal'].includes(entry.referenceType) ||
          publishedJournalIds.has(entry.referenceId)),
    );
    const invoiceData = invoices.map((invoice) => ({
      ...invoice,
      total: Number(invoice.total),
      paymentUrl: undefined as string | undefined,
    }));
    if (draft.includePaymentLinks && invoiceIds.length) {
      const links = await this.paymentLinkModel
        .query()
        .where({
          tenantId: tenant.id,
          resourceType: 'SaleInvoice',
          publicity: 'public',
        })
        .whereIn('resourceId', invoiceIds)
        .where((builder) =>
          builder.whereNull('expiryAt').orWhere('expiryAt', '>', new Date()),
        )
        .orderBy('id', 'desc');
      const baseUrl = this.config.get<string>('app.baseUrl') || '';
      for (const invoice of invoiceData) {
        const link = links.find((value) => value.resourceId === invoice.id);
        if (link && /^https?:\/\//i.test(baseUrl)) {
          invoice.paymentUrl = PUBLIC_PAYMENT_LINK.replace(
            '{BASE_URL}',
            baseUrl,
          ).replace('{PAYMENT_LINK_ID}', encodeURIComponent(link.linkId));
        }
      }
    }
    return customerIds.map((id) =>
      buildStatementSnapshot(
        draft,
        customers.find((customer) => customer.id === id),
        postedLedger,
        invoiceData,
        [
          ...payments,
          ...appliedCredits.map((credit) => ({
            ...credit,
            kind: 'credit' as const,
          })),
        ],
        tenant?.metadata?.name || '',
        receipts.map((receipt) => ({
          ...receipt,
          total: Number(receipt.total),
        })),
        tenant?.metadata?.baseCurrency,
      ),
    );
  }
}

function momentNextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
