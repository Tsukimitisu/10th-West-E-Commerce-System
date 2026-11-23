const ALL_USER_ROLES = [
  'customer',
  'admin',
  'cashier',
  'super_admin',
  'owner',
  'store_staff',
];

const PREVIOUS_USER_ROLES = [
  'customer',
  'super_admin',
  'owner',
  'store_staff',
];

const replaceRoleCheck = async (knex, roles) => {
  const roleList = roles.map((role) => `'${role}'::user_role_enum`).join(', ');
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY[${roleList}]));
  `);
};

exports.up = async (knex) => {
  await replaceRoleCheck(knex, ALL_USER_ROLES);
};

exports.down = async (knex) => {
  await knex('users').whereIn('role', ['admin', 'cashier']).update({ role: 'store_staff' });
  await replaceRoleCheck(knex, PREVIOUS_USER_ROLES);
};
