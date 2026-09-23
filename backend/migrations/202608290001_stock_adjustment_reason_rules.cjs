const NEW_STOCK_ADJUSTMENT_REASONS = [
  'restocking',
  'correction_add',
  'supplier_delivery',
  'initial_stock',
  'correction_remove',
  'sold_adjustment',
];

exports.up = async (knex) => {
  for (const reason of NEW_STOCK_ADJUSTMENT_REASONS) {
    await knex.raw(`ALTER TYPE stock_adjustment_reason_enum ADD VALUE IF NOT EXISTS '${reason}'`);
  }
};

exports.down = async () => {
  // PostgreSQL enum values cannot be safely removed while legacy rows may use them.
};
