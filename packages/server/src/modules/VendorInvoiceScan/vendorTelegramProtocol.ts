import { randomBytes } from 'node:crypto';

export const TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;
export const TELEGRAM_BATCH_BYTES = 50 * 1024 * 1024;
const ACTION_LIFETIME = 15 * 60_000;

export class TelegramInputError extends Error {}

interface TelegramActor {
  id: number;
  is_bot?: boolean;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramFile {
  file_id: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramActor;
  chat?: TelegramChat;
  text?: string;
  media_group_id?: string;
  photo?: Array<TelegramFile & { width: number; height: number }>;
  document?: TelegramFile & { file_name?: string; mime_type?: string };
  reply_to_message?: Pick<TelegramMessage, 'message_id' | 'from' | 'text'>;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramActor;
    message?: TelegramMessage;
  };
}

export interface TelegramAttachment {
  messageId: number;
  id: string;
  name: string;
  mime: string;
  size?: number;
}

export interface TelegramAction {
  kind: string;
  scan?: number;
  version?: number;
  line?: number;
  field?: string;
  item?: number;
  name?: string;
  previewToken?: string;
  batch?: string;
}

export interface TimedAction {
  until: number;
  action: TelegramAction;
}

export type TelegramActions = Record<string, TimedAction>;
export type TelegramPrompt = TimedAction & { nonce: string };

export function callbackFor(
  actions: TelegramActions,
  action: TelegramAction,
  now = Date.now(),
): string {
  const token = randomBytes(16).toString('hex');
  actions[token] = { action, until: now + ACTION_LIFETIME };
  return token;
}

export function telegramPromptMatches(
  prompt: TelegramPrompt | undefined,
  message: TelegramMessage['reply_to_message'],
  botId: string,
  now = Date.now(),
): boolean {
  return Boolean(
    prompt &&
      prompt.until >= now &&
      message &&
      String(message.from?.id) === botId &&
      message.text?.endsWith(`\n[${prompt.nonce}]`),
  );
}

export function isPrivateActor(chat?: TelegramChat, sender?: TelegramActor) {
  return (
    chat?.type === 'private' &&
    Number.isSafeInteger(chat.id) &&
    chat.id > 0 &&
    sender?.id === chat.id &&
    !sender.is_bot
  );
}

export function readTelegramAttachment(
  message: TelegramMessage,
): TelegramAttachment | undefined {
  const photo = message.photo?.length
    ? message.photo.reduce((largest, current) =>
        current.width * current.height > largest.width * largest.height
          ? current
          : largest,
      )
    : undefined;
  const file = message.document || photo;
  if (!file) return;
  if (file.file_size && file.file_size > TELEGRAM_FILE_BYTES) {
    throw new TelegramInputError(
      'Telegram can download up to 20 MB per file. Upload this file in Big Capital.',
    );
  }
  const mime = message.document ? message.document.mime_type : 'image/jpeg';
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) {
    throw new TelegramInputError('Send a PDF, JPEG, or PNG.');
  }
  return {
    messageId: message.message_id,
    id: file.file_id,
    name: (
      message.document?.file_name || `Photo ${message.message_id}.jpg`
    ).slice(0, 200),
    mime,
    ...(file.file_size != null ? { size: file.file_size } : {}),
  };
}
