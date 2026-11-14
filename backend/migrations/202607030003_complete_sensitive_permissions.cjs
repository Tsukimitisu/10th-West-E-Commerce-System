const PERMISSIONS = [
  ['payments.manage', 'Expire and manage payment sessions', 'Payments'],
  ['shipping.view', 'View shipping operations', 'Shipments'],
  ['shipping.manage', 'Manage shipping operations', 'Shipments'],
  ['tracking.view', 'View provider tracking details', 'Shipments'],
  ['tracking.refresh', 'Refresh tracking through a configured provider', 'Shipments'],
];

exports.up = async function up(knex) {
  await knex('permissions')
    .insert(PERMISSIONS.map(([name, description, category]) => ({ name, description, category })))
    .onConflict('name')
    .ignore();

  await knex.raw(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT role_name::user_role_enum, p.id
    FROM (VALUES ('admin'), ('owner'), ('super_admin')) AS roles(role_name)
    CROSS JOIN permissions p
    WHERE p.name = ANY(?::text[])
    ON CONFLICT (role, permission_id) DO NOTHING
  `, [PERMISSIONS.map(([name]) => name)]);
};

exports.down = async function down(knex) {
  await knex('permissions').whereIn('name', PERMISSIONS.map(([name]) => name)).delete();
};
