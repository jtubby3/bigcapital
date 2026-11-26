import { isStagingEnvironment } from '@/common/config/deployment-environment';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Knex } from 'knex';
import { ClsService } from 'nestjs-cls';
import { SystemKnexConnection } from '@/modules/System/SystemDB/SystemDB.constants';
import { TENANT_MODELS_INIT } from '@/modules/Tenancy/TenantModelsInitialize.module';
import { VendorInvoiceScanService } from './VendorInvoiceScan.service';
import { VendorTelegramApi, TelegramApiError } from './vendorTelegramApi';
import {
  callbackFor,
  isPrivateActor,
  readTelegramAttachment,
  TELEGRAM_BATCH_BYTES,
  TelegramAction,
  TelegramActions,
  TelegramAttachment,
  TelegramInputError,
  TelegramMessage,
  TelegramPrompt,
  telegramPromptMatches,
  TelegramUpdate,
} from './vendorTelegramProtocol';

const ACCOUNTS = 'vendor_telegram_accounts';
const POLLS = 'vendor_telegram_polls';
const SCAN_LIMIT = 10;
const PAGE_FILES_LIMIT = 10;
const PAIRING_MS = 5 * 60_000;
const ACTION_MAX = 30;
const OFFSET_MAX_AGE = 6 * 24 * 60 * 60_000;
const randomToken = () => randomBytes(16).toString('hex');
const hashCode = (code: string) =>
  createHash('sha256').update(code).digest('hex');
const compact = (value: unknown, length = 130) =>
  String(value ?? '')
    .replace(/[\s\x00-\x1f]+/g, ' ')
    .trim()
    .slice(0, length);

type Scan = Awaited<ReturnType<VendorInvoiceScanService['get']>>;
type Review = Scan['review'];
type OptionKind = Parameters<VendorInvoiceScanService['options']>[0];
type Identity = { botId: string; organizationId: string; userId: number };
type Owner = Identity & {
  chatId?: string;
  pairingHash?: string;
  pairingUntil?: number;
  state?: string;
};
type Batch = {
  key: string;
  album?: string;
  automatic?: boolean;
  files: TelegramAttachment[];
};
interface ChatState {
  actions: TelegramActions;
  prompt?: TelegramPrompt;
  batch?: Batch;
  pending: number[];
  recentAlbums?: string[];
}
type Button = { text: string; callback_data?: string; url?: string };
const blankState = (): ChatState => ({ actions: {}, pending: [] });
const accountKey = ({ botId, organizationId, userId }: Identity) => ({
  botId,
  organizationId,
  userId,
});
const unavailable = () =>
  new ForbiddenException(
    'This Telegram connection no longer has access to vendor scans.',
  );

const headerFields = {
  invoiceNumber: 'Invoice number',
  billDate: 'Invoice date',
  dueDate: 'Due date',
  currency: 'Currency',
  exchangeRate: 'Exchange rate',
  total: 'Invoice total',
  shipping: 'Delivery charges',
  tax: 'Tax',
  discount: 'Discount',
} as const;
const optionFields = {
  vendorId: { label: 'Vendor', kind: 'vendor' },
  warehouseId: { label: 'Warehouse', kind: 'warehouse' },
  branchId: { label: 'Branch', kind: 'branch' },
  shippingItemId: { label: 'Delivery charge item', kind: 'charge' },
  taxRateId: { label: 'Tax rate', kind: 'tax' },
} as const;

@Injectable()
export class VendorInvoiceTelegram
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VendorInvoiceTelegram.name);
  private readonly botId: string;
  private readonly api: VendorTelegramApi;
  private username?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private lastPollWarning = 0;

  constructor(
    @Inject(SystemKnexConnection) private readonly db: Knex,
    private readonly cls: ClsService,
    private readonly scans: VendorInvoiceScanService,
    private readonly config: ConfigService,
    @Inject(TENANT_MODELS_INIT)
    private readonly initializeTenantModels: () => Promise<boolean>,
  ) {
    const token = isStagingEnvironment()
      ? undefined
      : this.config.get<string>('VENDOR_SCAN_TELEGRAM_BOT_TOKEN')?.trim();
    if (token && /^\d{5,24}:[A-Za-z0-9_-]{20,100}$/.test(token)) {
      this.botId = token.split(':')[0];
      this.api = new VendorTelegramApi(token);
    } else if (token) {
      this.logger.warn(
        'Vendor scan Telegram token format is invalid. Bot is disabled.',
      );
    }
  }

  onApplicationBootstrap() {
    if (this.api) this.schedule(0);
  }

  onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async connection() {
    await this.scans.access();
    if (!this.api) return { enabled: false, connected: false };
    const owner = await this.db<Owner>(ACCOUNTS).where(this.identity()).first();
    return {
      enabled: true,
      connected: Boolean(owner?.chatId),
      botUsername: this.username,
    };
  }

  async pair() {
    await this.scans.access(true);
    if (!this.api)
      throw new BadRequestException(
        'Configure the Telegram bot in the local server first.',
      );
    const identity = this.identity();
    await this.requireMembership(this.db, identity);
    try {
      await this.identifyBot();
    } catch {
      throw new ServiceUnavailableException(
        'The local server could not connect to the Telegram bot.',
      );
    }
    const code = randomToken();
    const fields = {
      pairingHash: hashCode(code),
      pairingUntil: Date.now() + PAIRING_MS,
    };
    await this.db(ACCOUNTS)
      .insert({ ...identity, ...fields })
      .onConflict(['botId', 'organizationId', 'userId'])
      .merge(fields);
    return { code, botUsername: this.username };
  }

  async disconnect() {
    if (this.api) {
      const identity = this.identity();
      await this.requireMembership(this.db, identity);
      await this.db(ACCOUNTS).where(identity).delete();
    }
    return { connected: false };
  }

  private identity(): Identity {
    const organizationId = this.cls.get<string>('organizationId');
    const userId = Number(this.cls.get('userId'));
    if (!organizationId || !Number.isSafeInteger(userId) || userId <= 0)
      throw unavailable();
    return { botId: this.botId, organizationId, userId };
  }

  private async identifyBot() {
    if (this.username) return;
    const me = await this.api.call<{ id: number; username?: string }>(
      'getMe',
      {},
    );
    if (
      String(me.id) !== this.botId ||
      !/^[A-Za-z0-9_]{5,32}$/.test(me.username || '')
    ) {
      throw new TelegramApiError(401);
    }
    this.username = me.username;
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      let next = 750;
      try {
        await this.poll();
      } catch (error) {
        next =
          error instanceof TelegramApiError && error.retryMs
            ? Math.min(error.retryMs, 5 * 60_000)
            : 5_000;
        if (Date.now() - this.lastPollWarning > 60_000) {
          this.lastPollWarning = Date.now();
          this.logger.warn(
            'Vendor invoice Telegram polling failed. Check bot token, connectivity, and system migration.',
          );
        }
      } finally {
        this.schedule(next);
      }
    }, delay);
    this.timer.unref?.();
  }

  private async poll() {
    const key = `vendor-invoice-telegram:${this.botId}`;
    await this.db.transaction(async (lock) => {
      const [[row]] = await lock.raw('SELECT GET_LOCK(?, 0) AS acquired', [
        key,
      ]);
      if (Number(row.acquired) !== 1) return;
      try {
        await this.identifyBot();
        const cursor = await this.db(POLLS)
          .where({ botId: this.botId })
          .first();
        let next =
          cursor && Date.now() - Number(cursor.updatedAtMs) < OFFSET_MAX_AGE
            ? Number(cursor.nextUpdate)
            : 0;
        const updates = await this.api.updates(next);
        for (const update of updates.sort(
          (a, b) => a.update_id - b.update_id,
        )) {
          if (this.stopped) break;
          if (
            !Number.isSafeInteger(update.update_id) ||
            update.update_id < next
          )
            continue;
          await this.handleUpdate(update);
          next = update.update_id + 1;
          const fields = { nextUpdate: next, updatedAtMs: Date.now() };
          await this.db(POLLS)
            .insert({ botId: this.botId, ...fields })
            .onConflict('botId')
            .merge(fields);
        }
        if (!this.stopped) await this.notifyPending(updates.length === 0);
      } finally {
        await lock.raw('SELECT RELEASE_LOCK(?)', [key]);
      }
    });
  }

  private async requireMembership(db: Knex, owner: Identity) {
    const membership = await db('user_tenants as membership')
      .join('tenants as tenant', 'tenant.id', 'membership.tenantId')
      .join('users as usr', 'usr.id', 'membership.userId')
      .where({
        'membership.userId': owner.userId,
        'tenant.organizationId': owner.organizationId,
        'tenant.isInactive': false,
        'tenant.isDeleting': false,
        'usr.active': true,
      })
      .whereNull('usr.deletedAt')
      .select('membership.id')
      .first();
    if (!membership) throw unavailable();
  }

  private async asOwner<T>(
    db: Knex,
    owner: Identity,
    write: boolean,
    fn: () => Promise<T>,
  ) {
    await this.requireMembership(db, owner);
    return this.cls.run(async () => {
      this.cls.set('organizationId', owner.organizationId);
      this.cls.set('userId', owner.userId);
      await this.cls.resolveProxyProviders();
      await this.scans.access(write);
      await this.initializeTenantModels();
      return fn();
    });
  }

  private readState(owner: Owner): ChatState {
    return owner.state ? JSON.parse(owner.state) : blankState();
  }

  private persist(db: Knex, owner: Owner, state: ChatState) {
    return db(ACCOUNTS)
      .where(accountKey(owner))
      .update({
        state: JSON.stringify(state),
        hasPendingScans: state.pending.length > 0 || !!state.batch?.automatic,
      });
  }

  private async claimPairing(chatId: string, code: string) {
    const paired = await this.db.transaction(async (trx) => {
      const owner = await trx<Owner>(ACCOUNTS)
        .where({ botId: this.botId, pairingHash: hashCode(code) })
        .forUpdate()
        .first();
      if (!owner || Number(owner.pairingUntil) < Date.now()) return false;
      try {
        await this.asOwner(trx, owner, true, async () => undefined);
      } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
      }
      const other = await trx<Owner>(ACCOUNTS)
        .where({ botId: this.botId, chatId })
        .forUpdate()
        .first();
      if (
        other &&
        (other.userId !== owner.userId ||
          other.organizationId !== owner.organizationId)
      ) {
        throw new TelegramInputError(
          'Disconnect this chat in its current Big Capital organization before pairing another one.',
        );
      }
      await trx(ACCOUNTS).where(accountKey(owner)).update({
        chatId,
        pairingHash: null,
        pairingUntil: null,
        state: null,
        hasPendingScans: false,
      });
      return true;
    });
    await this.send(
      chatId,
      paired
        ? 'Connected to Big Capital. Send a vendor invoice PDF or photo. Use /pages for separate photos of one invoice, /done when all pages have arrived, and /scans to open reviews.'
        : 'This pairing code expired or was already used. Generate a fresh code in Big Capital.',
    );
  }

  private async send(
    chatId: string,
    text: string,
    buttons?: Button[][],
    reply = false,
  ) {
    await this.api.call('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 3900),
      protect_content: true,
      link_preview_options: { is_disabled: true },
      ...(buttons?.length
        ? { reply_markup: { inline_keyboard: buttons } }
        : reply
          ? { reply_markup: { force_reply: true } }
          : {}),
    });
  }

  private button(
    state: ChatState,
    text: string,
    action: TelegramAction,
  ): Button {
    for (const [token, record] of Object.entries(state.actions)) {
      if (record.until < Date.now()) delete state.actions[token];
    }
    while (Object.keys(state.actions).length >= ACTION_MAX) {
      delete state.actions[Object.keys(state.actions)[0]];
    }
    return {
      text: compact(text, 55),
      callback_data: callbackFor(state.actions, action),
    };
  }

  private async ask(
    chatId: string,
    state: ChatState,
    text: string,
    action: TelegramAction,
  ) {
    const nonce = randomToken().slice(0, 12);
    state.prompt = { nonce, action, until: Date.now() + 5 * 60_000 };
    await this.send(chatId, `${text}\n[${nonce}]`, undefined, true);
  }

  private async handleUpdate(update: TelegramUpdate) {
    const callback = update.callback_query;
    const msg = callback?.message || update.message;
    if (!msg || !isPrivateActor(msg.chat, callback?.from || msg.from)) return;
    const chatId = String(msg.chat.id);

    if (callback) {
      try {
        await this.api.call('answerCallbackQuery', {
          callback_query_id: callback.id,
        });
      } catch (error) {
        if (!(error instanceof TelegramApiError) || error.status !== 400)
          throw error;
      }
    }

    const start =
      !callback &&
      msg.text
        ?.trim()
        .match(/^\/(?:start|pair)(?:@[a-zA-Z0-9_]+)? ([a-f0-9]{32})$/);
    try {
      if (start) {
        await this.claimPairing(chatId, start[1]);
        return;
      }
      await this.db.transaction(async (trx) => {
        const owner = await trx<Owner>(ACCOUNTS)
          .where({ botId: this.botId, chatId })
          .forUpdate()
          .first();
        if (!owner) {
          if (!callback && /^\/(?:start|pair|help)\b/.test(msg.text || '')) {
            await this.send(
              chatId,
              'Pair this private chat from Purchases → Scan vendor invoices → Telegram in Big Capital.',
            );
          }
          return;
        }
        const state = this.readState(owner);
        await this.asOwner(trx, owner, false, async () => {
          if (callback) {
            const record = state.actions[callback.data];
            if (
              !/^[a-f0-9]{32}$/.test(callback.data || '') ||
              !record ||
              record.until < Date.now()
            ) {
              await this.send(
                chatId,
                'This button expired. Use /scans to reopen the review.',
              );
              return;
            }
            await this.handleAction(chatId, state, record.action);
            delete state.actions[callback.data];
          } else {
            await this.handleMessage(chatId, state, msg);
          }
        });
        await this.persist(trx, owner, state);
      });
    } catch (error) {
      if (error instanceof TelegramInputError) {
        await this.send(chatId, error.message);
      } else if (error instanceof HttpException && error.getStatus() < 500) {
        const status = error.getStatus();
        const messages = {
          400: 'Big Capital could not accept this invoice or edit. Check the file or values and try again.',
          403: 'This Telegram connection no longer has access to vendor scans.',
          404: 'This scan is no longer available. Use /scans to refresh.',
          409: 'This invoice or its prices changed. Use /scans to reopen it and review before recording.',
        };
        await this.send(
          chatId,
          messages[status] ||
            'Big Capital could not complete this action. Use /scans to refresh.',
        );
      } else if (
        error instanceof TelegramApiError &&
        [400, 403, 404].includes(error.status)
      ) {
        // Telegram may permanently reject a reply after the user blocks the bot.
        return;
      } else {
        throw error;
      }
    }
  }

  private async handleMessage(
    chatId: string,
    state: ChatState,
    message: TelegramMessage,
  ) {
    const text = message.text?.trim() || '';
    if (/^\/scans(?:@\w+)?$/i.test(text)) {
      await this.list(chatId, state);
      return;
    }
    if (/^\/pages(?:@\w+)?$/i.test(text)) {
      if (state.batch)
        throw new TelegramInputError(
          'A page collection is open. Use /done to scan it or /cancelpages to discard it.',
        );
      await this.scans.access(true);
      state.batch = { key: `message:${message.message_id}`, files: [] };
      await this.send(
        chatId,
        'Send each page of this invoice. Use /done when all pages have arrived.',
      );
      return;
    }
    if (/^\/done(?:@\w+)?$/i.test(text)) {
      await this.finishBatch(chatId, state);
      return;
    }
    if (/^\/cancelpages(?:@\w+)?$/i.test(text)) {
      delete state.batch;
      await this.send(
        chatId,
        'Page collection cleared. Send the next vendor invoice when ready.',
      );
      return;
    }
    if (
      telegramPromptMatches(state.prompt, message.reply_to_message, this.botId)
    ) {
      const prompt = state.prompt;
      delete state.prompt;
      await this.handleAction(chatId, state, prompt.action, text);
      return;
    }

    const file = readTelegramAttachment(message);
    if (file) {
      await this.scans.access(true);
      if (message.media_group_id || state.batch) {
        if (
          message.media_group_id &&
          state.recentAlbums?.includes(message.media_group_id)
        ) {
          throw new TelegramInputError(
            'A page arrived after this album was scanned. Check the review and resend the complete invoice if a page is missing.',
          );
        }
        if (state.batch && state.batch.album !== message.media_group_id) {
          throw new TelegramInputError(
            'Finish the current page collection with /done before adding another album or file.',
          );
        }
        state.batch ??= {
          key: `album:${message.media_group_id}`,
          album: message.media_group_id,
          automatic: true,
          files: [],
        };
        if (
          !state.batch.files.some(
            ({ messageId }) => messageId === file.messageId,
          )
        ) {
          if (state.batch.files.length >= PAGE_FILES_LIMIT) {
            throw new TelegramInputError(
              'This page collection is full. Use /done or upload the full invoice in Big Capital.',
            );
          }
          state.batch.files.push(file);
        }
        if (state.batch.files.length === 1) {
          await this.send(
            chatId,
            state.batch.automatic
              ? 'Invoice album received. I’ll scan it when the remaining photos arrive.'
              : 'Pages received. Use /done after all photos of this invoice arrive.',
          );
        }
      } else {
        await this.upload(
          chatId,
          state,
          [file],
          `message:${message.message_id}`,
        );
      }
      return;
    }

    if (/^\/(?:start|help)(?:@\w+)?$/i.test(text)) {
      await this.send(
        chatId,
        'Send a vendor invoice photo or PDF. Use /pages and /done for separate photos of the same invoice. Use /scans to review and record a purchase.',
      );
    } else if (message.reply_to_message) {
      await this.send(
        chatId,
        'This prompt expired. Use /scans to reopen the field.',
      );
    }
  }

  private async finishBatch(chatId: string, state: ChatState) {
    if (!state.batch?.files.length)
      throw new TelegramInputError('No pages are waiting to scan.');
    const collection = state.batch;
    await this.upload(
      chatId,
      state,
      collection.files.sort((a, b) => a.messageId - b.messageId),
      collection.key,
    );
    if (collection.album) {
      state.recentAlbums = [
        ...(state.recentAlbums || []),
        collection.album,
      ].slice(-10);
    }
    delete state.batch;
  }

  private async upload(
    chatId: string,
    state: ChatState,
    pages: TelegramAttachment[],
    key: string,
  ) {
    await this.scans.access(true);
    const files = [];
    let size = 0;
    for (const page of pages) {
      const file = await this.api.download(page, TELEGRAM_BATCH_BYTES - size);
      size += file.buffer.length;
      files.push(file);
    }
    const scan = await this.scans.upload(
      files,
      `telegram:${this.botId}:${chatId}:${key}`,
    );
    if (['queued', 'processing'].includes(scan.status)) {
      state.pending = [...new Set([...state.pending, scan.id])].slice(
        -SCAN_LIMIT,
      );
    }
    await this.showScan(chatId, state, scan);
  }

  private async flushAlbum(chatId: string, state: ChatState) {
    if (!state.batch?.automatic) return;
    try {
      await this.finishBatch(chatId, state);
    } catch (error) {
      if (
        !(error instanceof TelegramInputError) &&
        !(error instanceof HttpException && error.getStatus() === 400)
      )
        throw error;
      state.batch.automatic = false;
      await this.send(
        chatId,
        error instanceof TelegramInputError
          ? error.message
          : 'Big Capital could not scan these album pages. Use /cancelpages and resend the invoice.',
      );
    }
  }

  private async notifyPending(flushAlbums: boolean) {
    const owners = await this.db<Owner>(ACCOUNTS)
      .select('chatId')
      .where('botId', this.botId)
      .where('hasPendingScans', true)
      .whereNotNull('chatId')
      .limit(40);
    for (const { chatId } of owners) {
      try {
        await this.db.transaction(async (trx) => {
          const owner = await trx<Owner>(ACCOUNTS)
            .where({ botId: this.botId, chatId })
            .forUpdate()
            .first();
          if (!owner) return;
          const state = this.readState(owner);
          await this.asOwner(trx, owner, false, async () => {
            // Telegram sends an album as separate updates without an end marker.
            // A complete quiet long poll gives all its pages time to arrive.
            if (flushAlbums) await this.flushAlbum(chatId, state);
            for (const id of [...state.pending]) {
              try {
                const scan = await this.scans.get(id);
                if (['queued', 'processing'].includes(scan.status)) continue;
                await this.showScan(chatId, state, scan);
                state.pending = state.pending.filter(
                  (pending) => pending !== id,
                );
              } catch (error) {
                if (
                  !(error instanceof HttpException) ||
                  error.getStatus() !== 404
                )
                  throw error;
                state.pending = state.pending.filter(
                  (pending) => pending !== id,
                );
              }
            }
          });
          await this.persist(trx, owner, state);
        });
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          (error instanceof TelegramApiError &&
            [400, 403].includes(error.status))
        ) {
          await this.db(ACCOUNTS)
            .where({ botId: this.botId, chatId })
            .update({ hasPendingScans: false });
        } else {
          throw error;
        }
      }
    }
  }

  private async list(chatId: string, state: ChatState) {
    const scans = (await this.scans.list()).slice(0, SCAN_LIMIT);
    if (!scans.length) {
      await this.send(
        chatId,
        'No vendor scans yet. Send an invoice photo or PDF to start.',
      );
      return;
    }
    await this.send(
      chatId,
      'Choose a recent vendor invoice.',
      scans.map((scan) => [
        this.button(
          state,
          `#${scan.id} ${scan.status} · ${compact(scan.name, 32)}`,
          { kind: 'open', scan: scan.id },
        ),
      ]),
    );
  }

  private action(
    scan: Scan,
    kind: string,
    line?: number,
    extra?: Partial<TelegramAction>,
  ): TelegramAction {
    return { kind, scan: scan.id, version: scan.version, line, ...extra };
  }

  private continueInApp(scan: Scan): Button[] {
    const configured =
      this.config.get<string>('VENDOR_SCAN_WEB_URL') ||
      this.config.get<string>('app.baseUrl');
    try {
      const url = new URL('/bills/vendor-invoice-scans', configured);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return [];
      url.searchParams.set('scan', String(scan.id));
      if (!url.hostname.includes('.') && !url.hostname.includes(':')) return [];
      return [{ text: 'Continue in Big Capital', url: url.href }];
    } catch {
      return [];
    }
  }

  private async showScan(
    chatId: string,
    state: ChatState,
    scan: Scan,
    line = 0,
  ) {
    if (scan.status !== 'review') {
      const messages: Record<Exclude<Scan['status'], 'review'>, string> = {
        queued:
          'The invoice is queued. I’ll send the review when the scan is ready.',
        processing:
          'Reading the invoice. I’ll send the review when it is ready.',
        failed: `The scan failed. ${compact(scan.error, 240)}`,
        posted: `Purchase recorded as Big Capital bill #${scan.billId}.`,
        cancelled: 'This scan was cancelled.',
      };
      const buttons: Button[][] = [];
      if (scan.status === 'failed') {
        buttons.push([
          this.button(state, 'Retry scan', this.action(scan, 'retry')),
        ]);
      }
      if (['queued', 'processing', 'failed'].includes(scan.status)) {
        buttons.push([
          this.button(state, 'Cancel scan', this.action(scan, 'cancelAsk')),
        ]);
      }
      const app = this.continueInApp(scan);
      if (app.length) buttons.push(app);
      await this.send(
        chatId,
        `Scan #${scan.id}\n${messages[scan.status]}`,
        buttons,
      );
      return;
    }

    const { review } = scan;
    const i = Math.min(Math.max(line, 0), review.lines.length - 1);
    const item = review.lines[i];
    const label = `${compact(review.vendorName || 'Vendor invoice')} ${compact(review.invoiceNumber, 55)} · scan #${scan.id}`;
    const buttons: Button[][] = [];
    let detail = 'No product lines were recognized.';
    if (item) {
      const factor = Number(item.casesPerUnit);
      const cases =
        item.shipped && factor > 0
          ? (Number(item.shipped) * factor).toFixed(3).replace(/\.?0+$/, '')
          : 'check conversion';
      const caseCost =
        item.unitPrice && factor > 0
          ? (Number(item.unitPrice) / factor).toFixed(5).replace(/0{1,3}$/, '')
          : 'check conversion';
      detail = [
        `Product ${i + 1} of ${review.lines.length}`,
        `Vendor line: ${compact(item.code, 45)} ${compact(item.description, 240)}`,
        item.pack && `Pack: ${compact(item.pack)}`,
        `Your item: ${compact(item.itemName || 'Choose an item')} ${item.confirmed ? '(confirmed)' : ''}`,
        `Shipped: ${compact(item.shipped || '?', 20)} ${compact(item.billingUnit, 20)} · ${cases} cases`,
        `Cost per case: ${compact(review.currency, 3)} ${caseCost}`,
        item.attention && `Review: ${compact(item.attention, 250)}`,
      ]
        .filter(Boolean)
        .join('\n');
      buttons.push(
        [
          this.button(state, 'Confirm item', this.action(scan, 'confirm', i)),
          this.button(
            state,
            'Change item',
            this.action(scan, 'search', i, { field: 'item' }),
          ),
        ],
        [
          this.button(
            state,
            'Edit quantity/cost',
            this.action(scan, 'amounts', i),
          ),
          this.button(
            state,
            'Edit vendor line',
            this.action(scan, 'lineFields', i),
          ),
        ],
      );
      if (item.confirmed && item.itemId && item.code && review.vendorId) {
        buttons.push([
          this.button(
            state,
            'Remember this match',
            this.action(scan, 'remember', i),
          ),
        ]);
      }
      const nav: Button[] = [];
      if (i > 0)
        nav.push(this.button(state, 'Back', this.action(scan, 'line', i - 1)));
      if (i + 1 < review.lines.length)
        nav.push(this.button(state, 'Next', this.action(scan, 'line', i + 1)));
      if (nav.length) buttons.push(nav);
    }
    buttons.push(
      [
        this.button(state, 'Invoice details', this.action(scan, 'header', i)),
        this.button(state, 'Review purchase', this.action(scan, 'summary', 0)),
      ],
      [
        this.button(state, 'Add product line', this.action(scan, 'add', i)),
        this.button(state, 'Cancel scan', this.action(scan, 'cancelAsk', i)),
      ],
    );
    const app = this.continueInApp(scan);
    if (app.length) buttons.push(app);
    await this.send(chatId, `${label}\n\n${detail}`, buttons);
  }

  private async showHeader(
    chatId: string,
    state: ChatState,
    scan: Scan,
    index: number,
  ) {
    const { review } = scan;
    const labels = Object.entries(headerFields).map(
      ([field, label]) => `${label}: ${compact(review[field], 85) || 'unset'}`,
    );
    const buttons = Object.entries(headerFields).map(([field, label]) => [
      this.button(state, label, this.action(scan, 'field', index, { field })),
    ]);
    for (const [field, option] of Object.entries(optionFields)) {
      const value =
        field === 'vendorId'
          ? review.vendorName
          : review[field] && `#${review[field]}`;
      labels.push(`${option.label}: ${compact(value, 85) || 'unset'}`);
      buttons.push([
        this.button(
          state,
          option.label,
          this.action(scan, 'search', index, { field }),
        ),
      ]);
    }
    buttons.push([
      this.button(
        state,
        'Back to product lines',
        this.action(scan, 'line', index),
      ),
    ]);
    await this.send(
      chatId,
      `Scan #${scan.id}\n\n${labels.join('\n')}\n\nChoose a field to edit.`,
      buttons,
    );
  }

  private async showSummary(
    chatId: string,
    state: ChatState,
    scan: Scan,
    page: number,
  ) {
    const preview = await this.scans.preview(scan.id);
    const { review } = scan;
    const size = 7;
    const maxPage = Math.max(0, Math.ceil(review.lines.length / size) - 1);
    const current = Math.min(Math.max(page || 0, 0), maxPage);
    const lines = review.lines
      .slice(current * size, (current + 1) * size)
      .map((item) => {
        const factor = Number(item.casesPerUnit);
        const cases =
          item.shipped && factor > 0
            ? (Number(item.shipped) * factor).toFixed(3)
            : '?';
        const price = preview.prices.find(
          (entry) => entry.itemId === item.itemId,
        );
        return [
          `${compact(item.itemName || item.description, 80)} · ${cases} cases`,
          price &&
            `  Cost ${price.oldCost} → ${price.newCost} · Sell ${price.oldSell} → ${price.newSell}`,
        ]
          .filter(Boolean)
          .join('\n');
      });
    const information = [
      `${compact(review.vendorName || 'Choose vendor')} · ${compact(review.invoiceNumber, 55) || 'No invoice number'}`,
      `Invoice date: ${compact(review.billDate, 15) || 'unset'} · Due: ${compact(review.dueDate, 15) || 'unset'}`,
      `Warehouse: ${review.warehouseId ? `#${review.warehouseId}` : 'default'} · Branch: ${review.branchId ? `#${review.branchId}` : 'default'}`,
      `Delivery ${compact(review.shipping, 20)} · Tax ${compact(review.tax, 20)} · Discount ${compact(review.discount, 20)}`,
      `Total: ${compact(review.currency, 3)} ${compact(review.total, 20)}`,
      `Stock previously recorded: ${review.receiptChecked ? 'No, confirmed' : 'Check required'}`,
      `Product lines (${current + 1}/${maxPage + 1})`,
      ...lines,
      ...review.warnings
        .slice(0, 3)
        .map((warning) => `Scan warning: ${compact(warning, 150)}`),
      ...(preview.issues.length
        ? [
            'Review required:',
            ...preview.issues
              .slice(0, 6)
              .map((issue) => `• ${compact(issue, 150)}`),
            ...(preview.issues.length > 6
              ? [`• ${preview.issues.length - 6} more to check in Big Capital`]
              : []),
          ]
        : []),
    ];
    const buttons: Button[][] = [];
    const nav: Button[] = [];
    if (current > 0)
      nav.push(
        this.button(
          state,
          'Previous products',
          this.action(scan, 'summary', current - 1),
        ),
      );
    if (current < maxPage)
      nav.push(
        this.button(
          state,
          'More products',
          this.action(scan, 'summary', current + 1),
        ),
      );
    if (nav.length) buttons.push(nav);
    if (!review.receiptChecked) {
      buttons.push([
        this.button(
          state,
          'Stock was not recorded',
          this.action(scan, 'receipt', current),
        ),
      ]);
    }
    if (preview.ready) {
      buttons.push([
        this.button(
          state,
          'Confirm and record purchase',
          this.action(scan, 'record', current, { previewToken: preview.token }),
        ),
      ]);
    }
    buttons.push([
      this.button(
        state,
        'Product lines',
        this.action(scan, 'line', current * size),
      ),
      this.button(
        state,
        'Edit invoice details',
        this.action(scan, 'header', current * size),
      ),
    ]);
    const app = this.continueInApp(scan);
    if (app.length) buttons.push(app);
    await this.send(chatId, information.join('\n'), buttons);
  }

  private async handleAction(
    chatId: string,
    state: ChatState,
    action: TelegramAction,
    reply?: string,
  ) {
    const scan = await this.scans.get(action.scan);
    const i = Math.max(0, action.line ?? 0);
    if (action.kind === 'open' || scan.status === 'posted') {
      await this.showScan(chatId, state, scan, i);
      return;
    }
    if (scan.version !== action.version) {
      await this.send(
        chatId,
        'This review changed. Check the current version before continuing.',
      );
      await this.showScan(chatId, state, scan, i);
      return;
    }
    if (action.kind === 'cancelAsk') {
      await this.send(
        chatId,
        'Cancel this scan and discard the unrecorded review?',
        [
          [
            this.button(
              state,
              'Cancel this scan',
              this.action(scan, 'cancel', i),
            ),
            this.button(state, 'Keep reviewing', this.action(scan, 'open', i)),
          ],
        ],
      );
      return;
    }
    if (action.kind === 'cancel') {
      await this.showScan(
        chatId,
        state,
        await this.scans.cancel(scan.id, scan.version),
        i,
      );
      return;
    }
    if (action.kind === 'retry') {
      const retried = await this.scans.retry(scan.id, scan.version);
      state.pending = [...new Set([...state.pending, scan.id])].slice(
        -SCAN_LIMIT,
      );
      await this.showScan(chatId, state, retried, i);
      return;
    }
    if (scan.status !== 'review') {
      await this.showScan(chatId, state, scan, i);
      return;
    }
    if (action.kind === 'line') return this.showScan(chatId, state, scan, i);
    if (action.kind === 'summary')
      return this.showSummary(chatId, state, scan, i);
    if (action.kind === 'header')
      return this.showHeader(chatId, state, scan, i);
    if (action.kind === 'record') {
      const result = await this.scans.post(
        scan.id,
        scan.version,
        action.previewToken,
      );
      await this.showScan(chatId, state, result, i);
      return;
    }

    await this.scans.access(true);
    const { review } = scan;
    const item = review.lines[i];
    switch (action.kind) {
      case 'search':
        return this.search(chatId, state, scan, action, reply);
      case 'field':
        if (!Object.prototype.hasOwnProperty.call(headerFields, action.field))
          return;
        if (reply === undefined) {
          const label = headerFields[action.field];
          const syntax = action.field.endsWith('Date') ? ' (YYYY-MM-DD)' : '';
          return this.ask(
            chatId,
            state,
            `Enter ${label.toLowerCase()}${syntax}. Current: ${compact(review[action.field], 80) || 'unset'}.`,
            action,
          );
        }
        const entered = reply === '-' ? '' : reply.trim();
        if (
          action.field === 'invoiceNumber' &&
          review.invoiceNumber !== entered
        )
          review.receiptChecked = false;
        review[action.field] = entered;
        if (action.field === 'currency')
          review.currency = review.currency.toUpperCase();
        await this.showHeader(
          chatId,
          state,
          await this.scans.save(scan.id, scan.version, review),
          i,
        );
        return;
      case 'select':
        if (action.field === 'item' && item) {
          if (item.itemId !== action.item) {
            item.confirmed = false;
            if (item.itemId) item.casesPerUnit = '';
          }
          item.itemId = action.item;
          item.itemName = action.name;
          item.remember = false;
        } else if (
          Object.prototype.hasOwnProperty.call(optionFields, action.field)
        ) {
          if (action.field === 'vendorId' && review.vendorId !== action.item) {
            review.vendorName = action.name;
            review.receiptChecked = false;
            for (const line of review.lines) {
              line.itemId = null;
              line.itemName = undefined;
              line.confirmed = false;
              line.remember = false;
              line.casesPerUnit = '';
            }
          }
          review[action.field] = action.item;
        } else return;
        break;
      case 'confirm':
      case 'remember':
        if (!item?.itemId)
          throw new TelegramInputError(
            'Choose an existing inventory item first.',
          );
        if (
          action.kind === 'remember' &&
          (!item.code || !review.vendorId || !item.confirmed)
        ) {
          throw new TelegramInputError(
            'Confirm the vendor and item before remembering this match.',
          );
        }
        item.confirmed = true;
        item.remember = action.kind === 'remember';
        break;
      case 'receipt': {
        review.receiptChecked = true;
        const saved = await this.scans.save(scan.id, scan.version, review);
        await this.showSummary(chatId, state, saved, i);
        return;
      }
      case 'amounts':
        if (!item) return;
        if (reply === undefined) {
          return this.ask(
            chatId,
            state,
            `Reply with 4 values separated by spaces: shipped units, billed price per unit, line total, cases per unit. Use - for an unchanged value.\nCurrent: ${[item.shipped, item.unitPrice, item.amount, item.casesPerUnit].map((value) => compact(value, 25) || '-').join('  ')}.`,
            action,
          );
        }
        {
          const parts = reply.split(/\s+/);
          if (
            parts.length !== 4 ||
            parts.some((part) => !/^(?:-|\d{1,8}(?:\.\d{1,8})?)$/.test(part))
          ) {
            throw new TelegramInputError(
              'Enter four decimal values or dashes, separated by spaces. Reply to the same prompt to try again.',
            );
          }
          [item.shipped, item.unitPrice, item.amount, item.casesPerUnit] =
            parts.map((part, ix) =>
              part === '-'
                ? [
                    item.shipped,
                    item.unitPrice,
                    item.amount,
                    item.casesPerUnit,
                  ][ix]
                : part,
            );
          item.confirmed = false;
          item.remember = false;
        }
        break;
      case 'lineFields': {
        if (!item) return;
        const fields = [
          ['code', 'Vendor code'],
          ['description', 'Vendor text'],
          ['billingUnit', 'Billed unit'],
          ['pack', 'Pack'],
        ];
        const buttons = fields.map(([field, label]) => [
          this.button(
            state,
            label,
            this.action(scan, 'lineField', i, { field }),
          ),
        ]);
        buttons.push([
          this.button(
            state,
            'Remove product line',
            this.action(scan, 'removeAsk', i),
          ),
        ]);
        buttons.push([
          this.button(state, 'Back', this.action(scan, 'line', i)),
        ]);
        await this.send(
          chatId,
          fields
            .map(
              ([field, label]) =>
                `${label}: ${compact(item[field], 110) || 'unset'}`,
            )
            .join('\n'),
          buttons,
        );
        return;
      }
      case 'lineField':
        if (
          !item ||
          !['code', 'description', 'billingUnit', 'pack'].includes(action.field)
        )
          return;
        if (reply === undefined) {
          return this.ask(
            chatId,
            state,
            'Reply with the value as shown on the invoice, or - to clear it.',
            action,
          );
        }
        item[action.field] = reply === '-' ? '' : reply.trim();
        item.confirmed = false;
        item.remember = false;
        if (['billingUnit', 'pack'].includes(action.field))
          item.casesPerUnit = '';
        break;
      case 'add':
        review.lines.push({
          code: '',
          description: '',
          billingUnit: '',
          pack: '',
          shipped: '',
          unitPrice: '',
          amount: '',
          page: 0,
          fileId: 0,
          confirmed: false,
          remember: false,
          casesPerUnit: '',
        });
        await this.showScan(
          chatId,
          state,
          await this.scans.save(scan.id, scan.version, review),
          review.lines.length - 1,
        );
        return;
      case 'removeAsk':
        if (!item) return;
        await this.send(chatId, `Remove line ${i + 1} from this review?`, [
          [
            this.button(state, 'Remove line', this.action(scan, 'remove', i)),
            this.button(state, 'Keep line', this.action(scan, 'line', i)),
          ],
        ]);
        return;
      case 'remove':
        if (!item) return;
        review.lines.splice(i, 1);
        break;
      default:
        return;
    }
    const saved = await this.scans.save(scan.id, scan.version, review);
    if (action.kind === 'remember')
      await this.send(chatId, 'Vendor match remembered.');
    await this.showScan(chatId, state, saved, i);
  }

  private async search(
    chatId: string,
    state: ChatState,
    scan: Scan,
    action: TelegramAction,
    reply?: string,
  ) {
    const option =
      action.field === 'item'
        ? { label: 'Inventory item', kind: 'item' }
        : optionFields[action.field];
    if (!option) return;
    if (reply === undefined) {
      await this.ask(
        chatId,
        state,
        `Reply with part of the ${option.label.toLowerCase()} name or code. Send - to list the first results.`,
        action,
      );
      return;
    }
    const choices = (
      await this.scans.options(
        option.kind as OptionKind,
        reply === '-' ? '' : compact(reply, 80),
      )
    ).slice(0, 10);
    const buttons = choices.map((choice) => [
      this.button(state, compact(choice.name, 55), {
        ...action,
        kind: 'select',
        item: Number(choice.id),
        name: choice.name,
      }),
    ]);
    buttons.push([
      this.button(state, 'Search again', action),
      this.button(state, 'Back', {
        ...action,
        kind: action.field === 'item' ? 'line' : 'header',
      }),
    ]);
    await this.send(
      chatId,
      choices.length
        ? `Choose the ${option.label.toLowerCase()}.`
        : 'No matching results.',
      buttons,
    );
  }
}
