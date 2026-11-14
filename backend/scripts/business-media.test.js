import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMediaManifest, cloudinaryReference, mediaConfiguration, saveMediaManifest, loadMediaManifest, purgeBusinessMedia } from './business-media.js';
import { mediaPurgeOptions, MEDIA_CONFIRMATION } from './purge-business-media.js';

const env = { CLOUDINARY_UPLOAD_ROOT: 'shop-root', CLOUDINARY_CLOUD_NAME: 'unit-cloud', CLOUDINARY_API_SECRET: 'synthetic-media-secret' };
const url = id => `https://res.cloudinary.com/unit-cloud/image/upload/v123/${id}.jpg`;
const ref = (id, source = 'products:1:image') => ({ url: url(id), source });
const emptyPlan = { tables: [], order: [] };
const manifest = () => ({ ...buildMediaManifest({ selected: [ref('shop-root/products/images/old-part')], retained: [] }, env, 'unit-project'), status: 'database_committed' });
const options = { env, projectRef: 'unit-project', plan: emptyPlan, targetWhere: () => '', log() {} };

test('manifest selects only exact app/root business assets, preserving avatars, logos, retained files and ambiguous references', () => {
  const result = buildMediaManifest({ selected: [
    ref('shop-root/products/images/old-part'), ref('shop-root/products/images/old-part','ecommerce_listing_media:1:url'),
    ref('shop-root/products/images/shared-avatar'), ref('shop-root/avatars/user-1/me'), ref('shop-root/products/images/logo'),
    ref('shop-root/system/logo'), ref('unrelated/products/images/other-shop'),
    { url: 'https://res.cloudinary.com/unit-cloud/image/upload/shop-root/products/images/no-version.jpg', source: 'banners:2:image_url' },
    { url: 'https://external.example.test/photo.jpg?private=not-logged', source: 'banners:3:image_url' },
  ], retained: [ref('shop-root/products/images/shared-avatar', 'users:1:avatar')] }, env, 'unit-project');
  assert.equal(result.assets.length, 1); assert.equal(result.assets[0].sources.length, 2);
  assert.equal(result.preserved.length, 6); assert.equal(result.manual_review.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private=not-logged|synthetic-media-secret/);
  const config = mediaConfiguration(env);
  assert.equal(cloudinaryReference('https://res.cloudinary.com/other-cloud/image/upload/v123/shop-root/products/images/file.jpg', config), null);
  assert.equal(cloudinaryReference(`${url('shop-root/products/images/file')}?token=secret`, config), null);
  assert.equal(cloudinaryReference(url('shop-root/products/images/%2e%2e/file'), config), null);
  assert.equal(buildMediaManifest({ selected: [ref('shop-root/products/images/x')], retained: [] }, {}, 'unit-project').assets.length, 0);
});

test('manifest file is authenticated, refuses overwrite/tampering, and contains no provider secret', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), '10thwest-media-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  const file = path.join(directory, 'run.cleanup-media.json'), original = manifest();
  await saveMediaManifest(file, original, env.CLOUDINARY_API_SECRET, { create: true });
  assert.deepEqual(await loadMediaManifest(file, env.CLOUDINARY_API_SECRET), original);
  assert.doesNotMatch(await readFile(file, 'utf8'), /synthetic-media-secret/);
  await assert.rejects(saveMediaManifest(file, original, env.CLOUDINARY_API_SECRET, { create: true }), /exist/i);
  await saveMediaManifest(file, { ...original, status: 'prepared' }, env.CLOUDINARY_API_SECRET);
  assert.equal((await loadMediaManifest(file, env.CLOUDINARY_API_SECRET)).status, 'prepared');
  const tampered = JSON.parse(await readFile(file, 'utf8')); tampered.payload.assets[0].public_id = 'shop-root/avatars/user-1/me';
  await writeFile(file, JSON.stringify(tampered));
  await assert.rejects(loadMediaManifest(file, env.CLOUDINARY_API_SECRET), /authentication failed/);
});

test('purge preview has no provider calls; execution verifies exact identity/version and deletes only immutable asset IDs', async () => {
  const calls = [], logs = [], payload = manifest();
  const provider = {
    async resource(id) { calls.push(['lookup',id]); return { public_id: id, resource_type: 'image', type: 'upload', version: 123, asset_id: 'immutable-asset' }; },
    async delete_resources_by_asset_ids(ids) { calls.push(['delete',ids]); return { deleted: { 'shop-root/products/images/old-part': 'deleted' } }; },
  };
  const preview = await purgeBusinessMedia({}, payload, { ...options, provider, log: line => logs.push(line) });
  assert.equal(preview.results[0].status, 'selected'); assert.equal(calls.length, 0);
  const result = await purgeBusinessMedia({}, payload, { ...options, execute: true, provider, log: line => logs.push(line) });
  assert.deepEqual(calls, [['lookup','shop-root/products/images/old-part'],['delete',['immutable-asset']]]);
  assert.equal(result.failed, 0); assert.equal(result.database_cleanup, 'already_committed');
  assert.doesNotMatch(logs.join(''), /synthetic-media-secret|password|api_key/);
});

test('purge rejects uncommitted/wrong-project manifests and preserves any now-referenced avatar', async () => {
  await assert.rejects(purgeBusinessMedia({}, { ...manifest(), status: 'prepared' }, options), /committed cleanup manifest/);
  await assert.rejects(purgeBusinessMedia({}, manifest(), { ...options, projectRef: 'wrong-project' }), /exact project/);
  const result = await purgeBusinessMedia({ query: async () => ({ rows: [{ id: 1, avatar: url('shop-root/products/images/old-part') }] }) }, manifest(), {
    ...options, execute: true, plan: { tables: [{ name: 'users' }], order: [] }, provider: { resource() { assert.fail('Avatar must never be looked up for deletion'); } },
  });
  assert.equal(result.results[0].status, 'preserved');
});

test('provider identity mismatch/failure is reported per asset without pretending database rollback', async () => {
  let deletes = 0;
  const provider = { resource: async () => ({ public_id: 'replacement', version: 999 }), delete_resources_by_asset_ids() { deletes++; } };
  const mismatch = await purgeBusinessMedia({}, manifest(), { ...options, execute: true, provider });
  assert.equal(mismatch.results[0].status, 'failed_identity_verification'); assert.equal(deletes, 0);
  provider.resource = async () => { throw new Error('private provider response'); };
  const failure = await purgeBusinessMedia({}, manifest(), { ...options, execute: true, provider });
  assert.equal(failure.failed, 1); assert.equal(failure.database_cleanup, 'already_committed');
  assert.doesNotMatch(JSON.stringify(failure), /private provider response/);
});

test('production purge requires separate explicit media confirmation and all production safeguards', () => {
  const args = ['--purge-media','--execute','--production',`--confirm=${MEDIA_CONFIRMATION}`,'--manifest=run.cleanup-media.json','--backup-verified','--writers-paused','--pos-sync-stopped'];
  const productionEnv = { ...env, CLEANUP_PRODUCTION_PROJECT_REF: 'unit-project', CLEANUP_VERIFIED_BACKUP_ID: '1' };
  assert.throws(() => mediaPurgeOptions(args, productionEnv, 'remote.test','unit-project'), /Remote\/production/);
  const approved = mediaPurgeOptions(args, { ...productionEnv, CONFIRM_PRODUCTION_MEDIA_PURGE: MEDIA_CONFIRMATION }, 'remote.test','unit-project');
  assert.equal(approved.execute, true); assert.equal(approved.production, true);
  assert.throws(() => mediaPurgeOptions(args.filter(arg => !arg.startsWith('--confirm=')), productionEnv, 'localhost','unit-project'), /PURGE_CAPTURED_BUSINESS_MEDIA/);
  assert.throws(() => mediaPurgeOptions(args.filter(arg => arg !== '--purge-media'), productionEnv, 'localhost','unit-project'), /purge-media/);
});
