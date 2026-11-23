import { publicSetSql, toPublicSet } from '../controllers/ecommerceListingController.js';

export const setListingId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
};

export async function readPublicSet(db, listingId) {
  const result = await db.query(publicSetSql('AND l.id = $1'), [listingId]);
  const set = result.rows[0] ? toPublicSet(result.rows[0]) : null;
  return set?.item_count ? set : null;
}

export const setSnapshot = (set, selected = null) => ({
  reference_type: 'storefront_set', listing_id: set.id,
  name: set.name, listing_name: set.name,
  url: `https://10thwestmotoparts.com/sets/${set.id}`,
  listing_url: `https://10thwestmotoparts.com/sets/${set.id}`,
  image_url: set.image, cover: set.image, cover_image: set.image,
  motorcycle_model: set.motorcycle_model,
  price: set.price, stock_quantity: set.stock_quantity, status: set.status,
  ...(selected ? { selected_product_item_id: selected.id, selected_product_item_name: selected.name,
    selected_product_item_part_number: selected.part_number, selected_product_item_color: selected.color } : {}),
});

export async function readSetWishlist(db, userId) {
  const schema = await db.query("SELECT to_regclass('public.storefront_set_wishlists') IS NOT NULL AS ready");
  if (!schema.rows[0]?.ready) return [];
  const rows = await db.query('SELECT * FROM storefront_set_wishlists WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  return Promise.all(rows.rows.map(async row => {
    const set = await readPublicSet(db, row.listing_id);
    const snapshot = row.snapshot || {};
    return { ...(set || snapshot), id: `set:${row.listing_id}`, wishlist_id: row.id,
      reference_type: 'storefront_set', listing_id: Number(row.listing_id),
      name: set?.name || snapshot.name || 'Unavailable set',
      image_url: set?.image || snapshot.image_url || '',
      is_available: Boolean(set), in_stock: Boolean(set?.available_item_count),
      available_item_count: set?.available_item_count || 0, created_at: row.created_at };
  }));
}
