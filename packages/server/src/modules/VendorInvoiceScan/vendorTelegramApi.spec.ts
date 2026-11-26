import { VendorTelegramApi } from './vendorTelegramApi';

const token = '123456789:sample_token_for_mock';

describe('Telegram vendor scan transport', () => {
  it('asks for only supported updates starting at a supplied durable cursor', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: [{ update_id: 19 }] })),
      );
    const api = new VendorTelegramApi(token, request);
    expect(await api.updates(19)).toEqual([{ update_id: 19 }]);
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/\/getUpdates$/),
      expect.objectContaining({
        redirect: 'error',
        body: expect.stringContaining('"offset":19'),
      }),
    );
  });

  it('never includes the bot token in surfaced network errors', async () => {
    const api = new VendorTelegramApi(
      token,
      jest.fn().mockRejectedValue(new Error(token)),
    );
    await expect(api.updates(0)).rejects.toMatchObject({
      message: 'Telegram request failed',
      status: 503,
    });
  });

  it('enforces the batch byte limit even without a content length header', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            result: { file_path: 'photos/file.jpg' },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
    const api = new VendorTelegramApi(token, request);
    await expect(
      api.download(
        { messageId: 1, id: 'file', name: 'file.jpg', mime: 'image/jpeg' },
        3,
      ),
    ).rejects.toThrow('exceeds the Telegram upload limit');
  });

  it('takes a validated private Telegram download and returns bytes', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            result: { file_path: 'documents/file.pdf' },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
    const api = new VendorTelegramApi(token, request);
    await expect(
      api.download(
        {
          messageId: 1,
          id: 'file',
          name: 'invoice.pdf',
          mime: 'application/pdf',
        },
        10,
      ),
    ).resolves.toEqual({
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from([1, 2, 3, 4]),
    });
    expect(request.mock.calls[1][0]).toContain('/documents/file.pdf');
  });
});
