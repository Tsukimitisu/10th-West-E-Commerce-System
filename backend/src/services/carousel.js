import { sanitizePlainText } from '../utils/inputSanitizer.js';

export const CAROUSEL_TYPES = ['none', 'product', 'set', 'promotion', 'category', 'model', 'storefront', 'external', 'legacy'];
export const ID_DESTINATION_TYPES = ['product', 'set', 'promotion', 'category', 'model'];
const PUBLIC_PAGES = new Set(['/', '/shop', '/contact', '/faq', '/privacy', '/terms', '/return-policy']);
const SHOP_PARAMS = new Set(['search', 'category', 'model', 'color', 'sort', 'promotion']);
export const positiveId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647 ? Number(value) : null;

export function safeCarouselLink(value) {
  const raw = String(value || '').trim().replace(/^#(?=\/)/, '');
  if (!raw || raw.length > 500 || /[\\<>"'\u0000-\u0020]/.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return null;
  if (raw.startsWith('/')) {
    const url = new URL(raw, 'https://store.example');
    if (url.hash || (!PUBLIC_PAGES.has(url.pathname) && !/^\/(?:products|sets)\/\d+$/.test(url.pathname))) return null;
    if (url.search && (url.pathname !== '/shop' || [...url.searchParams.keys()].some(key => !SHOP_PARAMS.has(key)))) return null;
    return `${url.pathname}${url.search}`;
  }
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safeCarouselImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 500 || /[\\<>"'\u0000-\u0020]/.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (/^\/(?:uploads|brand|images)\//.test(raw) && !decoded.includes('..')) return raw;
  const url = safeCarouselLink(raw);
  return url && /^https?:\/\//.test(url) ? url : null;
}

const inputError = message => Object.assign(new Error(message), { status: 400 });
export function parseCarouselBanner(input = {}) {
  const text = (key, max) => {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw inputError(`${key} must be text.`);
    if (String(input[key] || '').length > max) throw inputError(`${key} must be ${max} characters or fewer.`);
    return sanitizePlainText(input[key], { maxLength: max }) || '';
  };
  const title = text('title', 120);
  if (!title) throw inputError('A slide title is required.');
  const type = input.destination_type ?? 'legacy';
  if (!CAROUSEL_TYPES.includes(type)) throw inputError('Choose a supported destination type.');
  const destinationId = input.destination_id === null || input.destination_id === '' || input.destination_id === undefined ? null : positiveId(input.destination_id);
  if (ID_DESTINATION_TYPES.includes(type) && !destinationId) throw inputError('Choose a valid destination.');
  if (!ID_DESTINATION_TYPES.includes(type) && input.destination_id != null && input.destination_id !== '') throw inputError('This destination does not accept an item ID.');
  const image = safeCarouselImage(input.image_url);
  if (image === null) throw inputError('Use a valid image URL or upload a supported image.');
  const order = Number(input.display_order ?? 0);
  if (!Number.isInteger(order) || order < 0 || order > 9999) throw inputError('Display order must be an integer from 0 to 9999.');
  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') throw inputError('Active must be true or false.');
  const date = key => {
    if (input[key] === '' || input[key] === null || input[key] === undefined) return null;
    if (typeof input[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input[key]) || !Number.isFinite(Date.parse(input[key]))) throw inputError(`Choose a valid ${key.replace('_', ' ')} date/time with a timezone.`);
    return new Date(input[key]).toISOString();
  };
  const starts = date('starts_at'); const ends = date('ends_at');
  if (starts && ends && Date.parse(starts) >= Date.parse(ends)) throw inputError('End must be after start.');
  const link = type === 'none' ? '' : safeCarouselLink(input.link_url);
  if (input.link_url && !safeCarouselLink(input.link_url)) throw inputError('The destination URL is unsafe or unsupported.');
  if (['storefront', 'external'].includes(type) && !link) throw inputError('Choose a valid storefront destination or HTTP(S) URL.');
  if (type === 'storefront' && !link.startsWith('/')) throw inputError('Storefront destinations must be internal.');
  if (type === 'external' && !/^https?:\/\//.test(link)) throw inputError('External destinations must use HTTP(S).');
  if (type === 'legacy' && input.link_url && !link) throw inputError('The existing destination is unsafe or unsupported. Choose a new destination.');
  return { title, subtitle: text('subtitle', 600), button_text: text('button_text', 48), image_url: image, alt_text: text('alt_text', 255),
    destination_type: type, destination_id: destinationId, link_url: link || '', is_active: input.is_active ?? true,
    display_order: order, starts_at: starts, ends_at: ends };
}

export function withinCarouselSchedule(row, now = Date.now()) {
  const valid = value => !value || Number.isFinite(Date.parse(value));
  return row?.is_active === true && valid(row.starts_at) && valid(row.ends_at)
    && (!row.starts_at || Date.parse(row.starts_at) <= now) && (!row.ends_at || Date.parse(row.ends_at) > now);
}

export function publicCarouselSlide(row, destination = row.link_url) {
  // Explicit public projection: never return arbitrary stored/private metadata.
  return { id: row.id, title: sanitizePlainText(row.title, { maxLength: 120 }) || '', subtitle: sanitizePlainText(row.subtitle, { maxLength: 600 }) || '',
    button_text: sanitizePlainText(row.button_text, { maxLength: 48 }) || '', image_url: safeCarouselImage(row.image_url) || '',
    alt_text: sanitizePlainText(row.alt_text, { maxLength: 255 }) || '', link_url: safeCarouselLink(destination) || '',
    is_active: true, display_order: Number(row.display_order) || 0, starts_at: row.starts_at || null, ends_at: row.ends_at || null };
}

export const targetLink = (type, target) => type === 'product' ? `/products/${target.id}` : type === 'set' ? `/sets/${target.id}` : type === 'promotion' ? `/shop?promotion=${target.id}` : type === 'category' ? `/shop?category=${target.id}` : type === 'model' ? `/shop?model=${encodeURIComponent(target.model_name)}` : null;

// Resolve each target kind once, regardless of slide count. Writes accept future
// promotion records; public reads require their current commercial availability.
export async function resolveCarouselTargets(rows, query, { forManagement = false, includeUnavailable = false } = {}) {
  const groups = ID_DESTINATION_TYPES;
  const maps = await Promise.all(groups.map(async type => {
    const ids = [...new Set(rows.filter(row => row.destination_type === type).map(row => positiveId(row.destination_id)).filter(Boolean))];
    if (!ids.length) return new Map();
    const sql = type === 'product' ? `SELECT p.id,p.name,p.part_number FROM products p JOIN ecommerce_listings el ON el.inventory_item_id=p.id WHERE p.id=ANY($1::int[]) AND el.visibility_status='active' AND p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false`
      : type === 'set' ? `SELECT l.id,l.title AS name FROM ecommerce_listings l WHERE l.id=ANY($1::int[]) AND l.listing_type='set' AND l.visibility_status='active'
          AND EXISTS (SELECT 1 FROM ecommerce_listing_items li JOIN products ip ON ip.id=li.product_item_id WHERE li.listing_id=l.id AND ip.inventory_status='active' AND COALESCE(ip.is_deleted,false)=false)`
      : type === 'promotion' ? `SELECT id,code FROM discounts WHERE id=ANY($1::int[]) AND deleted_at IS NULL${forManagement ? '' : " AND is_active=true AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR COALESCE(used_count,0)<max_uses)"}`
      : type === 'category' ? 'SELECT id,name FROM categories WHERE id=ANY($1::int[])'
      : "SELECT id,model_name FROM motorcycle_models WHERE id=ANY($1::int[]) AND status='active'";
    const result = await query(sql, [ids]);
    return new Map(result.rows.map(target => [Number(target.id), { link:targetLink(type,target), label:target.code || target.model_name || (target.part_number ? `${target.name} · ${target.part_number}` : target.name) || `Item #${target.id}` }]));
  }));
  return rows.map(row => {
    const index = groups.indexOf(row.destination_type);
    if (index < 0) return { ...row, link_url: row.destination_type === 'none' ? '' : safeCarouselLink(row.link_url) || '' };
    const target = maps[index].get(Number(row.destination_id));
    return target ? { ...row, link_url: target.link, ...(forManagement ? {destination_label:target.label} : {}) }
      : includeUnavailable ? { ...row,destination_unavailable:true } : null;
  }).filter(Boolean);
}
