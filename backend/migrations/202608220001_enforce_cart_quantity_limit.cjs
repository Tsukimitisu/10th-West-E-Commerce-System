const CONSTRAINT_NAME = 'cart_items_quantity_range_check';

exports.up = async (knex) => {
  const hasCartItems = await knex.schema.hasTable('cart_items');
  if (!hasCartItems) return;

  await knex.raw('UPDATE cart_items SET quantity = LEAST(GREATEST(quantity, 1), 50) WHERE quantity < 1 OR quantity > 50');
  await knex.raw(`ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`);
  await knex.raw(`ALTER TABLE cart_items ADD CONSTRAINT ${CONSTRAINT_NAME} CHECK (quantity BETWEEN 1 AND 50)`);
};

exports.down = async (knex) => {
  const hasCartItems = await knex.schema.hasTable('cart_items');
  if (!hasCartItems) return;
  await knex.raw(`ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`);
};
