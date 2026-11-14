import { sanitizeHttpUrlOrPath } from '../utils/inputSanitizer.js';

const fail = (message, code = 'INVALID_OPTION_IMAGE') => Object.assign(new Error(message), { status: 400, code });

export function normalizeOptionImages(entries, idField) {
  if (entries === undefined) return undefined;
  if (!Array.isArray(entries) || entries.length > 250) throw fail('Option images must be a bounded list.');
  const seen = new Set();
  return entries.map(entry => {
    const id = Number(entry?.[idField]);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) throw fail('Choose each valid option only once.');
    seen.add(id);
    const value = String(entry?.image_url ?? '').trim();
    const image = value ? sanitizeHttpUrlOrPath(value) : null;
    if (value && !image) throw fail('Choose a valid option image URL.');
    return { id, image };
  });
}

// Run inside the existing listing transaction. Only image associations change;
// variants/products, prices, quantities and uploaded objects are never deleted.
export async function saveListingOptionImages(client, listingId, input, visual) {
  const isSet = input.listingType === 'set';
  const patches = isSet ? input.optionImages : input.variantImages;
  if (!visual && patches === undefined) return;
  const rows = isSet
    ? (await client.query(`SELECT li.product_item_id AS id,li.image_url,p.inventory_status
        FROM ecommerce_listing_items li JOIN products p ON p.id=li.product_item_id
        WHERE li.listing_id=$1 FOR UPDATE OF li`, [listingId])).rows
    : (await client.query('SELECT id,image_url FROM product_variants WHERE product_id=$1 FOR UPDATE', [input.inventoryItemId])).rows;
  const byId = new Map(rows.map(row => [Number(row.id),row]));
  for (const patch of patches || []) {
    if (!byId.has(patch.id)) throw fail('An image option does not belong to this listing.', 'OPTION_NOT_IN_LISTING');
    byId.get(patch.id).image_url = patch.image;
  }
  if (visual && input.visibilityStatus === 'active' && rows.some(row =>
    (!isSet || row.inventory_status === 'active') && !sanitizeHttpUrlOrPath(row.image_url))) {
    throw fail('Every sellable visual option needs an image before this listing can be active.', 'OPTION_IMAGE_REQUIRED');
  }
  for (const { id,image } of patches || []) {
    if (isSet) await client.query('UPDATE ecommerce_listing_items SET image_url=$1 WHERE listing_id=$2 AND product_item_id=$3', [image,listingId,id]);
    else await client.query('UPDATE product_variants SET image_url=$1 WHERE product_id=$2 AND id=$3', [image,input.inventoryItemId,id]);
  }
}
