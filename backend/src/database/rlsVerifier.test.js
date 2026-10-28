import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const directory = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.resolve(directory, '..', '..', 'scripts', 'verify-rls.js');

test('RLS verifier distinguishes unconditional TRUE from missing-ok function arguments', async () => {
  const source = await readFile(verifierPath, 'utf8');

  assert.match(source, /\^\[\[:space:\]\]\*\[\(\]\*/);
  assert.doesNotMatch(source, /\(\^\|\[\^a-z_\]\)true/);
  assert.match(source, /current_setting\('role', true\)/);
});

test('RLS verifier still detects any future public table without RLS and fails verification', async t => {
  const source = await readFile(verifierPath, 'utf8');
  const query = source.match(/const tablesWithoutRls = await pool\.query\(`([\s\S]*?)`\);/);
  assert.ok(query, 'The verifier must retain its public-table RLS check.');
  assert.match(source, /if \(tablesWithoutRls\.rowCount\) failures\.push/);
  assert.match(source, /if \(failures\.length\)[\s\S]*process\.exitCode = 1/);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE TABLE public.future_security_gap(id int)');
  assert.deepEqual((await db.query(query[1])).rows, [{ schema_name: 'public', table_name: 'future_security_gap' }]);
  await db.exec('ALTER TABLE public.future_security_gap ENABLE ROW LEVEL SECURITY');
  assert.deepEqual((await db.query(query[1])).rows, []);
});
