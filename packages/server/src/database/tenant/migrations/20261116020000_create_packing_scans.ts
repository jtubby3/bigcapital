import { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('packing_scan_batches', (t) => {
    t.increments('id').primary();
    t.boolean('cancelled').notNullable().defaultTo(false);
    t.integer('user_id').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('packing_scan_files', (t) => {
    t.increments('id').primary();
    t.integer('batch_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('packing_scan_batches');
    t.string('name', 255).notNullable();
    t.string('key', 255).notNullable();
    t.string('mime', 40).notNullable();
    t.string('content_hash', 64).notNullable();
    t.string('status', 20).notNullable();
    t.text('error').nullable();
    t.integer('page_count').notNullable().defaultTo(0);
    t.json('page_data').nullable();
    t.integer('attempt').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['batch_id', 'status']);
    t.index('content_hash');
    t.unique(['batch_id', 'content_hash']);
  });
  await knex.schema.createTable('packing_scan_slips', (t) => {
    t.increments('id').primary();
    t.integer('batch_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('packing_scan_batches');
    t.integer('file_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('packing_scan_files');
    t.json('pages').notNullable();
    t.json('evidence').notNullable();
    t.string('status', 20).notNullable().defaultTo('review');
    t.integer('version').notNullable().defaultTo(1);
    t.integer('invoice_id').unsigned().nullable();
    t.string('invoice_fingerprint', 64).nullable();
    t.integer('document_id').unsigned().nullable();
    t.string('identity_hash', 64).notNullable();
    t.string('active_key', 64).nullable().unique();
    t.boolean('superseded').notNullable().defaultTo(false);
    t.string('confirmed_by', 20).nullable();
    t.integer('user_id').unsigned().nullable();
    t.text('error').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['batch_id', 'superseded']);
    t.index(['invoice_id', 'status']);
    t.index('file_id');
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('packing_scan_slips');
  await knex.schema.dropTableIfExists('packing_scan_files');
  await knex.schema.dropTableIfExists('packing_scan_batches');
}
