# Inventory source-of-truth design

## Current state

The legacy `products` table is referenced directly by product variants, carts,
order-item snapshots, stock movements, reservations, and POS sales. It contains
both inventory data (part number, cost, stock, storage box) and storefront data
(description, price and media). Replacing its IDs would put existing carts and
order history at risk.

No rack column or rack table is present in the current schema. The legacy
storage field is `products.box_number`.

## Backward-compatible target

- `products` remains the inventory master record and stable inventory item ID.
- Core inventory fields live on that record: part number, name, brand,
  motorcycle model, category, cost, store selling price, quantity, minimum
  stock, box location and inventory status.
- `ecommerce_listings` is a one-to-one storefront extension selected by
  `inventory_item_id`. It stores only storefront description, visibility and
  merchandising flags.
- `ecommerce_listing_media` stores one to ten ordered image/video entries. The
  first entry is the primary catalog media.
- Customer prices are calculated server-side as `store_selling_price * 1.15`.
  POS uses `store_selling_price`. Order items retain their existing purchase
  price snapshots.
- Stock is never copied into a storefront table. POS and online orders continue
  to reserve/deduct the same inventory record.

## Migration policy

The migration is additive. It backfills store price from the legacy `price`,
box location from `box_number`, listings from existing product visibility and
descriptions, and listing media from existing image/video fields. Legacy
columns remain during the compatibility period and are not exposed as a second
source of truth by new APIs.

Rack data is not introduced or rendered. If an older external import contains a
combined location, only its box value should be copied to `box_location` during
data cleanup; the application UI and APIs use Box Location only.
