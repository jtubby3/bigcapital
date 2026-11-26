import knex, { Knex } from 'knex';
import { knexSnakeCaseMappers } from 'objection';
import { VendorInvoiceScanService } from './VendorInvoiceScan.service';

describe('vendor scan item options SQL', () => {
  it.each(['item', 'charge'] as const)(
    'selects the existing purchase description as description for %s choices',
    async (kind) => {
      const connection = knex({
        client: 'mysql',
        ...knexSnakeCaseMappers({ upperCase: true }),
      });
      let generated: Knex.Sql;
      // Compile the real query without opening a database connection.
      jest.spyOn(connection.client, 'runner').mockImplementation(
        (query: Knex.QueryBuilder) =>
          ({
            run: async () => {
              generated = query.toSQL();
              return [];
            },
          }) as never,
      );
      const service = new VendorInvoiceScanService(
        () => connection,
        undefined,
        undefined,
        undefined,
        { get: (key) => (key === 'userId' ? 1 : 'org-1') } as never,
        undefined,
        { getAbilityForUser: async () => ({ can: () => true }) } as never,
        undefined,
        undefined,
        undefined,
      );
      try {
        await expect(service.options(kind, 'cup')).resolves.toEqual([]);
        expect(generated.sql).toContain(
          '`PURCHASE_DESCRIPTION` as `DESCRIPTION`',
        );
        expect(generated.sql).toContain('`COST_PRICE` as `COST`');
        expect(generated.sql).toContain('`SELL_PRICE` as `SELL_PRICE`');
        expect(generated.sql).toContain('`PURCHASABLE` = ?');
        expect(generated.sql).toContain('`NAME` like ?');
        expect(generated.sql).toContain('or `CODE` like ?');
        expect(generated.bindings).toEqual([
          true,
          'inventory',
          '%cup%',
          '%cup%',
          50,
        ]);
        if (kind === 'charge') {
          expect(generated.sql).toContain('not `TYPE` = ?');
          expect(generated.sql).toContain('`COST_ACCOUNT_ID` is not null');
        } else {
          expect(generated.sql).toContain('`TYPE` = ?');
        }
      } finally {
        await connection.destroy();
      }
    },
  );
});
