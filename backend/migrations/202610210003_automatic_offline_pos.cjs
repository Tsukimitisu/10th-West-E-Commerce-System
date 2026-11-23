exports.up = async knex => knex.raw(`
  -- Existing devices and all issued holds remain unchanged.
  ALTER TABLE pos_offline_devices ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK(stock_mode IN ('manual','automatic'));
  CREATE UNIQUE INDEX pos_one_active_automatic_device ON pos_offline_devices ((true))
    WHERE is_active AND stock_mode='automatic';
`);
exports.down = async knex => {
  const result=await knex.raw("SELECT EXISTS(SELECT 1 FROM pos_offline_devices WHERE stock_mode='automatic') AS automatic");
  if(result.rows[0].automatic)throw new Error('Switch automatic devices to Manual before rollback. Their protected reserves must be preserved.');
  await knex.raw('DROP INDEX pos_one_active_automatic_device');
  await knex.raw('ALTER TABLE pos_offline_devices DROP COLUMN stock_mode');
};
