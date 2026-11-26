import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Knex } from 'knex';
import { ClsService } from 'nestjs-cls';
import { createHash, randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { TENANCY_DB_CONNECTION } from '../Tenancy/TenancyDB/TenancyDB.constants';
import { TenancyContext } from '../Tenancy/TenancyContext.service';
import { S3_CLIENT } from '../S3/S3.module';
import { SaleInvoice } from '../SaleInvoices/models/SaleInvoice';
import { TenantModelProxy } from '../System/models/TenantBaseModel';
import { AuthorizationGuard } from '../Roles/Authorization.guard';
import { LocalPackingScan } from './LocalPackingScan';
import { analyzePages, matchSlip } from './packingSlipMatching';
import {
  InvoiceCandidate,
  MatchResult,
  PackingSlipSelection,
  ScanPage,
} from './packingSlip.types';
import {
  assertMailSize,
  invoiceFingerprint,
  requireVersion,
  validateGroups,
  validateScanFile,
  validateSelections,
  MAX_SCAN_BYTES,
} from './packingSlipValidation';
import { requirePackingAccess } from './PackingSlips.guard';

const BATCH = 'packing_scan_batches',
  FILE = 'packing_scan_files',
  SLIP = 'packing_scan_slips';
const json = (value: any) =>
  typeof value === 'string' ? JSON.parse(value) : value;
const unpack = (row: any) =>
  row && {
    ...row,
    pages: json(row.pages),
    evidence: json(row.evidence),
    pageData: json(row.pageData),
  };
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
const date = (value: any) =>
  value
    ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10)
    : '';

@Injectable()
export class PackingSlipsService {
  constructor(
    @Inject(TENANCY_DB_CONNECTION) private readonly db: () => Knex,
    @Inject(SaleInvoice.name)
    private readonly invoices: TenantModelProxy<typeof SaleInvoice>,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
    private readonly tenancy: TenancyContext,
    private readonly authorization: AuthorizationGuard,
    private readonly native: LocalPackingScan,
    @InjectQueue('packing-slip-scan') private readonly queue: Queue,
    @InjectQueue('SendSaleInvoiceQueue') private readonly mailQueue: Queue,
  ) {}
  async access(write = false, remove = false) {
    requirePackingAccess(
      await this.authorization.getAbilityForUser(),
      write,
      remove,
    );
  }
  async health() {
    await this.access();
    return this.native.health();
  }
  async mailJobStatus(id: string) {
    const ability = await this.authorization.getAbilityForUser();
    if (!ability.can('Edit', 'SaleInvoice'))
      throw new ForbiddenException('Invoice edit permission required.');
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      throw new NotFoundException('Email job not found.');
    const job = await this.mailQueue.getJob(id);
    if (
      !job ||
      job.data.organizationId !== this.cls.get('organizationId') ||
      job.data.userId !== this.cls.get('userId')
    )
      throw new NotFoundException('Email job not found.');
    const state = await job.getState();
    return {
      state,
      error:
        state === 'failed'
          ? 'Invoice email failed. Review the invoice and packing slip selection before sending again.'
          : undefined,
    };
  }
  async createBatch() {
    await this.access(true);
    const [id] = await this.db()(BATCH).insert({
      userId: this.cls.get('userId'),
    });
    return this.batch(id);
  }
  async listBatches() {
    await this.access();
    const rows=await this.db()(BATCH).select('*',this.db().raw('UNIX_TIMESTAMP(??) as ??',['createdAt','createdAtEpoch'])).orderBy('id','desc').limit(50);
    return rows.map(row=>this.batchView(row));
  }
  private async batch(id: number, trx?: Knex.Transaction, lock = false) {
    const sql=trx||this.db();
    const q=sql(BATCH).select('*',sql.raw('UNIX_TIMESTAMP(??) as ??',['createdAt','createdAtEpoch'])).where({id});
    if (lock) q.forUpdate();
    const row = await q.first();
    if (!row) throw new NotFoundException('Scan batch not found.');
    return this.batchView(row);
  }
  private batchView(row:any){
    const {createdAtEpoch,...value}=row;
    return {...value,cancelled:!!value.cancelled,createdAt:new Date(Number(createdAtEpoch)*1000).toISOString()};
  }
  private async file(id: number, trx?: Knex.Transaction, lock = false) {
    const q = (trx || this.db())(FILE).where({ id });
    if (lock) q.forUpdate();
    const row = await q.first();
    if (!row) throw new NotFoundException('Scan file not found.');
    return unpack(row);
  }
  private async slip(id: number, trx?: Knex.Transaction, lock = false) {
    const q = (trx || this.db())(SLIP).where({ id });
    if (lock) q.forUpdate();
    const row = await q.first();
    if (!row) throw new NotFoundException('Packing slip not found.');
    return unpack(row);
  }
  async getBatch(id: number) {
    await this.access();
    const batch = await this.batch(id);
    const files = await this.db()(FILE).where({ batchId: id }).orderBy('id');
    const slips = await this.db()(SLIP)
      .where({ batchId: id, superseded: false })
      .orderBy('id');
    const targets = await Promise.all(
      [...new Set(slips.map((s) => s.invoiceId).filter(Boolean))].map((id) =>
        this.loadInvoice(id),
      ),
    );
    const invoiceMap = new Map(targets.filter(Boolean).map((i) => [i.id, i]));
    const auto = slips.some(
      (s) => s.status === 'attached' && s.confirmedBy === 'automatic',
    )
      ? await this.loadInvoices()
      : undefined;
    return {
      ...batch,
      files: files.map(({ id, name, status, error, pageCount }) => ({
        id,
        name,
        status,
        error,
        pageCount,
      })),
      slips: await Promise.all(
        slips.map(async (raw) => {
          const slip = unpack(raw),
            invoice = invoiceMap.get(slip.invoiceId),
            file = files.find((f) => f.id === slip.fileId);
          const stale =
            slip.status === 'attached' &&
            !(await this.isCurrent(slip, invoice, undefined, auto));
          return {
            id: slip.id,
            fileId: slip.fileId,
            name: this.filename(invoice, slip),
            pages: slip.pages,
            status: stale ? 'stale' : slip.status,
            version: slip.version,
            invoiceId: slip.invoiceId,
            invoiceNo: invoice?.invoiceNo,
            customerName: invoice?.customerName,
            evidence: slip.evidence,
            error: stale
              ? 'Invoice or attachment changed. Review and confirm again.'
              : slip.error,
            sourceName: file?.name,
          };
        }),
      ),
    };
  }
  private async put(bytes: Buffer, mime: string): Promise<string> {
    const organization = this.cls.get<string>('organizationId');
    if (!organization)
      throw new BadRequestException('Tenant context required.');
    const key = `${organization}/packing-slips/${randomUUID()}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.get('s3.bucket'),
        Key: key,
        Body: bytes,
        ContentType: mime,
        ACL: 'private',
      }),
    );
    return key;
  }
  private async removeObject(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.get('s3.bucket'),
        Key: key,
      }),
    );
  }
  private async read(key: string, max = MAX_SCAN_BYTES): Promise<Buffer> {
    if (!key?.startsWith(`${this.cls.get('organizationId')}/packing-slips/`))
      throw new BadRequestException('Invalid scan storage reference.');
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.get('s3.bucket'), Key: key }),
    );
    if (result.ContentLength > max)
      throw new BadRequestException('Scan object exceeds the permitted size.');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of result.Body as any) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > max) {
        (result.Body as any)?.destroy?.();
        throw new BadRequestException(
          'Scan object exceeds the permitted size.',
        );
      }
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  }
  async addFile(batchId: number, file: Express.Multer.File) {
    await this.access(true);
    if (!file) throw new BadRequestException('Choose a scan file.');
    const bytes = file.buffer,
      mime = validateScanFile(bytes, file.originalname),
      contentHash = hash(bytes);
    let key: string;
    try {
      const result = await this.db().transaction(async (trx) => {
        const batch = await this.batch(batchId, trx, true);
        if (batch.cancelled)
          throw new ConflictException(
            'This batch is cancelled. Create a new batch to upload scans.',
          );
        const existing = await trx(FILE)
          .where({ batchId, contentHash })
          .first();
        if (existing) return existing;
        const count = await trx(FILE)
          .where({ batchId })
          .count({ total: 'id' })
          .first();
        if (Number(count.total) >= 20)
          throw new BadRequestException('A batch supports up to 20 files.');
        const previous = await trx(FILE)
          .where({ contentHash, status: 'ready' })
          .first();
        key = previous?.key || (await this.put(bytes, mime));
        const [id] = await trx(FILE).insert({
          batchId,
          userId: this.cls.get('userId'),
          key,
          mime,
          contentHash,
          name: file.originalname,
          status: previous ? 'duplicate' : 'queued',
          error: previous
            ? `Already scanned in batch ${previous.batchId}. Open that batch to review its matches.`
            : null,
          pageCount: previous?.pageCount || 0,
        });
        return trx(FILE).where({ id }).first();
      });
      if (result.status === 'queued') await this.enqueue(result.id);
      return {
        id: result.id,
        name: result.name,
        status: result.status,
        error: result.error,
      };
    } catch (error) {
      if (key && !(await this.db()(FILE).where({ key }).first()))
        await this.removeObject(key).catch(() => undefined);
      throw error;
    }
  }
  private jobId(organizationId: string, file: any) {
    return `packing-${hash(organizationId)}-${file.id}-${file.attempt}`;
  }
  private async enqueue(fileId: number) {
    const file = await this.file(fileId),
      organizationId = this.cls.get<string>('organizationId');
    const batch = await this.batch(file.batchId);
    const userId = file.userId ?? batch.userId;
    if (batch.cancelled || !['queued', 'processing'].includes(file.status))
      return;
    try {
      await this.queue.add(
        'scan',
        { organizationId, userId, fileId, attempt: file.attempt },
        {
          jobId: this.jobId(organizationId, file),
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      await this.db()(FILE)
        .where({ id: fileId, attempt: file.attempt, status: file.status })
        .update({
          status: 'failed',
          error: 'Could not queue scan. Resume this file.',
        });
      throw error;
    }
  }
  async retry(fileId: number) {
    await this.access(true);
    let enqueue = false;
    await this.db().transaction(async (trx) => {
      const file = await this.file(fileId, trx, true),
        batch = await this.batch(file.batchId, trx);
      if (batch.cancelled)
        throw new ConflictException('Cancelled batches cannot be retried.');
      if (
        !['queued', 'processing', 'failed', 'cancelled'].includes(file.status)
      )
        throw new ConflictException('This file has already finished.');
      const job = await this.queue.getJob(
        this.jobId(this.cls.get('organizationId'), file),
      );
      const state = job ? await job.getState() : undefined;
      if (
        [
          'active',
          'waiting',
          'delayed',
          'waiting-children',
          'prioritized',
        ].includes(state)
      )
        return;
      const attempt =
        !job && ['queued', 'processing'].includes(file.status)
          ? file.attempt
          : file.attempt + 1;
      await trx(FILE)
        .where({ id: fileId, attempt: file.attempt, status: file.status })
        .update({ status: 'queued', attempt, error: null });
      enqueue = true;
    });
    if (enqueue) await this.enqueue(fileId);
    return { status: 'queued' };
  }
  async cancel(id: number) {
    await this.access(true);
    await this.db().transaction(async (trx) => {
      await this.batch(id, trx, true);
      await trx(BATCH).where({ id }).update({ cancelled: true });
      await trx(FILE).where({ batchId: id, status: 'queued' }).update({
        status: 'cancelled',
        error: 'Batch cancelled. Existing attachments are preserved.',
      });
    });
    return { status: 'cancelled' };
  }
  async processFile(fileId: number, attempt?: number) {
    const deadline = Date.now() + 20 * 60 * 1000;
    const file = await this.file(fileId);
    if (
      (attempt !== undefined && file.attempt !== attempt) ||
      ['ready', 'duplicate', 'cancelled'].includes(file.status)
    )
      return;
    const expected = { id: fileId, attempt: file.attempt };
    try {
      await this.access(true);
      if ((await this.batch(file.batchId)).cancelled) {
        await this.db()(FILE).where(expected).update({ status: 'cancelled' });
        return;
      }
      await this.db()(FILE)
        .where(expected)
        .update({ status: 'processing', error: null });
      const source = await this.read(file.key),
        pages: ScanPage[] =
          file.pageData || (await this.native.scan(source, file.mime));
      if (!pages.length || pages.length > 200)
        throw new BadRequestException(
          'Each file must contain between 1 and 200 pages.',
        );
      await this.db().transaction(async (trx) => {
        await this.batch(file.batchId, trx, true);
        const others = await trx(FILE)
          .where({ batchId: file.batchId })
          .whereNot({ id: fileId })
          .sum({ total: 'pageCount' })
          .first();
        if (Number(others.total || 0) + pages.length > 500)
          throw new BadRequestException(
            'Batch exceeds 500 pages. Split the scan into another batch.',
          );
        await trx(FILE)
          .where(expected)
          .update({ pageData: JSON.stringify(pages), pageCount: pages.length });
      });
      const candidates = (await this.loadInvoices()) || [];
      const proposals = analyzePages(pages, candidates);
      validateGroups(
        proposals.map((p) => p.pages),
        pages.length,
      );
      await this.db().transaction(async (trx) => {
        const active = await this.file(fileId, trx, true);
        if (active.attempt !== file.attempt)
          throw new ConflictException('Scan attempt superseded.');
        const existing = await trx(SLIP).where({ fileId }).first();
        if (existing) return;
        for (const proposal of proposals)
          await trx(SLIP).insert({
            batchId: file.batchId,
            fileId,
            pages: JSON.stringify(proposal.pages),
            evidence: JSON.stringify(proposal.result),
            identityHash: hash(
              `${file.contentHash}:${proposal.pages.join(',')}`,
            ),
            status: 'review',
          });
      });
      const slips = await this.db()(SLIP)
        .where({ fileId, status: 'review', superseded: false })
        .orderBy('id');
      for (const raw of slips) {
        if (Date.now() > deadline)
          throw new BadRequestException(
            'Scan processing time limit reached. Retry continues the unfinished slips.',
          );
        if ((await this.batch(file.batchId)).cancelled) {
          await this.db()(FILE).where(expected).update({
            status: 'cancelled',
            error: 'Batch cancelled. Review unfinished slips separately.',
          });
          return;
        }
        if ((await this.file(fileId)).attempt !== file.attempt) return;
        const slip = unpack(raw);
        if (
          slip.version === 1 &&
          !slip.confirmedBy &&
          slip.evidence.verified &&
          slip.evidence.invoiceId
        )
          try {
            await this.confirm(
              slip.id,
              slip.evidence.invoiceId,
              slip.version,
              false,
              undefined,
              file.attempt,
            );
          } catch (error) {
            await this.db()(SLIP)
              .where({ id: slip.id, version: slip.version, status: 'review' })
              .update({
                error:
                  'Automatic attachment could not be completed. Review this slip.',
              });
          }
      }
      await this.db()(FILE)
        .where(expected)
        .update({ status: 'ready', error: null });
    } catch (error) {
      await this.db()(FILE)
        .where(expected)
        .update({
          status: 'failed',
          error:
            error instanceof BadRequestException ||
            error instanceof ConflictException ||
            /^(?:Invalid (?:PDF document|image data|single-page image)|Encrypted or locked PDFs are not supported|PDF must contain between 1 and 200 pages|Image exceeds 40 million decoded pixels|PDF page dimensions are invalid)\.$/.test(
              error.message || '',
            )
              ? error.message
              : 'Scan processing failed. Retry the file or check local recognition availability.',
        });
      throw error;
    }
  }
  async candidates(search = '') {
    await this.access();
    const query = this.invoices()
      .query()
      .joinRelated('customer')
      .select('sales_invoices.*')
      .withGraphFetched('[customer, entries.item]')
      .orderBy('sales_invoices.id', 'desc')
      .limit(50);
    const text = search.trim();
    if (text)
      query.where((builder) =>
        builder
          .where('sales_invoices.invoiceNo', 'like', `%${text}%`)
          .orWhere('sales_invoices.referenceNo', 'like', `%${text}%`)
          .orWhere('customer.displayName', 'like', `%${text}%`),
      );
    return (await query).map((row) => {
      const value = this.mapInvoice(row);
      return { ...value, fingerprint: invoiceFingerprint(value) };
    });
  }
  private async loadInvoice(
    id: number,
    trx?: Knex.Transaction,
  ): Promise<InvoiceCandidate | undefined> {
    const row = await this.invoices()
      .query(trx)
      .findById(id)
      .withGraphFetched('[customer, entries.item]');
    return row ? this.mapInvoice(row) : undefined;
  }
  private async loadInvoices(
    trx?: Knex.Transaction,
    lock = false,
  ): Promise<InvoiceCandidate[] | null> {
    const query = this.invoices()
      .query(trx)
      .withGraphFetched('[customer, entries.item]')
      .orderBy('id', 'desc')
      .limit(5001);
    if (lock) query.forShare();
    const rows = await query;
    return rows.length > 5000 ? null : rows.map((row) => this.mapInvoice(row));
  }
  private mapInvoice(i: SaleInvoice): InvoiceCandidate {
    const c = i.customer;
    const address =
      i.shippingAddressText ??
      (c
        ? [
            c.shippingAddress1,
            c.shippingAddress2,
            c.shippingAddressCity,
            c.shippingAddressState,
            c.shippingAddressPostcode,
            c.shippingAddressCountry,
          ]
            .filter(Boolean)
            .join('\n')
        : '');
    return {
      id: i.id,
      invoiceNo: i.invoiceNo || '',
      customerId: i.customerId,
      customerName: c?.displayName || '',
      shippingAddress: address,
      referenceNo: i.referenceNo || '',
      trackingNo: i.trackingNo || '',
      shippingDate: date(i.shippingDate),
      invoiceDate: date(i.invoiceDate),
      eligible: !!i.deliveredAt,
      entries: (i.entries || []).map((e) => ({
        code: e.item?.code || '',
        name: e.item?.name || '',
        description: e.description || '',
        quantity: Number(e.quantity),
        unit: (e.item as any)?.unit || undefined,
      })),
    };
  }

  private filename(invoice: InvoiceCandidate | undefined, slip: any) {
    return `Packing-slip-${(invoice?.invoiceNo || 'review').replace(/[^a-zA-Z0-9._-]/g, '_')}-${slip.id}.pdf`;
  }
  private async isCurrent(
    slip: any,
    invoice: InvoiceCandidate | undefined,
    trx?: Knex.Transaction,
    candidates?: InvoiceCandidate[] | null,
  ): Promise<boolean> {
    if (
      slip.status !== 'attached' ||
      !invoice?.eligible ||
      slip.invoiceFingerprint !== invoiceFingerprint(invoice) ||
      !slip.documentId
    )
      return false;
    const sql = trx || this.db();
    const link = await sql('document_links')
      .where({
        documentId: slip.documentId,
        modelRef: 'SaleInvoice',
        modelId: invoice.id,
      })
      .first();
    const doc = await sql('documents').where({ id: slip.documentId }).first();
    if (!link || !doc) return false;
    if (slip.confirmedBy === 'automatic') {
      const all =
        candidates === undefined ? await this.loadInvoices(trx) : candidates;
      if (!all) return false;
      const file = await this.file(slip.fileId, trx);
      const result = matchSlip(
        file.pageData.filter((p) => slip.pages.includes(p.page)),
        all,
      );
      return result.verified && result.invoiceId === invoice.id;
    }
    return true;
  }
  async confirm(
    id: number,
    invoiceId: number,
    version: number,
    manual = true,
    expectedFingerprint?: string,
    expectedAttempt?: number,
  ) {
    await this.access(true);
    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1)
      throw new BadRequestException('Choose an existing invoice.');
    const current = await this.slip(id),
      file = await this.file(current.fileId);
    const buffer = await this.native.extract(
      await this.read(file.key),
      file.mime,
      current.pages,
    );
    if (buffer.length > MAX_SCAN_BYTES)
      throw new BadRequestException(
        'Derived slip exceeds the 25 MiB attachment limit.',
      );
    let newKey: string;
    try {
      return await this.db().transaction(async (trx) => {
        const lockedFile = await this.file(file.id, trx, true);
        if (
          !manual &&
          expectedAttempt !== undefined &&
          lockedFile.attempt !== expectedAttempt
        )
          throw new ConflictException('Scan attempt superseded.');
        const slip = await this.slip(id, trx, true);
        requireVersion(slip.version, version);
        await this.access(true, !!slip.documentId);
        if (slip.superseded)
          throw new ConflictException(
            'Page groups changed. Refresh before confirming.',
          );
        const candidateRow = await this.invoices()
          .query(trx)
          .findById(invoiceId)
          .forUpdate();
        if (!candidateRow)
          throw new NotFoundException('Invoice no longer exists.');
        const invoice = await this.loadInvoice(invoiceId, trx);
        const invoices = manual
          ? [invoice].filter(Boolean)
          : await this.loadInvoices(trx);
        if (!invoices)
          throw new ConflictException(
            'Automatic verification is unavailable. Review this slip manually.',
          );
        if (manual && expectedFingerprint !== invoiceFingerprint(invoice))
          throw new ConflictException(
            'Invoice details changed. Reload the candidate before confirming.',
          );
        if (!invoice?.eligible)
          throw new ConflictException(
            'Choose a saved, finalized invoice. Draft invoices cannot receive packing slips.',
          );
        const evidence = matchSlip(
          (file.pageData as ScanPage[]).filter((p) =>
            slip.pages.includes(p.page),
          ),
          invoices,
        );
        if (!manual && (!evidence.verified || evidence.invoiceId !== invoiceId))
          throw new ConflictException(
            'Invoice verification changed. Review this slip.',
          );
        if (!manual && (await this.batch(file.batchId, trx)).cancelled)
          throw new ConflictException('Batch cancelled.');
        const duplicate = await trx(SLIP)
          .where({ activeKey: slip.identityHash })
          .whereNot({ id })
          .first();
        if (duplicate) {
          await trx(SLIP)
            .where({ id })
            .update({
              status: 'duplicate',
              version: slip.version + 1,
              error: `These pages are already attached as packing slip ${duplicate.id}.`,
              evidence: JSON.stringify(evidence),
            });
          return { status: 'duplicate' };
        }
        newKey = await this.put(buffer, 'application/pdf');
        if (slip.documentId)
          await trx('document_links')
            .where({
              documentId: slip.documentId,
              modelRef: 'SaleInvoice',
              modelId: slip.invoiceId,
            })
            .delete();
        const [documentId] = await trx('documents').insert({
          key: newKey,
          originName: this.filename(invoice, slip),
          mimeType: 'application/pdf',
          size: buffer.length,
          createdAt: trx.fn.now(),
        });
        await trx('document_links').insert({
          documentId,
          modelRef: 'SaleInvoice',
          modelId: invoiceId,
          createdAt: trx.fn.now(),
        });
        await trx(SLIP)
          .where({ id })
          .update({
            status: 'attached',
            invoiceId,
            documentId,
            invoiceFingerprint: invoiceFingerprint(invoice),
            activeKey: slip.identityHash,
            version: slip.version + 1,
            evidence: JSON.stringify({
              ...evidence,
              manualConfirmation: manual,
            }),
            confirmedBy: manual ? 'manual' : 'automatic',
            userId: this.cls.get('userId'),
            error: null,
          });
        return { status: 'attached', id, version: slip.version + 1 };
      });
    } catch (error) {
      if (newKey) await this.removeObject(newKey).catch(() => undefined);
      throw error;
    }
  }
  async detach(id: number, version: number, ignore = false) {
    await this.access(true, true);
    const current = await this.slip(id);
    await this.db().transaction(async (trx) => {
      await this.file(current.fileId, trx, true);
      const slip = await this.slip(id, trx, true);
      requireVersion(slip.version, version);
      if (slip.superseded)
        throw new ConflictException('Page groups changed. Refresh first.');
      if (slip.documentId)
        await trx('document_links')
          .where({
            documentId: slip.documentId,
            modelRef: 'SaleInvoice',
            modelId: slip.invoiceId,
          })
          .delete();
      await trx(SLIP)
        .where({ id })
        .update({
          status: ignore ? 'ignored' : 'review',
          version: slip.version + 1,
          activeKey: null,
          invoiceId: null,
          documentId: null,
          invoiceFingerprint: null,
          error: null,
        });
    });
    return { status: ignore ? 'ignored' : 'review' };
  }
  async regroup(fileId: number, groups: unknown, versions: unknown) {
    await this.access(true, true);
    const expected = validateSelections(versions, 200);
    await this.db().transaction(async (trx) => {
      const file = await this.file(fileId, trx, true);
      if (!['ready', 'cancelled'].includes(file.status) || !file.pageData)
        throw new ConflictException(
          'Wait for scan processing to finish before regrouping.',
        );
      const partition = validateGroups(groups, file.pageCount);
      const slips = await trx(SLIP)
        .where({ fileId, superseded: false })
        .forUpdate();
      if (
        expected.length !== slips.length ||
        slips.some(
          (s) => expected.find((e) => e.id === s.id)?.version !== s.version,
        )
      )
        throw new ConflictException(
          'Page groups changed. Refresh before regrouping.',
        );
      for (const slip of slips) {
        if (slip.documentId)
          await trx('document_links')
            .where({
              documentId: slip.documentId,
              modelRef: 'SaleInvoice',
              modelId: slip.invoiceId,
            })
            .delete();
        await trx(SLIP)
          .where({ id: slip.id })
          .update({
            superseded: true,
            status: 'ignored',
            version: slip.version + 1,
            activeKey: null,
            invoiceId: null,
            documentId: null,
          });
      }
      const invoices = (await this.loadInvoices(trx)) || [];
      for (const pages of partition) {
        const evidence = matchSlip(
          file.pageData.filter((p) => pages.includes(p.page)),
          invoices,
        );
        await trx(SLIP).insert({
          batchId: file.batchId,
          fileId,
          pages: JSON.stringify(pages),
          evidence: JSON.stringify(evidence),
          identityHash: hash(`${file.contentHash}:${pages.join(',')}`),
          version: 2,
          confirmedBy: 'regrouped',
          status: 'review',
        });
      }
    });
    return { status: 'review' };
  }
  async preview(fileId: number, page: number) {
    await this.access();
    const file = await this.file(fileId);
    if (!Number.isSafeInteger(page) || page < 1 || page > file.pageCount)
      throw new BadRequestException('Source page not found.');
    return this.native.preview(await this.read(file.key), file.mime, page);
  }
  async pdf(id: number, version?: number) {
    await this.access();
    const slip = await this.slip(id);
    if (version !== undefined) requireVersion(slip.version, version);
    if (slip.superseded)
      throw new ConflictException('Page groups changed. Refresh the preview.');
    if (slip.status === 'attached') {
      const invoice = await this.loadInvoice(slip.invoiceId);
      if (!(await this.isCurrent(slip, invoice)))
        throw new ConflictException(
          'Invoice or attachment changed. Review before downloading.',
        );
      const doc = await this.db()('documents')
        .where({ id: slip.documentId })
        .first();
      return this.read(doc.key);
    }
    const file = await this.file(slip.fileId);
    return this.native.extract(
      await this.read(file.key),
      file.mime,
      slip.pages,
    );
  }
  async listInvoice(invoiceId: number) {
    await this.access();
    const rows = await this.db()(SLIP)
      .where({ invoiceId, status: 'attached', superseded: false })
      .orderBy('id');
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (!rows.length) return [];
    const auto = rows.some((s) => s.confirmedBy === 'automatic')
      ? await this.loadInvoices()
      : undefined;
    return Promise.all(
      rows.map(async (raw) => {
        const slip = unpack(raw),
          valid = await this.isCurrent(slip, invoice, undefined, auto);
        return {
          id: slip.id,
          batchId: slip.batchId,
          version: slip.version,
          name: this.filename(invoice, slip),
          pages: slip.pages,
          status: valid ? 'attached' : 'stale',
          evidence: slip.evidence,
          error: valid
            ? null
            : 'Invoice, matching evidence or attachment changed. Review and confirm again.',
        };
      }),
    );
  }
  private async accessMail(hasSlips: boolean) {
    const ability = await this.authorization.getAbilityForUser();
    if (
      !ability.can('Edit', 'SaleInvoice') ||
      !ability.can('View', 'SaleInvoice')
    )
      throw new ForbiddenException(
        'Invoice email requires current invoice edit permission.',
      );
    if (hasSlips) requirePackingAccess(ability);
  }
  async withMailLock<T>(
    invoiceId: number,
    value: unknown,
    send: () => Promise<T>,
  ): Promise<T> {
    const selections = validateSelections(value);
    await this.accessMail(selections.length > 0);
    if (!selections.length) return send();
    const rows = await this.db()(SLIP).whereIn(
      'id',
      selections.map((s) => s.id),
    );
    if (rows.length !== selections.length)
      throw new ConflictException('A selected packing slip no longer exists.');
    return this.db().transaction(async (trx) => {
      // Match the file/slip/invoice lock order used by corrections; keep it until send finishes.
      await trx(FILE)
        .whereIn('id', [...new Set(rows.map((s) => s.fileId))])
        .orderBy('id')
        .forUpdate();
      const locked = await trx(SLIP)
        .whereIn(
          'id',
          selections.map((s) => s.id),
        )
        .orderBy('id')
        .forUpdate();
      await this.invoices().query(trx).findById(invoiceId).forUpdate();
      for (const slip of locked) {
        requireVersion(
          slip.version,
          selections.find((s) => s.id === slip.id).version,
        );
        if (
          slip.invoiceId !== invoiceId ||
          slip.status !== 'attached' ||
          slip.superseded
        )
          throw new ConflictException(
            'A selected packing slip changed. Review before sending.',
          );
        await trx('documents').where({ id: slip.documentId }).forUpdate();
        await trx('document_links')
          .where({
            documentId: slip.documentId,
            modelRef: 'SaleInvoice',
            modelId: invoiceId,
          })
          .forUpdate();
      }
      const invoice = await this.loadInvoice(invoiceId, trx);
      const auto = locked.some((s) => s.confirmedBy === 'automatic')
        ? await this.loadInvoices(trx, true)
        : undefined;
      for (const slip of locked) {
        if (!(await this.isCurrent(slip, invoice, trx, auto)))
          throw new ConflictException(
            'A selected packing slip changed. Review before sending.',
          );
      }
      return send();
    });
  }
  async snapshotForMail(
    invoiceId: number,
    value?: unknown,
  ): Promise<PackingSlipSelection[]> {
    const selections =
      value === undefined
        ? (
            await this.db()(SLIP).where({
              invoiceId,
              status: 'attached',
              superseded: false,
            })
          ).map((s) => ({ id: s.id, version: s.version }))
        : validateSelections(value);
    validateSelections(selections);
    if (!selections.length) return [];
    await this.mailAttachments(invoiceId, selections);
    return selections;
  }
  async mailAttachments(
    invoiceId: number,
    value: unknown,
  ): Promise<{ filename: string; content: Buffer }[]> {
    const selections = validateSelections(value);
    if (!selections.length) return [];
    await this.accessMail(true);
    const invoice = await this.loadInvoice(invoiceId);
    let auto: InvoiceCandidate[] | null | undefined;
    const attachments = [];
    for (const selection of selections) {
      const slip = await this.slip(selection.id);
      requireVersion(slip.version, selection.version);
      if (slip.confirmedBy === 'automatic' && auto === undefined)
        auto = await this.loadInvoices();
      if (
        slip.invoiceId !== invoiceId ||
        slip.superseded ||
        !(await this.isCurrent(slip, invoice, undefined, auto))
      )
        throw new ConflictException(
          'A selected packing slip changed or is no longer attached to this invoice. Review before sending.',
        );
      const doc = await this.db()('documents')
        .where({ id: slip.documentId })
        .first();
      attachments.push({
        filename: this.filename(invoice, slip),
        content: await this.read(doc.key),
      });
      assertMailSize(attachments.map((a) => a.content));
    }
    return attachments;
  }
}
