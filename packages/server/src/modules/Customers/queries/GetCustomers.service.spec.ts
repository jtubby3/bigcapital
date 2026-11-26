import knex from 'knex';
import { GetCustomers } from './GetCustomers.service';

describe('customers overview query', () => {
  it('combines overview IDs with existing filters before applying pagination', async () => {
    const connection = knex({ client: 'mysql' });
    const builder = connection('contacts');
    let sql: ReturnType<typeof builder.toSQL>;
    const model = () => ({
      query: () => ({
        onBuild: (build) => {
          build({
            where: (column, operator, value) =>
              builder.where(column, operator, value),
            whereIn: (column, values) => builder.whereIn(column, values),
            modify: (_modifier, inactive) => builder.where('active', !inactive),
          });
          return {
            pagination: (page, size) => {
              sql = builder
                .limit(size)
                .offset(page * size)
                .toSQL();
              return Promise.resolve({ results: [], pagination: { total: 0 } });
            },
          };
        },
      }),
    });
    const service = new GetCustomers(
      {
        parseStringifiedFilter: (filter) => filter,
        dynamicList: async () => ({
          buildQuery: () => (query) =>
            query.where('display_name', 'like', '%A%'),
          getResponseMeta: () => ({}),
        }),
      } as any,
      { transform: async (rows) => rows } as any,
      model as any,
    );
    await service.getCustomersList({
      page: 2,
      pageSize: 20,
      inactiveMode: false,
      filterQuery: (query) => query.whereIn('contacts.id', [31, 32]),
    } as any);
    expect(sql.sql).toContain('`contacts`.`id` in (?, ?)');
    expect(sql.sql).toContain('`display_name` like ?');
    expect(sql.sql).toContain('`active` = ?');
    expect(sql.sql).toContain('limit ? offset ?');
    expect(sql.bindings).toEqual(['%A%', true, 31, 32, 20, 20]);
    await connection.destroy();
  });
});
