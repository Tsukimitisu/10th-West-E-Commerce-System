const PERMISSIONS = [
  ['orders.update', 'Update order status and fulfillment', 'Orders', 'orders.edit'],
  ['orders.cancel', 'Cancel store orders', 'Orders', 'orders.edit'],
  ['returns.manage', 'Approve or reject returns', 'Returns', 'returns.process'],
  ['refunds.view', 'View refund records', 'Returns', 'payments.view'],
  ['refunds.process', 'Process refunds', 'Returns', 'payments.refund'],
  ['chat.view', 'View buyer conversations', 'Chat', null],
  ['chat.reply', 'Reply to and manage buyer conversations', 'Chat', null],
  ['waybills.view', 'View and print waybills', 'Shipments', 'waybills.manage'],
  ['waybills.generate', 'Generate waybills', 'Shipments', 'waybills.manage'],
  ['inventory.adjust', 'Adjust inventory quantities', 'Inventory', 'inventory.manage'],
  ['products.manage', 'Create, update and archive products', 'Products', 'products.edit'],
];

exports.up = async function up(knex) {
  await knex('permissions')
    .insert(PERMISSIONS.map(([name, description, category]) => ({ name, description, category })))
    .onConflict('name')
    .ignore();

  await knex.raw(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT r.role::user_role_enum, p.id
    FROM (VALUES ('admin'), ('super_admin'), ('owner')) AS r(role)
    CROSS JOIN permissions p
    WHERE p.name = ANY(?::text[])
    ON CONFLICT (role, permission_id) DO NOTHING
  `, [PERMISSIONS.map(([name]) => name)]);

  for (const [newName, , , legacyName] of PERMISSIONS) {
    if (!legacyName) continue;
    await knex.raw(`
      INSERT INTO role_permissions (role, permission_id)
      SELECT rp.role, next_permission.id
      FROM role_permissions rp
      JOIN permissions legacy_permission ON legacy_permission.id = rp.permission_id
      CROSS JOIN permissions next_permission
      WHERE legacy_permission.name = ?
        AND next_permission.name = ?
      ON CONFLICT (role, permission_id) DO NOTHING
    `, [legacyName, newName]);
  }
};

exports.down = async function down(knex) {
  await knex('permissions').whereIn('name', PERMISSIONS.map(([name]) => name)).delete();
};
