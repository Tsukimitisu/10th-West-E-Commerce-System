import pool from '../config/database.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch } from '../services/supabaseRest.js';
import { parseCarouselBanner, positiveId, publicCarouselSlide, resolveCarouselTargets, withinCarouselSchedule } from '../services/carousel.js';
import { calculateEcommercePrice, resolveStoreSellingPrice } from '../services/catalogPricing.js';
import { hasSetListingSchema } from '../services/setListings.js';

const failure = (res, error) => res.status(error.status || (error.code === '42703' ? 503 : 500)).json({ message: error.status ? error.message : error.code === '42703' ? 'Carousel metadata is not ready. Apply the additive carousel migration before saving slides.' : 'Carousel data could not be processed. Please try again.' });
const idFrom = value => { const id = positiveId(value); if (!id) throw Object.assign(new Error('A valid ID is required.'), { status: 400 }); return id; };
const query = (sql, values) => pool.query(sql, values);

async function fallbackTargets(sql, [ids]) {
  const params = { id: `in.(${ids.join(',')})` };
  let table;
  if (sql.includes('FROM products')) {
    table = 'products'; Object.assign(params, { select: 'id,ecommerce_listings!inner(visibility_status)', inventory_status: 'eq.active', is_deleted: 'eq.false', 'ecommerce_listings.visibility_status': 'eq.active' });
  } else if (sql.includes('FROM ecommerce_listings l')) {
    table = 'ecommerce_listings'; Object.assign(params, { select: 'id,title', listing_type: 'eq.set', visibility_status: 'eq.active' });
  } else if (sql.includes('FROM discounts')) { table = 'discounts'; Object.assign(params, { select: 'id,is_active,starts_at,expires_at,max_uses,used_count', deleted_at: 'is.null' }); }
  else if (sql.includes('FROM categories')) { table = 'categories'; params.select = 'id'; }
  else { table = 'motorcycle_models'; Object.assign(params, { select: 'id,model_name', status: 'eq.active' }); }
  let rows = await supabaseRestFetch(table, params);
  rows = Array.isArray(rows) ? rows : [];
  if (table === 'discounts') rows = rows.filter(row => row.is_active && (!row.starts_at || Date.parse(row.starts_at) <= Date.now()) && (!row.expires_at || Date.parse(row.expires_at) > Date.now()) && (row.max_uses === null || Number(row.used_count) < Number(row.max_uses)));
  return { rows };
}

export async function listPublicCarousel(_req, res) {
  try {
    // SELECT * remains compatible with the deployed pre-migration schema. Only
    // publicCarouselSlide's explicit projection leaves the server.
    const fallback = shouldUseDatabaseReadFallback();
    const rows = fallback ? await supabaseRestFetch('banners', { select: '*', is_active: 'eq.true', order: 'display_order.asc,id.asc' })
      : (await query('SELECT * FROM banners WHERE is_active=true ORDER BY display_order ASC,id ASC')).rows;
    const active = (Array.isArray(rows) ? rows : []).filter(row => withinCarouselSchedule(row));
    const resolved = await resolveCarouselTargets(active, fallback ? fallbackTargets : query);
    return res.json(resolved.map(row => publicCarouselSlide(row)).filter(row => row.title || row.image_url));
  } catch (error) {
    if (isDatabaseConnectivityError(error)) return res.json([]);
    return res.status(503).json({message:'Store highlights are temporarily unavailable.'});
  }
}
export async function listManagedCarousel(_req, res) {
  try {
    const rows=(await query('SELECT * FROM banners ORDER BY display_order ASC,id ASC')).rows;
    return res.json(await resolveCarouselTargets(rows,query,{forManagement:true,includeUnavailable:true}));
  }
  catch (error) { return failure(res, error); }
}

export async function carouselDestinations(req, res) {
  try {
    const type = String(req.query.type || 'all');
    if (!['all','product','set','promotion','category','model'].includes(type)) throw Object.assign(new Error('Unsupported destination type.'), { status: 400 });
    const search = String(req.query.search || '').trim().slice(0, 120);
    const selected = req.query.id ? idFrom(req.query.id) : null;
    const selectionType=String(req.query.selected_type || 'product');
    if(!['product','set','promotion'].includes(selectionType)) throw Object.assign(new Error('Unsupported selected destination type.'),{status:400});
    const result = {};
    const withSets = await hasSetListingSchema(pool);
    await Promise.all([
      ['product', 'products', `SELECT p.id,p.name,p.part_number,COALESCE(mm.model_name,p.motorcycle_model) AS motorcycle_model,
        p.store_selling_price,p.price,COALESCE((SELECT m.url FROM ecommerce_listing_media m WHERE m.listing_id=el.id AND m.media_type='image' ORDER BY m.sort_order LIMIT 1),p.image) AS image
        FROM products p JOIN ecommerce_listings el ON el.inventory_item_id=p.id LEFT JOIN motorcycle_models mm ON mm.id=p.motorcycle_model_id
        WHERE el.visibility_status='active' AND p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false
        AND ($1::text='' OR p.name ILIKE $2 OR p.part_number ILIKE $2 OR COALESCE(mm.model_name,p.motorcycle_model) ILIKE $2) AND ($3::int IS NULL OR p.id=$3) ORDER BY p.name,p.id LIMIT 26`, [search, `%${search}%`, selectionType==='product' ? selected : null]],
      ...(withSets ? [['set', 'sets', `SELECT l.id,l.title AS name,COALESCE(mm.model_name,'') AS motorcycle_model,
        (SELECT m.url FROM ecommerce_listing_media m WHERE m.listing_id=l.id AND m.media_type='image' ORDER BY m.sort_order LIMIT 1) AS image,
        (SELECT COUNT(*)::int FROM ecommerce_listing_items li WHERE li.listing_id=l.id) AS item_count
        FROM ecommerce_listings l LEFT JOIN motorcycle_models mm ON mm.id=l.motorcycle_model_id
        WHERE l.listing_type='set' AND l.visibility_status='active'
        AND EXISTS (SELECT 1 FROM ecommerce_listing_items li JOIN products ip ON ip.id=li.product_item_id WHERE li.listing_id=l.id AND ip.inventory_status='active' AND COALESCE(ip.is_deleted,false)=false)
        AND ($1::text='' OR l.title ILIKE $2 OR mm.model_name ILIKE $2) AND ($3::int IS NULL OR l.id=$3) ORDER BY l.title,l.id LIMIT 26`, [search, `%${search}%`, selectionType==='set' ? selected : null]]] : []),
      ['promotion', 'promotions', 'SELECT id,code,type,value,min_purchase,starts_at,expires_at,is_active FROM discounts WHERE deleted_at IS NULL ORDER BY (id=$1::int) DESC NULLS LAST,created_at DESC LIMIT 100', [selectionType==='promotion' ? selected : null]],
      ['category', 'categories', 'SELECT id,name FROM categories ORDER BY name', []],
      ['model', 'models', "SELECT id,model_name,brand FROM motorcycle_models WHERE status='active' ORDER BY model_name", []],
    ].filter(([kind]) => type === 'all' || type === kind).map(async ([, key, sql, values]) => { result[key] = (await query(sql, values)).rows; }));
    if (result.products) {
      result.hasMoreProducts = result.products.length > 25;
      result.products = result.products.slice(0,25).map(row=>({id:row.id,name:row.name,part_number:row.part_number,motorcycle_model:row.motorcycle_model,image:row.image,price:calculateEcommercePrice(resolveStoreSellingPrice(row) ?? 0)}));
    }
    if (result.sets) { result.hasMoreSets = result.sets.length > 25; result.sets = result.sets.slice(0,25); }
    else if (type === 'all' || type === 'set') result.sets = [];
    return res.json(result);
  } catch (error) { return failure(res, error); }
}

export async function publicCarouselPromotion(req, res) {
  try {
    const id = idFrom(req.params.id);
    const result = await query(`SELECT d.id,d.code,d.type,d.value,d.min_purchase,d.max_discount,d.starts_at,d.expires_at FROM discounts d
      WHERE d.id=$1 AND d.deleted_at IS NULL AND d.is_active=true AND (d.starts_at IS NULL OR d.starts_at<=NOW())
      AND (d.expires_at IS NULL OR d.expires_at>NOW()) AND (d.max_uses IS NULL OR COALESCE(d.used_count,0)<d.max_uses)
      AND EXISTS (SELECT 1 FROM banners b WHERE b.destination_type='promotion' AND b.destination_id=d.id
        AND b.is_active=true AND (b.starts_at IS NULL OR b.starts_at<=NOW()) AND (b.ends_at IS NULL OR b.ends_at>NOW()))`, [id]);
    if (!result.rows.length) return res.status(404).json({ message: 'This promotion is not currently available.' });
    const { code,type,value,min_purchase,max_discount,starts_at,expires_at } = result.rows[0];
    return res.json({ id,code,type,value,min_purchase,max_discount,starts_at,expires_at });
  } catch (error) { return error.status ? failure(res,error) : res.status(503).json({message:'Promotion details are temporarily unavailable.'}); }
}

export async function saveCarousel(req, res) {
  try {
    const id = req.params.id ? idFrom(req.params.id) : null;
    let previous = {};
    if (id) { previous = (await query('SELECT * FROM banners WHERE id=$1', [id])).rows[0]; if (!previous) return res.status(404).json({ message: 'Slide not found.' }); }
    const input = parseCarouselBanner({ ...previous, starts_at: previous.starts_at instanceof Date ? previous.starts_at.toISOString() : previous.starts_at,
      ends_at: previous.ends_at instanceof Date ? previous.ends_at.toISOString() : previous.ends_at, ...req.body });
    const resolved = await resolveCarouselTargets([input], query, { forManagement: true });
    if (!resolved.length) return res.status(400).json({ message: 'That destination is unavailable. Choose an active storefront item or an existing campaign.' });
    const value = { ...input, link_url: resolved[0].link_url };
    const columns = Object.keys(value);
    const values = columns.map(key => value[key]);
    const sql = id ? `UPDATE banners SET ${columns.map((key,index) => `${key}=$${index+1}`).join(',')},updated_at=NOW() WHERE id=$${values.length+1} RETURNING *`
      : `INSERT INTO banners (${columns.join(',')}) VALUES (${values.map((_,index) => `$${index+1}`).join(',')}) RETURNING *`;
    const row = (await query(sql, id ? [...values,id] : values)).rows[0];
    return res.status(id ? 200 : 201).json({ banner: row });
  } catch (error) { return failure(res, error); }
}
export async function deleteCarousel(req, res) {
  try { const result = await query('DELETE FROM banners WHERE id=$1 RETURNING id', [idFrom(req.params.id)]); return result.rows.length ? res.json({ message: 'Slide deleted.' }) : res.status(404).json({ message: 'Slide not found.' }); }
  catch (error) { return failure(res, error); }
}
