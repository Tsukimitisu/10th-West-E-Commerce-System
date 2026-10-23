import { calculateEcommercePrice, resolveStoreSellingPrice } from './catalogPricing.js';

export const MAX_SET_ITEMS = 50;
const SCHEMA_RETRY_MS = 60_000;
let schemaState = { ready: null, checkedAt: 0 };

// Set listing code ships before its additive migration may be applied. Until
// the relation table exists, every storefront query keeps the legacy
// single-listing behaviour instead of failing on a missing relation.
export async function hasSetListingSchema(db) {
  if (schemaState.ready === true) return true;
  if (schemaState.ready === false && Date.now() - schemaState.checkedAt < SCHEMA_RETRY_MS) return false;
  let ready = false;
  try {
    const result = await db.query("SELECT to_regclass('public.ecommerce_listing_items') IS NOT NULL AS ready");
    ready = result?.rows?.[0]?.ready === true;
  } catch {
    ready = false;
  }
  schemaState = { ready, checkedAt: Date.now() };
  return ready;
}

export const resetSetListingSchemaCache = (ready = null) => { schemaState = { ready, checkedAt: Date.now() }; };

// A product is storefront-visible through its own active single listing, or
// through membership in an active set listing. Returns 'active' | 'hidden'.
export const storefrontVisibilitySql = (alias, withSets) => `(CASE WHEN EXISTS (
    SELECT 1 FROM ecommerce_listings own_el WHERE own_el.inventory_item_id = ${alias}.id AND own_el.visibility_status = 'active'
  )${withSets ? ` OR EXISTS (
    SELECT 1 FROM ecommerce_listing_items set_li JOIN ecommerce_listings set_el ON set_el.id = set_li.listing_id
     WHERE set_li.product_item_id = ${alias}.id AND set_el.listing_type = 'set' AND set_el.visibility_status = 'active'
  )` : ''} THEN 'active' ELSE 'hidden' END)`;

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

export function normalizeSetItemIds(input) {
  if (!Array.isArray(input)) throw fail(400, 'Choose at least one inventory item for the set.', 'SET_ITEMS_REQUIRED');
  const ids = input.map((value) => Number(value?.product_item_id ?? value?.id ?? value));
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) throw fail(400, 'Set items must be valid inventory item IDs.', 'INVALID_SET_ITEMS');
  if (new Set(ids).size !== ids.length) throw fail(400, 'Each inventory item can appear only once in a set.', 'DUPLICATE_SET_ITEMS');
  if (ids.length < 1) throw fail(400, 'Choose at least one inventory item for the set.', 'SET_ITEMS_REQUIRED');
  if (ids.length > MAX_SET_ITEMS) throw fail(400, `A set can include at most ${MAX_SET_ITEMS} items.`, 'SET_ITEMS_LIMIT');
  return ids;
}

// Child options are derived only from live inventory rows. Listing metadata
// never supplies price, stock or availability.
export function mapSetOption(row) {
  const storePrice = resolveStoreSellingPrice(row);
  const availableStock = Math.max(0, Number(row.stock_quantity || 0) - Number(row.reserved_stock || 0));
  const active = row.inventory_status === 'active' && !row.is_deleted;
  const hasVariants = row.has_variants === true;
  const isAvailable = active && !hasVariants && storePrice != null && availableStock > 0;
  return {
    id: Number(row.id),
    name: row.name,
    part_number: row.part_number || null,
    color: row.color || null,
    motorcycle_model: row.motorcycle_model || null,
    image: row.image || null,
    price: storePrice == null ? null : calculateEcommercePrice(storePrice),
    stock_quantity: active ? availableStock : 0,
    sort_order: Number(row.sort_order || 0),
    is_available: isAvailable,
    unavailable_reason: isAvailable ? null : !active || hasVariants || storePrice == null ? 'Unavailable' : 'Out of stock',
  };
}

export function summarizeSetOptions(options) {
  const available = options.filter((option) => option.is_available);
  const prices = (available.length ? available : options).map((option) => option.price).filter((price) => price != null);
  return {
    price: prices.length ? Math.min(...prices) : 0,
    max_price: prices.length ? Math.max(...prices) : 0,
    stock_quantity: available.reduce((sum, option) => sum + option.stock_quantity, 0),
    item_count: options.length,
    available_item_count: available.length,
  };
}
