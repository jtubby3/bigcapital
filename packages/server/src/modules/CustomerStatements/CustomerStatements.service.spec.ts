import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { CustomerStatementsService } from './CustomerStatements.service';
import { StatementSnapshot } from './CustomerStatements.types';

const snapshot = {
  customerId: 1,
  email: 'client@example.com',
  statementDate: '2026-01-31',
  statementType: 'balance-forward',
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
} as StatementSnapshot;

function setup() {
  const row = {
    id: 3,
    customerId: 1,
    email: snapshot.email,
    status: 'saved',
    snapshot,
  };
  const query = {
    findById: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockResolvedValue(row),
    whereIn: jest.fn().mockResolvedValue([row]),
    patchAndFetchById: jest
      .fn()
      .mockImplementation((_id, patch) =>
        Promise.resolve({ ...row, ...patch }),
      ),
  };
  const trx = {};
  const database = {
    transaction: jest
      .fn()
      .mockImplementation(async (callback) => callback(trx)),
  };
  const pdf = { pdf: jest.fn().mockResolvedValue(Buffer.from('PDF')) };
  const mail = {
    send: jest
      .fn()
      .mockResolvedValue({ accepted: ['client@example.com'], rejected: [] }),
  };
  const statementModel = () => ({ query: jest.fn().mockReturnValue(query) });
  const service = new CustomerStatementsService(
    () => database as never,
    statementModel as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    pdf as never,
    mail as never,
    undefined,
    undefined,
    undefined,
  );
  return { service, row, query, pdf, mail, database };
}

describe('saved statement delivery', () => {
  it('generates and sends only saved immutable snapshot, then marks sent', async () => {
    const { service, row, query, pdf, mail } = setup();
    const result = await service.send(3);
    expect(pdf.pdf).toHaveBeenCalledWith([row.snapshot]);
    expect(mail.send.mock.calls[0][0].to).toBe('client@example.com');
    expect(query.forUpdate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('sent');
  });
  it('never marks a failed delivery sent', async () => {
    const { service, mail, query } = setup();
    mail.send.mockRejectedValue(new Error('SMTP unavailable'));
    await expect(service.send(3)).rejects.toBeInstanceOf(BadGatewayException);
    expect(query.patchAndFetchById).not.toHaveBeenCalled();
  });
  it('treats SMTP rejection as failure even when transporter resolves', async () => {
    const { service, mail, query } = setup();
    mail.send.mockResolvedValue({
      accepted: [],
      rejected: ['client@example.com'],
    });
    await expect(service.send(3)).rejects.toBeInstanceOf(BadGatewayException);
    expect(query.patchAndFetchById).not.toHaveBeenCalled();
  });
  it('makes repeat send on a sent statement a no-op', async () => {
    const { service, row, pdf, mail } = setup();
    row.status = 'sent';
    expect((await service.send(3)).status).toBe('sent');
    expect(pdf.pdf).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
  it('rejects missing email before PDF or delivery', async () => {
    const { service, row, pdf, mail } = setup();
    row.email = '';
    await expect(service.send(3)).rejects.toThrow('email');
    expect(pdf.pdf).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
  it('returns not-found for another tenant statement id', async () => {
    const { service, query, mail } = setup();
    query.forUpdate.mockResolvedValue(undefined);
    await expect(service.send(3)).rejects.toBeInstanceOf(NotFoundException);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('saved batch PDF', () => {
  it('uses only requested immutable snapshots, in request order', async () => {
    const { service, row, query, pdf } = setup();
    const second = {
      ...row,
      id: 4,
      snapshot: { ...row.snapshot, customerId: 2 },
    };
    query.whereIn.mockResolvedValue([row, second]);
    await service.savedPdf({ ids: [4, 3, 4] });
    expect(query.whereIn).toHaveBeenCalledWith('id', [4, 3]);
    expect(pdf.pdf).toHaveBeenCalledWith([second.snapshot, row.snapshot]);
  });
  it('rejects a missing or other-tenant id before generating PDF', async () => {
    const { service, pdf } = setup();
    await expect(service.savedPdf({ ids: [3, 99] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(pdf.pdf).not.toHaveBeenCalled();
  });
  it('rejects empty, oversized and invalid saved selections', async () => {
    const { service } = setup();
    await expect(service.savedPdf({ ids: [] })).rejects.toThrow();
    await expect(service.savedPdf({ ids: [0] })).rejects.toThrow();
    await expect(
      service.savedPdf({ ids: Array.from({ length: 101 }, (_, i) => i + 1) }),
    ).rejects.toThrow();
  });
});
