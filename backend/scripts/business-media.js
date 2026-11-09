import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';

const mediaColumns = {
  products: ['image','image_urls','video_url','description'], product_variants: ['image_url'], product_images: ['image_url','url'],
  ecommerce_listings: ['image_url','description'], ecommerce_listing_media: ['url'], banners: ['image_url'], announcements: ['content'],
  reviews: ['images','media_urls'], chat_attachments: ['url','thumbnail_url','secure_url'], chat_messages: ['attachments'],
  order_items: ['image_snapshot'], notifications: ['thumbnail_url'], pos_offline_snapshots: ['catalogue'],
  users: ['avatar','avatar_url'], system_settings: ['value'], policies: ['content'], faqs: ['answer','content'],
};
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const fail = message => Object.assign(new Error(message), { safeMessage: message });
const quote = value => `"${value.replaceAll('"', '""')}"`;

export function mediaConfiguration(env) {
  const root = String(env.CLOUDINARY_UPLOAD_ROOT || '').replace(/^\/+|\/+$/g, '');
  const cloud = String(env.CLOUDINARY_CLOUD_NAME || '');
  if (!/^[\w-]+(?:\/[\w-]+)*$/.test(root) || !/^[\w-]+$/.test(cloud)) return null;
  return { root, cloud };
}

// Only unambiguous, versioned delivery URLs. No guessing of transformations,
// raw-file extensions, custom hosts, encoded paths or unsigned query strings.
export function cloudinaryReference(value, config) {
  if (!config || typeof value !== 'string' || /%|\/\.\.?\//.test(value)) return null;
  let url; try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password || url.search || url.hash || /%/.test(url.pathname)) return null;
  const match = url.pathname.match(/^\/([^/]+)\/(image|video)\/upload\/(?:[^/]+\/)*?v(\d+)\/(.+)\.([a-zA-Z0-9]+)$/);
  if (!match || match[1] !== config.cloud || !/^[\w./-]+$/.test(match[4]) || match[4].split('/').some(part => !part || part === '.' || part === '..')) return null;
  return { public_id: match[4], resource_type: match[2], version: match[3] };
}

export function allowedBusinessAsset(asset, config) {
  if (!config || !asset.public_id.startsWith(`${config.root}/`)) return false;
  const relative = asset.public_id.slice(config.root.length + 1);
  return /^(products\/(images|videos)|banners|carousel|listings|reviews)\//.test(relative)
    && !/(^|\/)(avatars?|logos?|branding|system|icons?|favicons?)(\/|[._-]|$)/i.test(relative)
    && !/(^|\/)[^/]*(?:logo|favicon)[^/]*$/i.test(relative);
}
const key = asset => `${asset.resource_type}:${asset.public_id}`;
const strings = value => {
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/https?:\/\/[^\s<>"'\\]+/g)].map(match => match[0].replace(/&amp;/g, '&'));
};

export async function collectMediaReferences(db, plan, targetWhere) {
  const selected = [], retained = [];
  for (const table of plan.tables.map(row => row.name)) {
    const columns = mediaColumns[table]; if (!columns) continue;
    const rows = (await db.query(`SELECT t.id,${columns.map(column => `to_jsonb(t)->'${column}' AS ${quote(column)}`).join(',')} FROM public.${quote(table)} t`)).rows;
    // Partial tables (e.g. security notifications) need the exact cleanup predicate.
    const ids = plan.order.includes(table) ? new Set((await db.query(`SELECT id FROM public.${quote(table)}${targetWhere(table)}`)).rows.map(row => String(row.id))) : new Set();
    for (const row of rows) for (const column of columns) for (const url of strings(row[column])) {
      (ids.has(String(row.id)) ? selected : retained).push({ url, source: `${table}:${row.id}:${column}` });
    }
  }
  return { selected, retained };
}

export function buildMediaManifest(references, env, projectRef) {
  const config = mediaConfiguration(env);
  const retained = new Set(references.retained.map(ref => cloudinaryReference(ref.url, config)).filter(Boolean).map(key));
  // If a retained URL is ambiguous, err on the side of preserving media.
  const ambiguousRetained = references.retained.some(ref => ref.url.includes('cloudinary.com') && !cloudinaryReference(ref.url, config));
  const assets = new Map(), manual = [], preserved = [];
  for (const ref of references.selected) {
    const asset = cloudinaryReference(ref.url, config);
    const report = { source: ref.source, reference_sha256: fingerprint(ref.url) };
    let sourceUrl; try { sourceUrl = new URL(ref.url); } catch { /* Manual review below. */ }
    if (sourceUrl && sourceUrl.hostname !== 'res.cloudinary.com') {
      preserved.push({ ...report, reason: 'not_app_cloudinary' }); continue;
    }
    if (!asset) {
      const referenceUrl = sourceUrl ? `${sourceUrl.origin}${sourceUrl.pathname}` : undefined;
      manual.push({ ...report, reference_url: referenceUrl, reason: config ? 'exact_public_id_not_verified' : 'cloudinary_root_or_cloud_not_configured' }); continue;
    }
    if (retained.has(key(asset)) || !allowedBusinessAsset(asset, config) || ambiguousRetained) {
      preserved.push({ ...report, reason: retained.has(key(asset)) ? 'still_referenced' : ambiguousRetained ? 'ambiguous_retained_reference' : 'outside_business_allowlist' }); continue;
    }
    const prior = assets.get(key(asset));
    if (prior && prior.version !== asset.version) { prior.ambiguous = true; }
    if (prior) prior.sources.push(ref.source); else assets.set(key(asset), { ...asset, sources: [ref.source] });
  }
  for (const [id, asset] of assets) if (asset.ambiguous) { manual.push({ sources: asset.sources, reason: 'multiple_asset_versions' }); assets.delete(id); }
  return { version: 1, run_id: randomUUID(), created_at: new Date().toISOString(), status: 'prepared', project_ref: projectRef || null,
    cloud_name: config?.cloud || null, upload_root: config?.root || null, assets: [...assets.values()], manual_review: manual,
    preserved, retained_reference_count: references.retained.length };
}

export async function saveMediaManifest(path, manifest, secret, { create = false } = {}) {
  if (!secret) throw fail('CLOUDINARY_API_SECRET is required to authenticate the captured media manifest.');
  const payload = JSON.stringify(manifest), signature = createHmac('sha256', secret).update(payload).digest('hex');
  const document = JSON.stringify({ payload: manifest, signature }, null, 2);
  if (create) return writeFile(path, document, { flag: 'wx', mode: 0o600 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, document, { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}

export async function loadMediaManifest(path, secret) {
  const { payload, signature } = JSON.parse(await readFile(path, 'utf8'));
  if (!secret || !/^[a-f0-9]{64}$/.test(signature || '') || !timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', secret).update(JSON.stringify(payload)).digest())) throw fail('Media manifest authentication failed.');
  return payload;
}

export async function purgeBusinessMedia(db, manifest, { env, plan, targetWhere, provider, execute = false, projectRef, log = console.log }) {
  const config = mediaConfiguration(env);
  if (manifest.version !== 1 || manifest.status !== 'database_committed' || !config || manifest.cloud_name !== config.cloud
    || manifest.upload_root !== config.root || !projectRef || manifest.project_ref !== projectRef) throw fail('A committed cleanup manifest for this exact project/cloud/root is required.');
  const references = await collectMediaReferences(db, plan, targetWhere);
  const current = references.selected.concat(references.retained);
  const currentIds = new Set(current.map(ref => cloudinaryReference(ref.url, config)).filter(Boolean).map(key));
  const ambiguous = current.some(ref => ref.url.includes('cloudinary.com') && !cloudinaryReference(ref.url, config));
  const results = [];
  for (const asset of manifest.assets) {
    let status = 'selected';
    if (ambiguous || currentIds.has(key(asset)) || !allowedBusinessAsset(asset, config)) status = 'preserved';
    else if (execute) {
      try {
        const remote = await provider.resource(asset.public_id, { resource_type: asset.resource_type, type: 'upload', timeout: 10000 });
        if (!remote.asset_id || remote.public_id !== asset.public_id || remote.resource_type !== asset.resource_type || remote.type !== 'upload'
          || String(remote.version) !== asset.version) status = 'failed_identity_verification';
        else {
          // Immutable ID avoids deleting a replacement uploaded under the same name.
          const result = await provider.delete_resources_by_asset_ids([remote.asset_id], { invalidate: true, timeout: 10000 });
          status = ['deleted','not_found'].includes(result.deleted?.[asset.public_id] || result.deleted?.[remote.asset_id])
            ? (result.deleted[asset.public_id] || result.deleted[remote.asset_id]) : 'failed_provider_response';
        }
      } catch (error) { status = error?.http_code === 404 ? 'already_absent' : 'failed_provider_request'; }
    }
    const result = { public_id: asset.public_id, resource_type: asset.resource_type, status }; results.push(result); log(JSON.stringify(result));
  }
  for (const { reference_url, ...asset } of manifest.manual_review) log(JSON.stringify({ ...asset, status: 'manual_review' }));
  for (const asset of manifest.preserved) log(JSON.stringify({ ...asset, status: 'preserved' }));
  return { database_cleanup: 'already_committed', results, failed: results.filter(row => row.status.startsWith('failed')).length };
}
