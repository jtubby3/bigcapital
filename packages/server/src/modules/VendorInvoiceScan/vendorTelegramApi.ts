import {
  TELEGRAM_FILE_BYTES,
  TelegramAttachment,
  TelegramInputError,
  TelegramUpdate,
} from './vendorTelegramProtocol';

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export class TelegramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryMs = 0,
  ) {
    super('Telegram request failed');
  }
}

export class VendorTelegramApi {
  constructor(
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async call<T>(method: string, body: object, timeout = 10_000): Promise<T> {
    try {
      const response = await this.request(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        },
      );
      const result = (await response.json()) as TelegramResponse<T>;
      if (!response.ok || !result.ok) {
        throw new TelegramApiError(
          result.error_code || response.status,
          (result.parameters?.retry_after || 0) * 1000,
        );
      }
      return result.result;
    } catch (error) {
      if (error instanceof TelegramApiError) throw error;
      // Fetch errors can contain the URL and bot token.
      throw new TelegramApiError(503);
    }
  }

  updates(offset: number) {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout: 15,
        limit: 30,
        allowed_updates: ['message', 'callback_query'],
      },
      22_000,
    );
  }

  async download(file: TelegramAttachment, batchRemaining: number) {
    const max = Math.min(TELEGRAM_FILE_BYTES, batchRemaining);
    const info = await this.call<{ file_path?: string; file_size?: number }>(
      'getFile',
      {
        file_id: file.id,
      },
    ).catch((error) => {
      if (
        error instanceof TelegramApiError &&
        [400, 404].includes(error.status)
      ) {
        throw new TelegramInputError(
          'Telegram could not read this file. Resend it or use Big Capital for larger files.',
        );
      }
      throw error;
    });
    if (info.file_size > max || file.size > max) {
      throw new TelegramInputError(
        'This file or batch is too large for Telegram. Use Big Capital to upload it.',
      );
    }
    if (!info.file_path)
      throw new TelegramInputError(
        'Telegram no longer has this file. Please resend it.',
      );
    const segments = info.file_path.split('/');
    if (!segments.every((part) => /^[\w-][\w.-]*$/.test(part))) {
      throw new TelegramInputError(
        'Telegram returned an invalid file reference.',
      );
    }
    try {
      const response = await this.request(
        `https://api.telegram.org/file/bot${this.token}/${segments.map(encodeURIComponent).join('/')}`,
        { redirect: 'error', signal: AbortSignal.timeout(35_000) },
      );
      if (response.status === 404)
        throw new TelegramInputError(
          'Telegram no longer has this file. Please resend it.',
        );
      if (!response.ok || !response.body)
        throw new TelegramApiError(response.status);
      if (Number(response.headers.get('content-length')) > max) {
        await response.body.cancel();
        throw new TelegramInputError(
          'This file or batch is too large for Telegram. Use Big Capital to upload it.',
        );
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > max) {
            await reader.cancel();
            throw new TelegramInputError(
              'This file or batch exceeds the Telegram upload limit.',
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      if (!bytes)
        throw new TelegramInputError('The file is empty. Please resend it.');
      return {
        originalname: file.name,
        mimetype: file.mime,
        buffer: Buffer.concat(chunks, bytes),
      };
    } catch (error) {
      if (
        error instanceof TelegramApiError ||
        error instanceof TelegramInputError
      )
        throw error;
      throw new TelegramApiError(503);
    }
  }
}
