exports.up = async (knex) => {
  await knex.schema.createTable('vendor_telegram_accounts', (table) => {
    table.string('bot_id', 24).notNullable();
    table.string('organization_id', 80).notNullable();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('chat_id', 24).nullable();
    table.string('pairing_hash', 64).nullable();
    table.bigInteger('pairing_until').unsigned().nullable();
    table.text('state', 'longtext').nullable();
    table.boolean('has_pending_scans').notNullable().defaultTo(false);
    table.primary(['bot_id', 'organization_id', 'user_id']);
    table.unique(['bot_id', 'chat_id']);
    table.unique(['bot_id', 'pairing_hash']);
    table.index(['bot_id', 'has_pending_scans']);
  });

  await knex.schema.createTable('vendor_telegram_polls', (table) => {
    table.string('bot_id', 24).primary();
    table.bigInteger('next_update').unsigned().notNullable();
    table.bigInteger('updated_at_ms').unsigned().notNullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('vendor_telegram_polls');
  await knex.schema.dropTableIfExists('vendor_telegram_accounts');
};
