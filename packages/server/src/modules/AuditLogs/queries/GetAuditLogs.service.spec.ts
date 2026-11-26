import { GetAuditLogsService } from './GetAuditLogs.service';
import { GetAuditLogsQueryDto } from '../dtos/GetAuditLogsQuery.dto';

describe('invoice audit history', () => {
  const logs = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    subject: index % 3 === 2 ? 'SaleEstimate' : 'SaleInvoice',
    subjectId: index % 3 === 0 ? 99 : 42,
    action: 'edit',
    createdAt: `2026-11-15 12:${String(59 - index).padStart(2, '0')}:00`,
  }));

  function service() {
    let rows = [...logs];
    // Replace only the tenant database boundary; the real service selects and pages rows.
    const query = {
      withGraphFetched: () => query,
      orderBy: () => query,
      whereIn: (key: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[key]));
        return query;
      },
      where: (key: string, value: unknown) => {
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      page: async (page: number, pageSize: number) => ({
        results: rows.slice(page * pageSize, (page + 1) * pageSize),
        total: rows.length,
      }),
    };
    return new GetAuditLogsService(
      (() => ({ query: () => query })) as never,
      { transform: async (rows) => rows } as never,
    );
  }

  it('excludes other invoice IDs and subjects before counting and paginating', async () => {
    const result = await service().getAuditLogs({
      subject: ['SaleInvoice'],
      subjectId: 42,
      page: 2,
      pageSize: 2,
    } as GetAuditLogsQueryDto);

    expect(result.data.map((row) => row.id)).toEqual([8, 11]);
    expect(result.pagination).toEqual({ total: 4, page: 2, pageSize: 2 });
  });

  it('preserves the subject-wide history when no subject ID is supplied', async () => {
    const result = await service().getAuditLogs({
      subject: ['SaleInvoice'],
      page: 2,
      pageSize: 2,
    });

    expect(result.data.map((row) => row.id)).toEqual([4, 5]);
    expect(result.pagination).toEqual({ total: 8, page: 2, pageSize: 2 });
  });
});
