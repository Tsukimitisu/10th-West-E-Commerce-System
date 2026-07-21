import { checkDatabaseConnection } from '../../scripts/database-check.js';

console.warn('check-supabase.js is deprecated; use `npm run db:check`.');
const result = await checkDatabaseConnection();
if (!result.ok) process.exitCode = 1;
