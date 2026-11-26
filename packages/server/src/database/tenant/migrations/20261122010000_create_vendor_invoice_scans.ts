import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vendor_invoice_scans', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable();
    t.string('name', 255).notNullable();
    t.string('status', 20).notNullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.string('source_hash', 64).notNullable().unique();
    t.string('request_key', 64).nullable().unique();
    t.string('posted_key', 64).nullable().unique();
    t.integer('bill_id').unsigned().nullable();
    t.json('review').nullable();
    t.string('error', 255).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('vendor_invoice_scan_files', (t) => {
    t.increments('id');
    t.integer('scan_id').unsigned().notNullable()
      .references('id').inTable('vendor_invoice_scans');
    t.string('name', 255).notNullable();
    t.string('key', 255).notNullable();
    t.string('mime', 40).notNullable();
    t.integer('size').unsigned().notNullable();
    t.integer('page_count').unsigned().notNullable().defaultTo(0);
    t.index('scan_id');
  });
  await knex.schema.createTable('vendor_invoice_item_matches', (t) => {
    t.integer('vendor_id').unsigned().notNullable();
    t.string('code_hash', 64).notNullable();
    t.string('code', 120).notNullable();
    t.integer('item_id').unsigned().notNullable();
    t.string('billing_unit', 30).notNullable();
    t.string('pack', 250).notNullable();
    t.string('cases_per_unit', 32).notNullable();
    t.integer('user_id').unsigned().notNullable();
    t.primary(['vendor_id', 'code_hash']);
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('vendor_invoice_item_matches');
  await knex.schema.dropTable('vendor_invoice_scan_files');
  await knex.schema.dropTable('vendor_invoice_scans');
}
