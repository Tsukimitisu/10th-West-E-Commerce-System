import { checkDatabaseConnection } from './database-check.js';

const database = await checkDatabaseConnection();
if (!database.ok) {
  process.exitCode = 1;
} else {
  await import('../src/server.js');
}
