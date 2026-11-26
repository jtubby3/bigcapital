import { Inject, Injectable } from '@nestjs/common';
import { Account } from '@/modules/Accounts/models/Account.model';
import { AccountTransaction } from '@/modules/Accounts/models/AccountTransaction.model';
import { Customer } from '@/modules/Customers/models/Customer';
import { SaleInvoice } from '@/modules/SaleInvoices/models/SaleInvoice';
import { SaleReceipt } from '@/modules/SaleReceipts/models/SaleReceipt';
import { CreditNote } from '@/modules/CreditNotes/models/CreditNote';
import { PaymentReceived } from '@/modules/PaymentReceived/models/PaymentReceived';
import { RefundCreditNote } from '@/modules/CreditNoteRefunds/models/RefundCreditNote';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { customerSalesAccountTypes } from './CustomerSales';
import { CustomerSalesQuery } from './CustomerSales.types';
import { customerSalesDocuments } from './CustomerSalesDocuments';

@Injectable()
export class CustomerSalesRepository {
  constructor(
    @Inject(Account.name)
    private readonly accounts: TenantModelProxy<typeof Account>,
    @Inject(AccountTransaction.name)
    private readonly transactions: TenantModelProxy<typeof AccountTransaction>,
    @Inject(Customer.name)
    private readonly customers: TenantModelProxy<typeof Customer>,
    @Inject(SaleInvoice.name)
    private readonly invoices: TenantModelProxy<typeof SaleInvoice>,
    @Inject(SaleReceipt.name)
    private readonly receipts: TenantModelProxy<typeof SaleReceipt>,
    @Inject(CreditNote.name)
    private readonly credits: TenantModelProxy<typeof CreditNote>,
    @Inject(PaymentReceived.name)
    private readonly payments: TenantModelProxy<typeof PaymentReceived>,
    @Inject(RefundCreditNote.name)
    private readonly refunds: TenantModelProxy<typeof RefundCreditNote>,
  ) {}

  async get(query: CustomerSalesQuery) {
    const accounts = await this.accounts()
      .query()
      .whereIn('accountType', [
        ...customerSalesAccountTypes,
        'accounts-receivable',
      ])
      .select('id', 'accountType');
    const entries = await this.transactions()
      .query()
      .whereIn(
        'accountId',
        accounts
          .filter((account) =>
            customerSalesAccountTypes.includes(account.accountType),
          )
          .map((account) => account.id),
      )
      .modify('filterDateRange', query.fromDate, query.toDate)
      .modify('filterByBasis', query.basis)
      .withGraphFetched('account')
      .orderBy('date')
      .orderBy('referenceType')
      .orderBy('referenceId')
      .orderBy('index')
      .orderBy('id');
    const ids = (type: string) => [
      ...new Set(
        entries
          .filter((entry) => entry.referenceType === type)
          .map((entry) => entry.referenceId),
      ),
    ];
    // All models are bound to the request tenant; fetching documents never mutates ledger data.
    const [
      customers,
      invoices,
      receipts,
      credits,
      payments,
      refunds,
      refundPostings,
    ] = await Promise.all([
      this.customers().query().select('id', 'displayName'),
      this.invoices()
        .query()
        .whereIn('id', ids('SaleInvoice'))
        .withGraphFetched('entries.item'),
      this.receipts()
        .query()
        .whereIn('id', ids('SaleReceipt'))
        .withGraphFetched('entries.item'),
      this.credits()
        .query()
        .whereIn('id', ids('CreditNote'))
        .withGraphFetched('entries.item'),
      this.payments()
        .query()
        .whereIn('id', ids('PaymentReceive'))
        .withGraphFetched('entries.invoice.entries.item'),
      this.refunds().query().whereIn('id', ids('RefundCreditNote')),
      this.transactions()
        .query()
        .where('referenceType', 'RefundCreditNote')
        .whereIn('referenceId', ids('RefundCreditNote'))
        .whereIn(
          'accountId',
          accounts
            .filter((account) => account.accountType === 'accounts-receivable')
            .map((account) => account.id),
        )
        .whereNotNull('contactId')
        .select('referenceId', 'contactId'),
    ]);
    return {
      entries,
      customers,
      documents: customerSalesDocuments(
        invoices,
        receipts,
        credits,
        payments,
        refunds,
        refundPostings,
      ),
    };
  }
}
