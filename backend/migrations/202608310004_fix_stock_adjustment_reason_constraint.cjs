const ALLOWED_REASONS = [
  'restock',
  'restocking',
  'damaged',
  'returned',
  'lost',
  'correction',
  'correction_add',
  'correction_remove',
  'shrinkage',
  'transfer',
  'received',
  'supplier_delivery',
  'initial_stock',
  'expired',
  'sold_adjustment',
  'other',
];

const sqlList = ALLOWED_REASONS.map((reason) => `'${reason}'`).join(', ');

exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE stock_adjustments
      DROP CONSTRAINT IF EXISTS stock_adjustments_reason_check;

    ALTER TABLE stock_adjustments
      ADD CONSTRAINT stock_adjustments_reason_check
      CHECK (reason IS NULL OR reason::text IN (${sqlList})) NOT VALID;
  `);
};

exports.down = async (knex) => {
  // Do not restore the narrower legacy constraint: rows may already contain
  // the newer logical ADD/REMOVE reasons and must remain readable.
  await knex.raw(`
    ALTER TABLE stock_adjustments
      DROP CONSTRAINT IF EXISTS stock_adjustments_reason_check;
  `);
};
