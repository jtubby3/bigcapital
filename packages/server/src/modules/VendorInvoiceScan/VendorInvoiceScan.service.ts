import {
  BadRequestException, ConflictException, ForbiddenException, Inject,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Knex } from 'knex';
import { ClsService } from 'nestjs-cls';
import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getItemPricingUpdate, isAutoPricingEnabled } from '@bigcapital/utils';
import { TENANCY_DB_CONNECTION } from '../Tenancy/TenancyDB/TenancyDB.constants';
import { TenancyContext } from '../Tenancy/TenancyContext.service';
import { AuthorizationGuard } from '../Roles/Authorization.guard';
import { S3_CLIENT } from '../S3/S3.module';
import { LocalPackingScan } from '../PackingSlips/LocalPackingScan';
import { validateScanFile, MAX_SCAN_BYTES } from '../PackingSlips/packingSlipValidation';
import { ScanPage } from '../PackingSlips/packingSlip.types';
import { CreateBill } from '../Bills/commands/CreateBill.service';
import { CreateBillDto } from '../Bills/dtos/Bill.dto';
import { Bill } from '../Bills/models/Bill';
import { Item } from '../Items/models/Item';
import { getBillItemCosts } from '../Bills/subscribers/BillItemPricingSubscriber';
import { SETTINGS_PROVIDER } from '../Settings/Settings.types';
import { SettingsStore } from '../Settings/SettingsStore';
import { parseVendorInvoice, pjpMatches } from './vendorInvoiceParser';
import { OptionKind, Review, Scan, ScanFileInput } from './vendorScanTypes';
import { emptyReview, normalizeReview } from './vendorScanReview';
import { reconcileInvoice } from './vendorScanAccounting';

export const VENDOR_SCAN_QUEUE = 'vendor-invoice-scan';
export const VENDOR_SCAN_MAX_FILES = 10;
const SCANS = 'vendor_invoice_scans';
const FILES = 'vendor_invoice_scan_files';
const MATCHES = 'vendor_invoice_item_matches';
const hash = (input: Buffer | string) => createHash('sha256').update(input).digest('hex');
const normalized = (value: string) => value.normalize('NFKC').trim().toLowerCase();
const vendorNameKey = (value: string) => normalized(value).replace(/[^a-z0-9]/g, '');
const invoiceDate = (value: Date | string) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);

@Injectable()
export class VendorInvoiceScanService {
  constructor(
    @Inject(TENANCY_DB_CONNECTION) private readonly db: () => Knex,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @InjectQueue(VENDOR_SCAN_QUEUE) private readonly queue: Queue,
    @Inject(SETTINGS_PROVIDER) private readonly settings: () => Promise<SettingsStore>,
    private readonly cls: ClsService,
    private readonly config: ConfigService,
    private readonly auth: AuthorizationGuard,
    private readonly tenancy: TenancyContext,
    private readonly scanner: LocalPackingScan,
    private readonly createBill: CreateBill,
  ) {}

  async access(write = false) {
    if (!this.cls.get('userId') || !this.cls.get('organizationId')) {
      throw new ForbiddenException('Sign in to access vendor invoices.');
    }
    const ability = await this.auth.getAbilityForUser().catch((error) => {
      if (error instanceof TypeError) throw new ForbiddenException('Organization membership is required.');
      throw error;
    });
    const rights = [['View', 'Bill'], ['View', 'Attachment'], ['View', 'Item'], ['View', 'Vendor']];
    if (write) rights.push(['Create', 'Bill'], ['Create', 'Attachment']);
    if (rights.some(([action, subject]) => !ability.can(action, subject))) {
      throw new ForbiddenException('Vendor scanning requires bill, attachment, item and vendor permissions.');
    }
  }

  async list() {
    await this.access();
    return this.db()(SCANS).select('id', 'status', 'name', 'version', 'billId', 'error')
      .orderBy('id', 'desc').limit(100);
  }

  private async row(id: number, sql: Knex = this.db(), lock = false) {
    const row = await (lock ? sql(SCANS).where({ id }).forUpdate() : sql(SCANS).where({ id })).first();
    if (!row) throw new NotFoundException('Vendor invoice scan not found.');
    return row;
  }

  private async view(row: any): Promise<Scan> {
    const { id, name, status, version, billId, error } = row;
    return {
      id, name, status, version, billId, error,
      review: this.review(row),
      files: await this.db()(FILES).where({ scanId: id }).select('id', 'name', 'pageCount').orderBy('id'),
    };
  }

  private review(row: any): Review {
    return (typeof row.review === 'string' ? JSON.parse(row.review) : row.review) ?? emptyReview();
  }

  async get(id: number) {
    await this.access();
    return this.view(await this.row(id));
  }

  private get bucket(): string { return this.config.get('s3.bucket'); }
  private get prefix(): string { return `${this.cls.get('organizationId')}/vendor-invoices/`; }

  async upload(files: ScanFileInput[], requestKey?: string) {
    await this.access(true);
    if (!files?.length || files.length > VENDOR_SCAN_MAX_FILES) {
      throw new BadRequestException('Choose up to 10 files for one invoice.');
    }
    const validated = files.map(file => ({
      ...file, mimetype: validateScanFile(file.buffer, file.originalname), digest: hash(file.buffer),
    }));
    if (validated.reduce((sum, file) => sum + file.buffer.length, 0) > 50 * 1024 * 1024) {
      throw new BadRequestException('Limit the combined invoice upload to 50 MiB.');
    }
    const digests = validated.map(file => file.digest);
    if (new Set(digests).size !== digests.length) throw new BadRequestException('Remove repeated pages from the upload.');
    const sourceHash = hash(JSON.stringify([...digests].sort()));
    const keyHash = requestKey ? hash(requestKey) : null;
    const previous = () => this.db()(SCANS).where({ sourceHash })
      .modify(query => { if (keyHash) query.orWhere({ requestKey: keyHash }); }).first();
    let row = await previous();
    if (!row) {
      const uploaded: { key: string; name: string; mime: string; size: number }[] = [];
      try {
        for (const file of validated) {
          const key = this.prefix + randomUUID();
          await this.s3.send(new PutObjectCommand({
            Bucket: this.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype, ACL: 'private',
          }));
          uploaded.push({ key, name: file.originalname, mime: file.mimetype, size: file.buffer.length });
        }
        row = await this.db().transaction(async trx => {
          const [id] = await trx(SCANS).insert({
            name: validated[0].originalname, status: 'queued', sourceHash,
            requestKey: keyHash, userId: this.cls.get('userId'),
          });
          await trx(FILES).insert(uploaded.map(file => ({ ...file, scanId: id })));
          return this.row(id, trx);
        });
      } catch (error) {
        row = await previous();
        const used = row && await this.db()(FILES).where({ scanId: row.id }).pluck('key');
        await Promise.allSettled(uploaded.filter(file => !used?.includes(file.key))
          .map(file => this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: file.key }))));
        if (!row) throw error;
      }
    }
    if (row.status === 'queued' || row.status === 'processing') await this.enqueue(row);
    return this.view(await this.row(row.id));
  }

  private async enqueue(row: { id: number; version: number; userId: number }) {
    const organizationId = this.cls.get<string>('organizationId');
    try {
      await this.queue.add('scan', {
        id: row.id, version: row.version, organizationId, userId: row.userId,
      }, {
        jobId: `vendor-${organizationId}-${row.id}-${row.version}`,
        attempts: 3, backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 },
      });
    } catch {
      await this.db()(SCANS).where({ id: row.id, version: row.version, status: 'queued' })
        .update({ status: 'failed', error: 'Unable to queue the scan. Retry when the local server is ready.' });
    }
  }

  private async read(key: string) {
    if (!key.startsWith(this.prefix)) throw new NotFoundException('Invoice file not found.');
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_SCAN_BYTES) throw new BadRequestException('Invoice file exceeds the size limit.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async page(id: number, fileId: number, page: number) {
    await this.access();
    const file = await this.db()(FILES).where({ scanId: id, id: fileId }).first();
    if (!file || page < 1 || page > file.pageCount) throw new NotFoundException('Invoice page not found.');
    return this.scanner.preview(await this.read(file.key), file.mime, page);
  }

  async process(id: number, version: number, lastAttempt: boolean) {
    const expected = { id, version };
    const claimed = await this.db()(SCANS).where(expected).whereIn('status', ['queued', 'processing'])
      .update({ status: 'processing', error: null });
    if (!claimed) return;
    try {
      const source = await this.db()(FILES).where({ scanId: id }).orderBy('id');
      const pages: ScanPage[] = [];
      const pageSources = new Map<number, { fileId: number; page: number }>();
      for (const file of source) {
        const current = await this.row(id);
        if (current.version !== version || current.status !== 'processing') return;
        const result = await this.scanner.scan(await this.read(file.key), file.mime, { preferTextLayer: true });
        if (pages.length + result.length > 200) throw new Error('Too many invoice pages.');
        for (const page of result) {
          const index = pages.length + 1;
          pageSources.set(index, { fileId: file.id, page: page.page });
          pages.push({ ...page, page: index });
        }
        await this.db()(FILES).where({ id: file.id }).update({ pageCount: result.length });
      }
      const parsed = parseVendorInvoice(pages);
      if (parsed.blocked) {
        await this.db()(SCANS).where({ ...expected, status: 'processing' }).update({
          status: 'failed', version: version + 1,
          error: 'Multiple invoice numbers found. Upload each invoice separately.',
        });
        return;
      }
      const review: Review = {
        ...parsed, exchangeRate: '', receiptChecked: false,
        lines: parsed.lines.slice(0, 300).map(line => ({
          ...line, ...pageSources.get(line.page),
          confirmed: false, remember: false, casesPerUnit: '',
        })),
        warnings: parsed.warnings,
      };
      if (parsed.lines.length > 300) throw new Error('Too many invoice lines.');
      const vendors = await this.db()('contacts').where({ contactService: 'vendor' })
        .select('id', 'displayName', 'currencyCode');
      const vendorCandidates = review.vendorName ? vendors.filter(vendor =>
        vendorNameKey(vendor.displayName) === vendorNameKey(review.vendorName) ||
        (this.isPjp(vendor.displayName) && this.isPjp(review.vendorName))) : [];
      if (vendorCandidates.length === 1) {
        const vendor = vendorCandidates[0];
        review.vendorId = vendor.id;
        review.currency ||= vendor.currencyCode;
        const organization = await this.tenancy.getTenantMetadata();
        if (review.currency === organization?.baseCurrency) review.exchangeRate = '1';
        await this.suggest(review);
      }
      await this.db()(SCANS).where({ ...expected, status: 'processing' }).update({
        status: 'review', version: version + 1, review: JSON.stringify(normalizeForStorage(review)),
      });
    } catch (error) {
      if (!lastAttempt) throw error;
      await this.db()(SCANS).where({ ...expected, status: 'processing' }).update({
        status: 'failed', version: version + 1,
        error: 'Could not read the invoice locally. Check the file or try uploading clearer pages.',
      });
    }
  }

  private isPjp(value: string) {
    return ['pjp', 'pennjerseypaper', 'pennjerseypaperco', 'pennjerseypapercompany'].includes(vendorNameKey(value));
  }

  private async suggest(review: Review, sql: Knex = this.db()) {
    const vendor = await sql('contacts').where({ id: review.vendorId, contactService: 'vendor' }).first();
    if (!vendor) return;
    const mappings = await sql(MATCHES).where({ vendorId: vendor.id })
      .whereIn('codeHash', review.lines.filter(line => line.code).map(line => hash(line.code)));
    const items = await sql('items').where({ type: 'inventory', purchasable: true }).select('id', 'name', 'code');
    for (const line of review.lines) {
      if (line.itemId || !line.code) continue;
      const match = mappings.find(mapping => mapping.code === line.code);
      const seed = this.isPjp(vendor.displayName) && Object.prototype.hasOwnProperty.call(pjpMatches, line.code) ? pjpMatches[line.code] : null;
      const candidates = items.filter(item => match ? item.id === match.itemId : seed &&
        [item.code, item.name].some(value => value &&
          [seed.name, seed.name.split(':').at(-1)].some(name => normalized(name) === normalized(value))));
      if (candidates.length !== 1) continue;
      const [item] = candidates;
      line.itemId = item.id;
      line.itemName = item.name;
      if (match && (match.billingUnit !== line.billingUnit || match.pack !== line.pack)) {
        line.attention = 'The vendor billing unit or pack changed. Verify the case conversion.';
      } else if (match) {
        line.casesPerUnit ||= match.casesPerUnit;
      } else if (seed?.needsConversion) {
        line.attention = 'This item has a pending case conversion. Verify it before recording.';
      } else if (seed && (line.billingUnit !== 'CS' ||
        normalized(seed.pack ?? '') !== normalized(line.pack))) {
        line.attention = 'The billed unit or pack differs from the saved vendor product. Verify the case conversion.';
      } else if (line.billingUnit === 'CS') {
        line.casesPerUnit ||= '1';
      }
    }
  }

  private checkVersion(row: { version: number }, expected: number) {
    if (!Number.isSafeInteger(expected) || row.version !== expected) {
      throw new ConflictException('This invoice review changed. Refresh and review the current version.');
    }
  }

  async save(id: number, version: number, input: Review) {
    await this.access(true);
    const review = normalizeReview(input);
    await this.db().transaction(async trx => {
      const row = await this.row(id, trx, true);
      this.checkVersion(row, version);
      if (row.status !== 'review') throw new ConflictException('This scan cannot be edited.');
      const original = this.review(row);
      const files = await trx(FILES).where({ scanId: id }).select('id', 'pageCount');
      review.warnings = original.warnings;
      for (const [index, line] of review.lines.entries()) {
        const source = files.find(file => file.id === line.fileId);
        if ((line.page || line.fileId) && (!source || !line.page || line.page > source.pageCount)) {
          throw new BadRequestException('A review line refers to an invalid source page.');
        }
        const earlier = original.lines[index];
        if (earlier?.code === line.code && earlier?.fileId === line.fileId && earlier?.page === line.page) {
          line.attention = earlier.attention;
        }
        if (original.vendorId && original.vendorId !== review.vendorId) {
          line.confirmed = false;
          line.remember = false;
        }
      }
      if (review.vendorId) {
        const vendor = await trx('contacts').where({ id: review.vendorId, contactService: 'vendor' }).first();
        if (!vendor) throw new BadRequestException('Choose an existing vendor.');
        review.vendorName = vendor.displayName;
        if (review.vendorId !== original.vendorId) {
          if (!review.currency) review.currency = vendor.currencyCode;
          if (!review.exchangeRate && review.currency === (await this.tenancy.getTenantMetadata())?.baseCurrency) {
            review.exchangeRate = '1';
          }
          await this.suggest(review, trx);
        }
      }
      const items = await trx('items').where({ type: 'inventory', purchasable: true })
        .whereIn('id', [...new Set(review.lines.map(line => line.itemId).filter(Boolean))]).select('id', 'name');
      const toRemember = new Map<string, Review['lines'][number]>();
      for (const line of review.lines) {
        const item = items.find(item => item.id === line.itemId);
        if (line.itemId && !item) throw new BadRequestException('Select an existing purchasable inventory item.');
        if (item) line.itemName = item.name;
        if (!line.remember) continue;
        if (!review.vendorId || !line.code || !line.confirmed || !item || !line.billingUnit ||
          (line.casesPerUnit && (!/^\d{1,8}(?:\.\d{1,8})?$/.test(line.casesPerUnit) || !(Number(line.casesPerUnit) > 0)))) {
          throw new BadRequestException('To remember a match, confirm the vendor, product code, billing unit and item.');
        }
        const earlier = toRemember.get(line.code);
        if (earlier && (earlier.itemId !== line.itemId || earlier.pack !== line.pack ||
          earlier.billingUnit !== line.billingUnit || earlier.casesPerUnit !== line.casesPerUnit)) {
          throw new BadRequestException('Conflicting mappings for the same vendor code.');
        }
        toRemember.set(line.code, line);
        line.remember = false;
      }
      for (const line of toRemember.values()) {
        await trx(MATCHES).insert({
          vendorId: review.vendorId, codeHash: hash(line.code), code: line.code,
          itemId: line.itemId, billingUnit: line.billingUnit, pack: line.pack,
          casesPerUnit: line.casesPerUnit, userId: this.cls.get('userId'),
        }).onConflict(['vendorId', 'codeHash']).merge();
      }
      await trx(SCANS).where({ id }).update({ review: JSON.stringify(review), version: version + 1 });
    });
    return this.get(id);
  }

  async options(kind: OptionKind, search = '') {
    await this.access();
    const sql = this.db();
    const ability = await this.auth.getAbilityForUser();
    const names = {
      item: ['items', 'name', 'Item'], charge: ['items', 'name', 'Item'],
      vendor: ['contacts', 'displayName', 'Vendor'], warehouse: ['warehouses', 'name', 'Warehouse'],
      branch: ['branches', 'name', 'Branch'], tax: ['tax_rates', 'name', 'TaxRate'],
    };
    if (!Object.prototype.hasOwnProperty.call(names, kind)) throw new BadRequestException('Invalid search type.');
    const [table, label, subject] = names[kind];
    if (!ability.can('View', subject)) return [];
    const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';
    const query = sql(table).orderBy(label).limit(50).select('id', { name: label });
    if (kind === 'item' || kind === 'charge') {
      query.where({ purchasable: true }).select({ description: 'purchaseDescription' }, 'code', { cost: 'costPrice', sellPrice: 'sellPrice' });
      if (kind === 'item') query.where({ type: 'inventory' });
      else query.whereNot({ type: 'inventory' }).whereNotNull('costAccountId');
      if (term) query.where(builder => builder.whereLike(label, `%${term}%`).orWhereLike('code', `%${term}%`));
    } else {
      if (kind === 'vendor') query.where({ contactService: 'vendor', active: true });
      if (kind === 'tax') query.where({ active: true }).select('rate');
      if (term) query.whereLike(label, `%${term}%`);
    }
    return query;
  }

  async preview(id: number) {
    await this.access(true);
    const row = await this.row(id);
    const { dto, ...preview } = await this.evaluate(row);
    return preview;
  }

  private async evaluate(row: any, sql: Knex = this.db(), lock = false) {
    const review = this.review(row);
    const issues: string[] = [];
    const prices: { itemId: number; name: string; oldCost: number; newCost: number; oldSell: number; newSell: number }[] = [];
    let billId: number = row.billId;
    let dto: CreateBillDto;
    if (row.status !== 'review') {
      return { ready: false, issues: ['This invoice is not waiting for review.'], prices, token: '', billId, dto };
    }
    const reconciled = reconcileInvoice(review);
    issues.push(...reconciled.issues);
    const vendorQuery = sql('contacts').where({ id: review.vendorId ?? 0, contactService: 'vendor' });
    const vendor = await (lock ? vendorQuery.forUpdate() : vendorQuery).first();
    const invoiceNo = normalized(review.invoiceNumber);
    const postedKey = hash(JSON.stringify([review.vendorId, invoiceNo]));
    if (vendor && invoiceNo) {
      const duplicate = await sql('bills').where({ vendorId: vendor.id }).where(builder =>
        builder.whereRaw('LOWER(TRIM(??)) = ?', ['referenceNo', invoiceNo])
          .orWhereRaw('LOWER(TRIM(??)) = ?', ['billNumber', invoiceNo]))
        .select('id').first();
      const posted = await sql(SCANS).where({ postedKey }).select('billId').first();
      billId = duplicate?.id ?? posted?.billId;
      if (billId) issues.push('This vendor invoice has already been recorded.');
    }
    if (!vendor || !vendor.active) issues.push('Choose an active vendor.');
    else if (vendor.currencyCode !== review.currency) issues.push('The invoice currency must match the vendor currency.');
    const meta = await this.tenancy.getTenantMetadata();
    if (meta?.baseCurrency === review.currency && Number(review.exchangeRate) !== 1) {
      issues.push('An invoice in the organization currency must use an exchange rate of 1.');
    }
    const settings = await this.settings();
    for (const [field, name, selection] of [
      ['warehouses', 'warehouse', review.warehouseId],
      ['branches', 'branch', review.branchId],
    ] as const) {
      if (!!settings.get({ group: 'features', key: field }) &&
        (!selection || !(await sql(field).where({ id: selection }).first()))) {
        issues.push(`Choose the ${name} for this purchase.`);
      }
    }
    const ids = [...new Set(reconciled.entries.map(entry => entry.itemId))].sort((a, b) => a - b);
    const itemQuery = sql<Item>('items').whereIn('id', ids).orderBy('id');
    const items = await (lock ? itemQuery.forUpdate() : itemQuery);
    const shippingId = Number(review.shipping) > 0 ? review.shippingItemId : null;
    for (const line of review.lines) {
      if (line.itemId && !items.some(item => item.id === line.itemId && item.type === 'inventory' && item.purchasable)) {
        issues.push('One or more inventory items are missing, invalid, or no longer purchasable.');
        break;
      }
    }
    if (shippingId && !items.some(item => item.id === shippingId && item.type !== 'inventory' && item.purchasable && item.costAccountId)) {
      issues.push('Choose a purchasable non-inventory item with a cost account for delivery.');
    }
    const tax = Number(review.tax) > 0 && review.taxRateId
      ? await sql('tax_rates').where({ id: review.taxRateId, active: true }).first() : undefined;
    const taxable = reconciled.entries.filter(entry => entry.taxRateId);
    const estimatedTax = taxable.reduce((sum, entry) => sum + entry.quantity * entry.rate * Number(tax?.rate) / 100, 0);
    if (Number(review.tax) > 0 && (!tax || Math.round(estimatedTax * 100) !== Math.round(Number(review.tax) * 100))) {
      issues.push('The selected purchase tax does not match the invoiced tax.');
    }
    const enabled = isAutoPricingEnabled(settings.get({ group: 'items', key: 'auto_increase_sell_price' }, true));
    if (!issues.length) {
      dto = {
        billNumber: `SCAN-${postedKey.slice(0, 24)}`, referenceNo: review.invoiceNumber,
        vendorId: review.vendorId, billDate: review.billDate as unknown as Date,
        dueDate: (review.dueDate || review.billDate) as unknown as Date,
        exchangeRate: Number(review.exchangeRate), open: true, isInclusiveTax: false,
        discount: Number(review.discount), discountType: 'amount' as CreateBillDto['discountType'],
        entries: reconciled.entries,
        ...(review.warehouseId ? { warehouseId: review.warehouseId } : {}),
        ...(review.branchId ? { branchId: review.branchId } : {}),
      };
      const costs = getBillItemCosts({ ...dto, entries: dto.entries } as unknown as Bill);
      for (const item of items) {
        if (item.type !== 'inventory' || !costs.has(item.id)) continue;
        const priorDate = invoiceDate(item.purchaseCostDate);
        const costPrice = priorDate && priorDate > review.billDate ? Number(item.costPrice) : costs.get(item.id);
        const updated = getItemPricingUpdate(item, { costPrice }, enabled);
        prices.push({
          itemId: item.id, name: item.name,
          oldCost: Number(item.costPrice), newCost: costPrice,
          oldSell: Number(item.sellPrice), newSell: Number(updated.sellPrice ?? item.sellPrice),
        });
      }
    }
    const token = dto && hash(JSON.stringify({
      id: row.id, version: row.version, dto, prices, enabled,
      current: items.map(item => [item.id, item.quantityOnHand, item.purchaseCostDate,
        item.purchaseCostBillId, item.markupPercentage, item.autoIncreaseSellPrice]),
      taxRate: tax?.rate,
    }));
    return { ready: !!dto, issues: [...new Set(issues)], token: token ?? '', prices, billId, dto, postedKey };
  }

  async post(id: number, version: number, previewToken: string) {
    await this.access(true);
    await this.db().transaction(async trx => {
      const row = await this.row(id, trx, true);
      if (row.status === 'posted') return;
      this.checkVersion(row, version);
      const evaluated = await this.evaluate(row, trx, true);
      if (!evaluated.ready) throw new ConflictException(evaluated.issues.join(' '));
      if (previewToken !== evaluated.token) throw new ConflictException('Invoice or item prices changed. Review the updated preview.');
      // This uses the bill command's transaction-aware entry point, including inventory and pricing.
      const bill = await this.createBill.createBill(evaluated.dto, trx);
      if (!bill.openedAt || Math.round(Number(bill.total) * 100) !== Math.round(Number(this.review(row).total) * 100)) {
        throw new ConflictException('Big Capital calculated a different bill total. Review charges and tax.');
      }
      const files = await trx(FILES).where({ scanId: id }).orderBy('id');
      for (const file of files) {
        const [documentId] = await trx('documents').insert({
          key: file.key, originName: file.name, mimeType: file.mime,
          size: file.size, createdAt: trx.fn.now(),
        });
        await trx('document_links').insert({
          documentId, modelRef: 'Bill', modelId: bill.id, createdAt: trx.fn.now(),
        });
      }
      await trx(SCANS).where({ id }).update({
        status: 'posted', postedKey: evaluated.postedKey, billId: bill.id, version: version + 1,
      });
    });
    return this.get(id);
  }

  async retry(id: number, version: number) {
    await this.access(true);
    const row = await this.db().transaction(async trx => {
      const row = await this.row(id, trx, true);
      this.checkVersion(row, version);
      if (!['failed', 'queued', 'processing', 'cancelled'].includes(row.status)) {
        throw new ConflictException('Only unfinished scans can be retried.');
      }
      await trx(SCANS).where({ id }).update({
        status: 'queued', version: version + 1, error: null, userId: this.cls.get('userId'),
      });
      return this.row(id, trx);
    });
    await this.enqueue(row);
    return this.get(id);
  }

  async cancel(id: number, version: number) {
    await this.access(true);
    await this.db().transaction(async trx => {
      const row = await this.row(id, trx, true);
      this.checkVersion(row, version);
      if (row.status === 'posted') throw new ConflictException('A recorded bill cannot be cancelled here.');
      await trx(SCANS).where({ id }).update({ status: 'cancelled', version: version + 1, error: null });
    });
    return this.get(id);
  }
}

function normalizeForStorage(review: Review): Review {
  const cleaned = normalizeReview(review);
  cleaned.warnings = review.warnings.map(warning => warning.slice(0, 500)).slice(0, 100);
  cleaned.lines.forEach((line, index) => {
    line.itemName = review.lines[index].itemName;
    line.attention = review.lines[index].attention;
  });
  return cleaned;
}
