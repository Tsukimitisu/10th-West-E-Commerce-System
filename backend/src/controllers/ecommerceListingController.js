import pool from '../config/database.js';
import { calculateEcommercePrice, resolveStoreSellingPrice } from '../services/catalogPricing.js';
import { hasSetListingSchema, mapSetOption, normalizeSetItemIds, summarizeSetOptions } from '../services/setListings.js';
import { sanitizeHttpUrlOrPath, sanitizePlainText, sanitizeRichText } from '../utils/inputSanitizer.js';

const VISIBILITY = new Set(['draft', 'active', 'hidden', 'archived']);
const FORBIDDEN_CORE_FIELDS = new Set([
  'name', 'product_name', 'part_number', 'brand', 'motorcycle_model', 'motorcycle_model_id', 'category_id', 'color',
  'stock_quantity', 'quantity', 'cost_price', 'buying_price', 'store_selling_price',
  'price', 'box_location', 'box_number',
]);
// A set owns no inventory row, so its listing-level compatibility is not an
// inventory override. Price/stock fields stay forbidden for every listing type.
const SET_LISTING_FIELDS = new Set(['motorcycle_model_id']);

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const schemaPending = () => fail(503, 'Set listings are not ready. Apply the set storefront listing migration first.', 'SET_LISTING_SCHEMA_PENDING');

const normalizeMedia = (input) => {
  if (!Array.isArray(input)) throw fail(400, 'media must be an array.', 'INVALID_LISTING_MEDIA');
  if (input.length > 10) throw fail(400, 'A listing can contain at most 10 media files.', 'LISTING_MEDIA_LIMIT');
  return input.map((entry, index) => {
    const url = sanitizeHttpUrlOrPath(entry?.url ?? entry?.path);
    const mediaType = String(entry?.media_type ?? entry?.type ?? '').trim().toLowerCase();
    if (!url || !['image', 'video'].includes(mediaType)) {
      throw fail(400, `Media item ${index + 1} requires a valid image/video URL and type.`, 'INVALID_LISTING_MEDIA');
    }
    return {
      url,
      mediaType,
      sortOrder: index,
      altText: sanitizePlainText(entry?.alt_text, { maxLength: 255 }) || null,
    };
  });
};

export const normalizeListingInput = (body) => {
  const listingType = body?.listing_type === 'set' ? 'set' : 'single';
  const forbidden = Object.keys(body || {})
    .filter((key) => FORBIDDEN_CORE_FIELDS.has(key) && !(listingType === 'set' && SET_LISTING_FIELDS.has(key)));
  if (forbidden.length) {
    throw fail(400, `Inventory fields cannot be overridden by a storefront listing: ${forbidden.join(', ')}.`, 'INVENTORY_FIELDS_READ_ONLY');
  }
  const visibilityStatus = String(body?.visibility_status || 'draft').trim().toLowerCase();
  if (!VISIBILITY.has(visibilityStatus)) throw fail(400, 'Invalid storefront visibility status.', 'INVALID_LISTING_STATUS');
  const media = normalizeMedia(body?.media || []);
  if (visibilityStatus === 'active' && media.length < 1) {
    throw fail(400, 'An active listing requires at least one image or video.', 'LISTING_MEDIA_REQUIRED');
  }
  const shared = {
    listingType,
    description: sanitizeRichText(body?.ecommerce_description, { maxLength: 10000 }) || '',
    visibilityStatus,
    isFeatured: body?.is_featured === true,
    isBestSeller: body?.is_best_seller === true,
    isNewArrival: body?.is_new_arrival === true,
    media,
  };
  if (listingType === 'set') {
    const title = sanitizePlainText(body?.title, { maxLength: 160 }) || '';
    if (!title) throw fail(400, 'A set listing title is required.', 'SET_TITLE_REQUIRED');
    const rawModel = body?.motorcycle_model_id;
    const motorcycleModelId = rawModel === undefined || rawModel === null || rawModel === '' ? null : Number(rawModel);
    if (motorcycleModelId !== null && (!Number.isSafeInteger(motorcycleModelId) || motorcycleModelId <= 0)) {
      throw fail(400, 'Choose a valid motorcycle model.', 'INVALID_MOTORCYCLE_MODEL');
    }
    return { ...shared, title, motorcycleModelId, itemIds: normalizeSetItemIds(body?.items ?? body?.item_ids) };
  }
  const inventoryItemId = Number(body?.inventory_item_id);
  if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0) {
    throw fail(400, 'inventory_item_id is required.', 'INVENTORY_ITEM_REQUIRED');
  }
  return { ...shared, inventoryItemId };
};

// Shared by Owner and public set reads: one lateral aggregate per listing, so
// child options never cost one request (or one query) per item.
export const SET_ITEMS_LATERAL = `LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ip.id, 'name', ip.name, 'part_number', ip.part_number, 'color', ip.color,
      'motorcycle_model', COALESCE(im.model_name, ip.motorcycle_model),
      'image', COALESCE((SELECT om.url FROM ecommerce_listing_media om JOIN ecommerce_listings ol ON ol.id = om.listing_id
                          WHERE ol.inventory_item_id = ip.id AND om.media_type = 'image' ORDER BY om.sort_order LIMIT 1), ip.image),
      'store_selling_price', ip.store_selling_price, 'price', ip.price,
      'stock_quantity', ip.stock_quantity, 'reserved_stock', ip.reserved_stock,
      'inventory_status', ip.inventory_status, 'is_deleted', COALESCE(ip.is_deleted, false),
      'has_variants', EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ip.id),
      'sort_order', li.sort_order
    ) ORDER BY li.sort_order), '[]'::jsonb) AS items
      FROM ecommerce_listing_items li
      JOIN products ip ON ip.id = li.product_item_id
      LEFT JOIN motorcycle_models im ON im.id = ip.motorcycle_model_id
     WHERE li.listing_id = l.id
  ) set_items ON true`;

export const LISTING_MEDIA_LATERAL = `LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'url', m.url, 'media_type', m.media_type, 'sort_order', m.sort_order, 'alt_text', m.alt_text
    ) ORDER BY m.sort_order), '[]'::jsonb) AS media
      FROM ecommerce_listing_media m WHERE m.listing_id = l.id
  ) listing_media ON true`;

const listingSelect = (withSets) => `
  SELECT l.id, l.inventory_item_id, l.ecommerce_description, l.visibility_status,
         l.is_featured, l.is_best_seller, l.is_new_arrival, l.created_at, l.updated_at,
         ${withSets
    ? 'l.listing_type, l.title, l.motorcycle_model_id AS set_motorcycle_model_id, set_model.model_name AS set_motorcycle_model, set_items.items,'
    : "'single'::text AS listing_type, NULL::text AS title, NULL::int AS set_motorcycle_model_id, NULL::text AS set_motorcycle_model, '[]'::jsonb AS items,"}
         p.part_number, p.name AS product_name, p.brand,
         COALESCE(model.model_name, p.motorcycle_model) AS motorcycle_model,
         p.motorcycle_model_id, p.color, p.store_selling_price,
         p.stock_quantity, p.reserved_stock, p.box_location, p.inventory_status,
         listing_media.media
    FROM ecommerce_listings l
    LEFT JOIN products p ON p.id = l.inventory_item_id
    LEFT JOIN motorcycle_models model ON model.id = p.motorcycle_model_id
    ${withSets ? `LEFT JOIN motorcycle_models set_model ON set_model.id = l.motorcycle_model_id\n    ${SET_ITEMS_LATERAL}` : ''}
    ${LISTING_MEDIA_LATERAL}`;

export const mapListing = (row) => {
  if (row.listing_type === 'set') {
    const items = (Array.isArray(row.items) ? row.items : []).map((item) => ({
      ...mapSetOption(item),
      store_selling_price: resolveStoreSellingPrice(item),
      inventory_status: item.inventory_status,
    }));
    const summary = summarizeSetOptions(items);
    return {
      ...row,
      product_name: row.title,
      motorcycle_model: row.set_motorcycle_model,
      motorcycle_model_id: row.set_motorcycle_model_id,
      items,
      store_selling_price: null,
      ecommerce_price: summary.price,
      available_stock: summary.stock_quantity,
      item_count: summary.item_count,
    };
  }
  const storePrice = resolveStoreSellingPrice(row) ?? 0;
  return {
    ...row,
    store_selling_price: storePrice,
    ecommerce_price: calculateEcommercePrice(storePrice),
    available_stock: Math.max(0, Number(row.stock_quantity || 0) - Number(row.reserved_stock || 0)),
  };
};

const replaceMedia = async (client, listingId, media) => {
  await client.query('DELETE FROM ecommerce_listing_media WHERE listing_id = $1', [listingId]);
  for (const item of media) {
    await client.query(
      `INSERT INTO ecommerce_listing_media (listing_id, url, media_type, sort_order, alt_text)
       VALUES ($1,$2,$3,$4,$5)`,
      [listingId, item.url, item.mediaType, item.sortOrder, item.altText]
    );
  }
};

// Stores only the relationship to existing inventory rows; never copies them.
export const replaceSetItems = async (client, listingId, itemIds, visibilityStatus) => {
  const found = await client.query(
    `SELECT p.id, p.inventory_status,
            EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id) AS has_variants
       FROM products p
      WHERE p.id = ANY($1::int[]) AND COALESCE(p.is_deleted, false) = false
      FOR SHARE OF p`,
    [itemIds]
  );
  if (found.rows.length !== itemIds.length) throw fail(404, 'One or more selected inventory items no longer exist.', 'SET_ITEM_NOT_FOUND');
  if (found.rows.some((row) => row.has_variants)) {
    throw fail(400, 'Items with variants cannot be added to a set. Choose items without variant options.', 'SET_ITEM_HAS_VARIANTS');
  }
  if (visibilityStatus === 'active' && !found.rows.some((row) => row.inventory_status === 'active')) {
    throw fail(409, 'An active set needs at least one active inventory item.', 'SET_ITEMS_UNAVAILABLE');
  }
  await client.query('DELETE FROM ecommerce_listing_items WHERE listing_id = $1', [listingId]);
  await client.query(
    `INSERT INTO ecommerce_listing_items (listing_id, product_item_id, sort_order)
     SELECT $1, item.id, item.ordinality - 1 FROM unnest($2::int[]) WITH ORDINALITY AS item(id, ordinality)`,
    [listingId, itemIds]
  );
};

const loadListing = async (listingId, withSets) => {
  const loaded = await pool.query(`${listingSelect(withSets)} WHERE l.id=$1`, [listingId]);
  return mapListing(loaded.rows[0]);
};

const sendFailure = (res, error, fallback) => {
  if (error.code === '23503') return res.status(400).json({ message: 'Choose a valid motorcycle model.', code: 'INVALID_MOTORCYCLE_MODEL' });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback, ...(error.code && error.status ? { code: error.code } : {}) });
};

export const getEcommerceListings = async (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    const withSets = await hasSetListingSchema(pool);
    const result = await pool.query(
      `${listingSelect(withSets)}
       WHERE ($1 = '' OR p.part_number ILIKE $2 OR p.name ILIKE $2 OR p.brand ILIKE $2
              OR COALESCE(model.model_name, p.motorcycle_model) ILIKE $2 OR p.color ILIKE $2 OR p.box_location ILIKE $2
              ${withSets ? 'OR l.title ILIKE $2' : ''})
       ORDER BY l.updated_at DESC`,
      [search, `%${search}%`]
    );
    return res.json(result.rows.map(mapListing));
  } catch (error) {
    console.error('Get ecommerce listings failed:', { code: error.code, message: error.message });
    return res.status(500).json({ message: 'Storefront listings could not be loaded.' });
  }
};

export const createEcommerceListing = async (req, res) => {
  const client = await pool.connect();
  try {
    const input = normalizeListingInput(req.body || {});
    const withSets = await hasSetListingSchema(pool);
    if (input.listingType === 'set' && !withSets) throw schemaPending();
    await client.query('BEGIN');
    let listingId;
    if (input.listingType === 'set') {
      const result = await client.query(
        `INSERT INTO ecommerce_listings (
           listing_type, title, motorcycle_model_id, inventory_item_id, ecommerce_description,
           visibility_status, is_featured, is_best_seller, is_new_arrival
         ) VALUES ('set',$1,$2,NULL,$3,$4,$5,$6,$7) RETURNING id`,
        [input.title, input.motorcycleModelId, input.description, input.visibilityStatus,
          input.isFeatured, input.isBestSeller, input.isNewArrival]
      );
      listingId = result.rows[0].id;
      await replaceSetItems(client, listingId, input.itemIds, input.visibilityStatus);
    } else {
      const inventory = await client.query(
        `SELECT id, inventory_status FROM products WHERE id=$1 AND COALESCE(is_deleted,false)=false FOR UPDATE`,
        [input.inventoryItemId]
      );
      if (!inventory.rowCount) throw fail(404, 'Inventory item not found.', 'INVENTORY_ITEM_NOT_FOUND');
      if (input.visibilityStatus === 'active' && inventory.rows[0].inventory_status !== 'active') {
        throw fail(409, 'Only active inventory items can be visible in the storefront.', 'INVENTORY_ITEM_UNAVAILABLE');
      }
      const result = await client.query(
        `INSERT INTO ecommerce_listings (
           inventory_item_id, ecommerce_description, visibility_status,
           is_featured, is_best_seller, is_new_arrival
         ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [input.inventoryItemId, input.description, input.visibilityStatus,
          input.isFeatured, input.isBestSeller, input.isNewArrival]
      );
      listingId = result.rows[0].id;
    }
    await replaceMedia(client, listingId, input.media);
    await client.query('COMMIT');
    return res.status(201).json({ message: 'Storefront listing created.', listing: await loadListing(listingId, withSets) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create ecommerce listing failed:', { code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ message: 'This inventory item already has a storefront listing.', code: 'DUPLICATE_STOREFRONT_LISTING' });
    return sendFailure(res, error, 'Storefront listing could not be created.');
  } finally {
    client.release();
  }
};

export const updateEcommerceListing = async (req, res) => {
  const client = await pool.connect();
  try {
    const listingId = Number(req.params.id);
    if (!Number.isInteger(listingId) || listingId <= 0) throw fail(400, 'Invalid listing ID.');
    const input = normalizeListingInput(req.body || {});
    const withSets = await hasSetListingSchema(pool);
    if (input.listingType === 'set' && !withSets) throw schemaPending();
    await client.query('BEGIN');
    const result = input.listingType === 'set'
      ? await client.query(
        `UPDATE ecommerce_listings SET
           title=$1, motorcycle_model_id=$2, ecommerce_description=$3, visibility_status=$4,
           is_featured=$5, is_best_seller=$6, is_new_arrival=$7, updated_at=NOW()
         WHERE id=$8 AND listing_type='set'
         RETURNING id`,
        [input.title, input.motorcycleModelId, input.description, input.visibilityStatus,
          input.isFeatured, input.isBestSeller, input.isNewArrival, listingId]
      )
      : await client.query(
        `UPDATE ecommerce_listings l SET
           ecommerce_description=$1, visibility_status=$2, is_featured=$3,
           is_best_seller=$4, is_new_arrival=$5, updated_at=NOW()
         FROM products p
         WHERE l.id=$6 AND l.inventory_item_id=$7 AND p.id=l.inventory_item_id
           AND ($2 <> 'active' OR p.inventory_status='active')
         RETURNING l.id`,
        [input.description, input.visibilityStatus, input.isFeatured, input.isBestSeller,
          input.isNewArrival, listingId, input.inventoryItemId]
      );
    if (!result.rowCount) throw fail(404, 'Storefront listing not found or inventory item is unavailable.');
    if (input.listingType === 'set') await replaceSetItems(client, listingId, input.itemIds, input.visibilityStatus);
    await replaceMedia(client, listingId, input.media);
    await client.query('COMMIT');
    return res.json({ message: 'Storefront listing updated.', listing: await loadListing(listingId, withSets) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update ecommerce listing failed:', { code: error.code, message: error.message });
    return sendFailure(res, error, 'Storefront listing could not be updated.');
  }
  finally {
    client.release();
  }
};

const plainText = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Public projection: only customer-safe listing fields plus live child data.
export const toPublicSet = (row) => {
  const options = (Array.isArray(row.items) ? row.items : []).map(mapSetOption);
  const media = (Array.isArray(row.media) ? row.media : []).map(({ url, media_type, sort_order, alt_text }) => ({ url, media_type, sort_order, alt_text: alt_text || null }));
  const summary = summarizeSetOptions(options);
  return {
    id: Number(row.id),
    listing_type: 'set',
    name: row.title,
    description: row.ecommerce_description || '',
    motorcycle_model: row.set_motorcycle_model || null,
    image: media.find((entry) => entry.media_type === 'image')?.url || options.find((option) => option.image)?.image || null,
    media,
    options,
    keywords: options.flatMap((option) => [option.name, option.part_number, option.color]).filter(Boolean),
    is_featured: row.is_featured === true,
    is_new_arrival: row.is_new_arrival === true,
    is_best_seller: row.is_best_seller === true,
    created_at: row.created_at,
    status: summary.available_item_count ? 'active' : 'out_of_stock',
    ...summary,
  };
};

const publicSetSql = (where) => `
  SELECT l.id, l.title, l.ecommerce_description, l.is_featured, l.is_best_seller, l.is_new_arrival, l.created_at,
         set_model.model_name AS set_motorcycle_model, set_items.items, listing_media.media
    FROM ecommerce_listings l
    LEFT JOIN motorcycle_models set_model ON set_model.id = l.motorcycle_model_id
    ${SET_ITEMS_LATERAL}
    ${LISTING_MEDIA_LATERAL}
   WHERE l.listing_type = 'set' AND l.visibility_status = 'active' ${where}`;

export const listPublicSets = async (_req, res) => {
  try {
    if (!(await hasSetListingSchema(pool))) return res.json([]);
    const result = await pool.query(`${publicSetSql('')} ORDER BY l.updated_at DESC LIMIT 60`);
    return res.json(result.rows.map(toPublicSet).filter((set) => set.item_count > 0).map(({ options, ...set }) => ({
      ...set, description: plainText(set.description).slice(0, 280),
      options_preview: options.slice(0, 4).map(({ id, name, image }) => ({ id, name, image })),
    })));
  } catch (error) {
    console.error('List public sets failed:', { code: error.code, message: error.message });
    return res.status(503).json({ message: 'Sets are temporarily unavailable.' });
  }
};

export const getPublicSet = async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isSafeInteger(listingId) || listingId <= 0 || listingId > 2147483647) return res.status(404).json({ message: 'This set is not available.' });
  try {
    if (!(await hasSetListingSchema(pool))) return res.status(404).json({ message: 'This set is not available.' });
    const result = await pool.query(publicSetSql('AND l.id = $1'), [listingId]);
    const set = result.rows[0] ? toPublicSet(result.rows[0]) : null;
    if (!set || !set.item_count) return res.status(404).json({ message: 'This set is not available.' });
    return res.json(set);
  } catch (error) {
    console.error('Get public set failed:', { code: error.code, message: error.message });
    return res.status(503).json({ message: 'This set is temporarily unavailable.' });
  }
};
