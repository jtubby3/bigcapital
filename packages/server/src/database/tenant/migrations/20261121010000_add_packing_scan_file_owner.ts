import { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('packing_scan_files', (table) => {
    table.integer('user_id').unsigned().nullable();
  });
  await knex.raw(
    'UPDATE ?? f JOIN ?? b ON f.?? = b.?? SET f.?? = b.?? WHERE f.?? IS NULL',
    [
      'packing_scan_files',
      'packing_scan_batches',
      'batch_id',
      'id',
      'user_id',
      'user_id',
      'user_id',
    ],
  );
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('packing_scan_files', (table) =>
    table.dropColumn('user_id'),
  );
}
