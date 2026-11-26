import {
  callbackFor,
  isPrivateActor,
  readTelegramAttachment,
  telegramPromptMatches,
} from './vendorTelegramProtocol';

describe('vendor Telegram protocol', () => {
  it('bounds opaque actions to Telegram’s 64 byte limit and expires old buttons', () => {
    const actions = {};
    const token = callbackFor(
      actions,
      { kind: 'record', scan: 8, version: 4, previewToken: 'server only' },
      100,
    );
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(Buffer.byteLength(token)).toBeLessThanOrEqual(64);
    expect(actions[token].action.previewToken).toBe('server only');
    expect(actions[token].until).toBeGreaterThan(100);
  });

  it('accepts the private sender only and rejects mismatched callback senders', () => {
    expect(isPrivateActor({ id: 123, type: 'private' }, { id: 123 })).toBe(
      true,
    );
    expect(isPrivateActor({ id: 123, type: 'private' }, { id: 124 })).toBe(
      false,
    );
    expect(isPrivateActor({ id: 123, type: 'group' }, { id: 123 })).toBe(false);
    expect(
      isPrivateActor({ id: 123, type: 'private' }, { id: 123, is_bot: true }),
    ).toBe(false);
  });

  it('takes the largest provided photo or a supported document and bounds file sizes', () => {
    expect(
      readTelegramAttachment({
        message_id: 1,
        photo: [
          { file_id: 'small', file_size: 500, width: 10, height: 10 },
          { file_id: 'large', file_size: 2000, width: 100, height: 100 },
        ],
      }),
    ).toEqual({
      messageId: 1,
      id: 'large',
      name: 'Photo 1.jpg',
      mime: 'image/jpeg',
      size: 2000,
    });
    expect(() =>
      readTelegramAttachment({
        message_id: 2,
        document: {
          file_id: 'pdf',
          file_name: 'sample.pdf',
          mime_type: 'application/pdf',
          file_size: 20 * 1024 * 1024 + 1,
        },
      }),
    ).toThrow('20 MB');
    expect(() =>
      readTelegramAttachment({
        message_id: 2,
        document: { file_id: 'script', mime_type: 'text/html' },
      }),
    ).toThrow('PDF');
  });

  it('drops replies attached to an unrelated prompt or another bot', () => {
    const prompt = { nonce: '0a7f', until: 200, action: { kind: 'field' } };
    expect(
      telegramPromptMatches(
        prompt,
        { message_id: 77, from: { id: 9 }, text: 'Cost?\n[0a7f]' },
        '9',
        100,
      ),
    ).toBe(true);
    expect(
      telegramPromptMatches(
        prompt,
        { message_id: 77, from: { id: 9 }, text: 'Cost?\n[old]' },
        '9',
        100,
      ),
    ).toBe(false);
    expect(
      telegramPromptMatches(
        prompt,
        { message_id: 77, from: { id: 8 }, text: 'Cost?\n[0a7f]' },
        '9',
        100,
      ),
    ).toBe(false);
    expect(
      telegramPromptMatches(
        prompt,
        { message_id: 77, from: { id: 9 }, text: 'Cost?\n[0a7f]' },
        '9',
        201,
      ),
    ).toBe(false);
  });
});
