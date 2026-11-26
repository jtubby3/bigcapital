import { Knex } from 'knex';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sales_invoices', (table) => {
    table.text('billing_address_text').nullable();
    table.text('shipping_address_text').nullable();
    table.string('recipient_email', 254).nullable();
    table.string('shipping_method', 255).nullable();
    table.date('shipping_date').nullable();
    table.string('tracking_no', 255).nullable();
    table.integer('payment_terms_days').unsigned().nullable();
    table.text('payment_instructions').nullable();
    table.text('internal_notes').nullable();
    table.text('statement_memo').nullable();
    table.decimal('shipping_charge', 13, 3).notNullable().defaultTo(0);
  });
}
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sales_invoices', (table) => {
    table.dropColumns(
      'billing_address_text',
      'shipping_address_text',
      'recipient_email',
      'shipping_method',
      'shipping_date',
      'tracking_no',
      'payment_terms_days',
      'payment_instructions',
      'internal_notes',
      'statement_memo',
      'shipping_charge',
    );
  });
}
