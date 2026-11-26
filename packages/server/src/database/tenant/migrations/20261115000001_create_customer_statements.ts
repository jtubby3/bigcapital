import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customer_statements', (table) => {
    table.increments('id').primary();
    table
      .integer('customer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('contacts');
    table.string('statement_type', 30).notNullable();
    table.date('statement_date').notNullable();
    table.date('from_date').notNullable();
    table.date('to_date').notNullable();
    table.string('email', 254).notNullable().defaultTo('');
    table.string('status', 10).notNullable().defaultTo('saved');
    table.json('snapshot').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('sent_at').nullable();
    table.index(['customer_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customer_statements');
}
