exports.up = async function (knex) {
  await knex.schema.alterTable("items", (table) => {
    table.boolean("auto_increase_sell_price").notNullable().defaultTo(true);
    table.decimal("markup_percentage", 28, 8).nullable();
    table.date("purchase_cost_date").nullable();
    table.integer("purchase_cost_bill_id").unsigned().nullable();
  });
  // Preserve current prices; initialize the target only where cost makes it calculable.
  await knex("items")
    .where("cost_price", ">", 0)
    .whereNotNull("sell_price")
    .update({
      markup_percentage: knex.raw(
        "ROUND(((sell_price / cost_price) - 1) * 100, 8)",
      ),
    });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("items", (table) => {
    table.dropColumn("auto_increase_sell_price");
    table.dropColumn("markup_percentage");
    table.dropColumn("purchase_cost_date");
    table.dropColumn("purchase_cost_bill_id");
  });
};
