import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAuditLogsQueryDto } from './GetAuditLogsQuery.dto';

describe('audit log subject ID query', () => {
  it('converts a positive integer query string', async () => {
    const dto = plainToInstance(GetAuditLogsQueryDto, { subjectId: '42' });

    expect((dto as any).subjectId).toBe(42);
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['0', '-1', '1.5', 'invalid'])(
    'rejects subjectId %p',
    async (subjectId) => {
      const dto = plainToInstance(GetAuditLogsQueryDto, { subjectId });

      expect((await validate(dto)).map((error) => error.property)).toContain(
        'subjectId',
      );
    },
  );

  it('allows an omitted subject ID', async () => {
    const dto = plainToInstance(GetAuditLogsQueryDto, {});

    expect((dto as any).subjectId).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});
