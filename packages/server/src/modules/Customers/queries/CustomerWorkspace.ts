import {
  Inject,
  Injectable,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as moment from 'moment';
import { Customer } from '../models/Customer';
import { SaleInvoice } from '@/modules/SaleInvoices/models/SaleInvoice';
import { SaleEstimate } from '@/modules/SaleEstimates/models/SaleEstimate';
import { PaymentReceived } from '@/modules/PaymentReceived/models/PaymentReceived';
import { CreditNote } from '@/modules/CreditNotes/models/CreditNote';
import { SaleReceipt } from '@/modules/SaleReceipts/models/SaleReceipt';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { CustomerAction } from '../types/Customers.types';
import { GetCustomers } from './GetCustomers.service';
import { GetCustomersQueryDto } from '../dtos/GetCustomersQuery.dto';

export type WorkspaceTransaction = {
  id: number;
  customerId: number;
  type: string;
  date: string;
  number: string;
  amount: number;
  openBalance: number;
  currency: string;
  exchangeRate?: number;
  status: string;
  memo: string;
};
const n = (value: unknown) => Number(value) || 0;
const metricDefinitions = [
  {
    key: 'estimates',
    label: 'Estimates',
    detail: 'Unconverted estimates',
    match: (r: WorkspaceTransaction) =>
      r.type === 'Estimate' && !['Converted', 'Rejected'].includes(r.status),
    value: (r: WorkspaceTransaction) => r.amount,
  },
  {
    key: 'unbilled',
    label: 'Unbilled income',
    detail: 'Draft invoices',
    match: (r: WorkspaceTransaction) =>
      r.type === 'Invoice' && r.status === 'Draft',
    value: (r: WorkspaceTransaction) => r.amount,
  },
  {
    key: 'overdue',
    label: 'Overdue invoices',
    detail: 'Outstanding past due',
    match: (r: WorkspaceTransaction) =>
      r.type === 'Invoice' && r.status === 'Overdue',
    value: (r: WorkspaceTransaction) => r.openBalance,
  },
  {
    key: 'open',
    label: 'Open invoices & credits',
    detail: 'Open invoices less available credits',
    match: (r: WorkspaceTransaction) =>
      (r.type === 'Invoice' &&
        ['Open', 'Overdue', 'Partial'].includes(r.status)) ||
      (r.type === 'Credit memo' && r.status === 'Open'),
    value: (r: WorkspaceTransaction) =>
      r.type === 'Credit memo' ? -r.openBalance : r.openBalance,
  },
  {
    key: 'paid',
    label: 'Recently paid',
    detail: 'Payments & receipts · last 30 days',
    match: (r: WorkspaceTransaction) =>
      ['Payment', 'Sales receipt'].includes(r.type) &&
      r.status !== 'Draft' &&
      moment(r.date).isSameOrAfter(moment().subtract(30, 'days'), 'day') &&
      moment(r.date).isSameOrBefore(moment(), 'day'),
    value: (r: WorkspaceTransaction) => r.amount,
  },
];
export function workspaceSummary(rows: WorkspaceTransaction[]) {
  return metricDefinitions.map((d) => {
    const selected = rows.filter(d.match),
      amounts: Record<string, number> = {};
    for (const row of selected)
      amounts[row.currency] = n(amounts[row.currency]) + d.value(row);
    return {
      key: d.key,
      label: d.label,
      detail: d.detail,
      count: selected.length,
      baseAmount: selected.reduce(
        (total, row) => total + d.value(row) * (row.exchangeRate ?? 1),
        0,
      ),
      amounts: Object.entries(amounts).map(([currency, amount]) => ({
        currency,
        amount,
      })),
    };
  });
}
export function workspaceMetricCustomerIds(
  rows: WorkspaceTransaction[],
  metric: string,
): number[] {
  const definition = metricDefinitions.find(
    (definition) => definition.key === metric,
  );
  if (!definition)
    throw new BadRequestException('Invalid sales overview metric');
  return [
    ...new Set(rows.filter(definition.match).map((row) => row.customerId)),
  ];
}
@Injectable()
export class CustomerWorkspaceService {
  constructor(
    @Inject(Customer.name) private customers: TenantModelProxy<typeof Customer>,
    @Inject(SaleInvoice.name)
    private invoices: TenantModelProxy<typeof SaleInvoice>,
    @Inject(SaleEstimate.name)
    private estimates: TenantModelProxy<typeof SaleEstimate>,
    @Inject(PaymentReceived.name)
    private payments: TenantModelProxy<typeof PaymentReceived>,
    @Inject(CreditNote.name)
    private credits: TenantModelProxy<typeof CreditNote>,
    @Inject(SaleReceipt.name)
    private receipts: TenantModelProxy<typeof SaleReceipt>,
  ) {}
  async rows(
    ability: { can: (action: string, subject: string) => boolean },
    customerId?: number,
  ): Promise<WorkspaceTransaction[]> {
    if (customerId)
      await this.customers().query().findById(customerId).throwIfNotFound();
    const load = (model: any, subject: string) => {
      if (!ability.can('View', subject)) return Promise.resolve([]);
      const query = model().query();
      if (customerId) query.where('customerId', customerId);
      return query;
    };
    const [invoices, estimates, payments, credits, receipts] =
      await Promise.all([
        load(this.invoices, 'SaleInvoice'),
        load(this.estimates, 'SaleEstimate'),
        load(this.payments, 'PaymentReceive'),
        load(this.credits, 'CreditNote'),
        load(this.receipts, 'SaleReceipt'),
      ]);
    const row = (
      r: any,
      type: string,
      date: any,
      number: string,
      amount: number,
      openBalance: number,
      status: string,
    ): WorkspaceTransaction => ({
      id: r.id,
      customerId: r.customerId,
      type,
      date: moment(date).format('YYYY-MM-DD'),
      number,
      amount: n(amount),
      openBalance: n(openBalance),
      currency: r.currencyCode,
      exchangeRate: n(r.exchangeRate) || 1,
      status,
      memo: r.referenceNo || r.reference || r.statement || '',
    });
    return [
      ...invoices.map((r: SaleInvoice) =>
        row(
          r,
          'Invoice',
          r.invoiceDate,
          r.invoiceNo,
          r.total,
          r.dueAmount,
          !r.isDelivered
            ? 'Draft'
            : r.isWrittenoff
              ? 'Closed'
              : r.isFullyPaid
                ? n(r.paymentAmount) > 0
                  ? 'Paid'
                  : 'Closed'
                : r.isOverdue
                  ? 'Overdue'
                  : r.isPartiallyPaid
                    ? 'Partial'
                    : 'Open',
        ),
      ),
      ...estimates.map((r: SaleEstimate) =>
        row(
          r,
          'Estimate',
          r.estimateDate,
          r.estimateNumber,
          r.total,
          0,
          r.isConvertedToInvoice
            ? 'Converted'
            : r.isRejected
              ? 'Rejected'
              : r.isApproved
                ? 'Accepted'
                : r.isDelivered
                  ? 'Open'
                  : 'Draft',
        ),
      ),
      ...payments.map((r: PaymentReceived) =>
        row(
          r,
          'Payment',
          r.paymentDate,
          r.paymentReceiveNo,
          r.amount,
          0,
          'Closed',
        ),
      ),
      ...credits.map((r: CreditNote) =>
        row(
          r,
          'Credit memo',
          r.creditNoteDate,
          r.creditNoteNumber,
          r.total,
          r.isPublished ? r.creditsRemaining : 0,
          !r.isPublished ? 'Draft' : r.isOpen ? 'Open' : 'Closed',
        ),
      ),
      ...receipts.map((r: SaleReceipt) =>
        row(
          r,
          'Sales receipt',
          r.receiptDate,
          r.receiptNumber,
          r.total,
          0,
          r.isClosed ? 'Paid' : 'Draft',
        ),
      ),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }
  async attachments(customerId: number) {
    const customer = await this.customers()
      .query()
      .findById(customerId)
      .throwIfNotFound();
    const keys = customer.customerProfile?.attachmentKeys || [];
    if (!keys.length) return [];
    return this.customers()
      .knex()('documents')
      .select('key', 'origin_name', 'size', 'mime_type')
      .whereIn('key', keys);
  }
  async categories() {
    const customers = await this.customers().query().select('customerProfile');
    return [
      ...new Set(customers.flatMap((c) => c.customerProfile?.categories || [])),
    ].sort();
  }
}
export function filterWorkspaceTransactions(
  rows: WorkspaceTransaction[],
  query: Record<string, string>,
) {
  const types = (query.type === '[]' ? '' : query.type || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const statuses = (query.status === '[]' ? '' : query.status || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return rows.filter(
    (r) =>
      (!query.type || types.includes(r.type)) &&
      (!query.status || statuses.includes(r.status)) &&
      (!query.from || r.date >= query.from) &&
      (!query.to || r.date <= query.to) &&
      (!query.search ||
        [r.number, r.memo].some((value) =>
          value.toLowerCase().includes(query.search.toLowerCase()),
        )),
  );
}

@Controller('customer-workspace')
@UseGuards(AuthorizationGuard, PermissionGuard)
@RequirePermission(CustomerAction.View, AbilitySubject.Customer)
export class CustomerWorkspaceController {
  constructor(
    private service: CustomerWorkspaceService,
    private readonly getCustomersService: GetCustomers,
  ) {}
  @Get('summary') async summary(@Req() req: any) {
    return workspaceSummary(await this.service.rows(req.ability));
  }
  @Get('customers') async customers(
    @Query() query: GetCustomersQueryDto,
    @Query('metric') metric: string,
    @Req() req: any,
  ) {
    if (!metricDefinitions.some((definition) => definition.key === metric))
      throw new BadRequestException('Invalid sales overview metric');
    const customerIds = workspaceMetricCustomerIds(
      await this.service.rows(req.ability),
      metric,
    );
    return this.getCustomersService.getCustomersList({
      ...query,
      filterQuery: (builder) => builder.whereIn('contacts.id', customerIds),
    });
  }
  @Get('categories') categories() {
    return this.service.categories();
  }
  @Get(':id/attachments') async attachments(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    if (!req.ability.can('View', AbilitySubject.Attachment))
      throw new ForbiddenException();
    return this.service.attachments(id);
  }
  @Get(':id') async transactions(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, string>,
    @Req() req: any,
  ) {
    const page = Number(query.page || 1);
    if (!Number.isInteger(page) || page < 1)
      throw new BadRequestException('Invalid page');
    const rows = await this.service.rows(req.ability, id);
    const filtered = filterWorkspaceTransactions(rows, query);
    return {
      summary: workspaceSummary(rows),
      total: filtered.length,
      page,
      pageSize: 25,
      rows: filtered.slice((page - 1) * 25, page * 25),
    };
  }
}
