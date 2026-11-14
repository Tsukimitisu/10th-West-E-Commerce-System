const path = require('path');
const { getDatabaseConfig } = require('./src/config/databaseConfig.cjs');

const databaseConfig = getDatabaseConfig();

module.exports = {
  client: 'pg',
  connection: databaseConfig.knexConnectionConfig,
  pool: databaseConfig.knexPoolConfig,
  acquireConnectionTimeout: databaseConfig.acquireConnectionTimeout,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
    loadExtensions: ['.cjs'],
    extension: 'cjs',
  },
};
