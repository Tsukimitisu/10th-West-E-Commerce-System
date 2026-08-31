import pool from '../config/database.js';
import { calculateEcommercePrice, resolveStoreSellingPrice } from '../services/catalogPricing.js';
import { sanitizeHttpUrlOrPath, sanitizePlainText, sanitizeRichText } from '../utils/inputSanitizer.js';

const VISIBILITY = new Set(['draft', 'active', 'hidden', 'archived']);
const FORBIDDEN_CORE_FIELDS = new Set([
  'name', 'product_name', 'part_number', 'brand', 'motorcycle_model', 'motorcycle_model_id', 'category_id', 'color',
  'stock_quantity', 'quantity', 'cost_price', 'buying_price', 'store_selling_price',
  'price', 'box_location', 'box_number',
]);

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

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

const normalizeListingInput = (body) => {
  const forbidden = Object.keys(body || {}).filter((key) => FORBIDDEN_CORE_FIELDS.has(key));
  if (forbidden.length) {
    throw fail(400, `Inventory fields cannot be overridden by a storefront listing: ${forbidden.join(', ')}.`, 'INVENTORY_FIELDS_READ_ONLY');
  }
  const inventoryItemId = Number(body?.inventory_item_id);
  if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0) {
    throw fail(400, 'inventory_item_id is required.', 'INVENTORY_ITEM_REQUIRED');
  }
  const visibilityStatus = String(body?.visibility_status || 'draft').trim().toLowerCase();
  if (!VISIBILITY.has(visibilityStatus)) throw fail(400, 'Invalid storefront visibility status.', 'INVALID_LISTING_STATUS');
  const media = normalizeMedia(body?.media || []);
  if (visibilityStatus === 'active' && media.length < 1) {
    throw fail(400, 'An active listing requires at least one image or video.', 'LISTING_MEDIA_REQUIRED');
  }
  return {
    inventoryItemId,
    description: sanitizeRichText(body?.ecommerce_description, { maxLength: 10000 }) || '',
    visibilityStatus,
    isFeatured: body?.is_featured === true,
    isBestSeller: body?.is_best_seller === true,
    isNewArrival: body?.is_new_arrival === true,
    media,
  };
};

const listingSelect = `
  SELECT l.id, l.inventory_item_id, l.ecommerce_description, l.visibility_status,
         l.is_featured, l.is_best_seller, l.is_new_arrival, l.created_at, l.updated_at,
         p.part_number, p.name AS product_name, p.brand,
         COALESCE(model.model_name, p.motorcycle_model) AS motorcycle_model,
         p.motorcycle_model_id, p.color, p.store_selling_price,
         p.stock_quantity, p.reserved_stock, p.box_location, p.inventory_status,
         COALESCE(
           jsonb_agg(jsonb_build_object(
             'id', m.id, 'url', m.url, 'media_type', m.media_type,
             'sort_order', m.sort_order, 'alt_text', m.alt_text
           ) ORDER BY m.sort_order) FILTER (WHERE m.id IS NOT NULL),
           '[]'::jsonb
         ) AS media
    FROM ecommerce_listings l
    JOIN products p ON p.id = l.inventory_item_id
    LEFT JOIN motorcycle_models model ON model.id = p.motorcycle_model_id
    LEFT JOIN ecommerce_listing_media m ON m.listing_id = l.id`;

const listingGroup = ` GROUP BY l.id, p.id, model.model_name`;

const mapListing = (row) => {
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

export const getEcommerceListings = async (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    const result = await pool.query(
      `${listingSelect}
       WHERE ($1 = '' OR p.part_number ILIKE $2 OR p.name ILIKE $2 OR p.brand ILIKE $2
              OR COALESCE(model.model_name, p.motorcycle_model) ILIKE $2 OR p.color ILIKE $2 OR p.box_location ILIKE $2)
       ${listingGroup}
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
    await client.query('BEGIN');
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
    await replaceMedia(client, result.rows[0].id, input.media);
    await client.query('COMMIT');
    const loaded = await pool.query(`${listingSelect} WHERE l.id=$1 ${listingGroup}`, [result.rows[0].id]);
    return res.status(201).json({ message: 'Storefront listing created.', listing: mapListing(loaded.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create ecommerce listing failed:', { code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ message: 'This inventory item already has a storefront listing.', code: 'DUPLICATE_STOREFRONT_LISTING' });
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Storefront listing could not be created.', ...(error.code ? { code: error.code } : {}) });
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
    await client.query('BEGIN');
    const result = await client.query(
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
    await replaceMedia(client, listingId, input.media);
    await client.query('COMMIT');
    const loaded = await pool.query(`${listingSelect} WHERE l.id=$1 ${listingGroup}`, [listingId]);
    return res.json({ message: 'Storefront listing updated.', listing: mapListing(loaded.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update ecommerce listing failed:', { code: error.code, message: error.message });
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'Storefront listing could not be updated.', ...(error.code ? { code: error.code } : {}) });
  } finally {
    client.release();
  }
};
