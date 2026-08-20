const DEFAULTS = Object.freeze({
  metroManilaFee: 100,
  provincialFee: 150,
  defaultFee: 120,
  freeShippingThreshold: 3000,
  courier: 'jnt',
  courierName: 'J&T Express',
  serviceType: 'standard',
});

import {
  assertLuzonShippingAvailable,
  classifyPhilippineShippingZone,
} from './shippingLocation.js';
import { estimateDeliveryDistance } from './shippingDistance.js';

export { classifyPhilippineShippingZone } from './shippingLocation.js';

const money = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : fallback;
};

const normalizedPlace = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const envConfig = (environment = process.env) => ({
  metroManilaFee: money(environment.METRO_MANILA_SHIPPING_FEE, DEFAULTS.metroManilaFee),
  provincialFee: money(environment.PROVINCIAL_SHIPPING_FEE, DEFAULTS.provincialFee),
  defaultFee: money(environment.DEFAULT_SHIPPING_FEE, DEFAULTS.defaultFee),
  freeShippingThreshold: money(environment.FREE_SHIPPING_THRESHOLD, DEFAULTS.freeShippingThreshold),
  courier: normalizedPlace(environment.COURIER_PROVIDER) || DEFAULTS.courier,
  courierName: String(environment.JNT_COURIER_NAME || DEFAULTS.courierName).trim(),
  serviceType: normalizedPlace(environment.JNT_DEFAULT_SERVICE).replaceAll(' ', '_') || DEFAULTS.serviceType,
});

export const calculateInternalShippingQuote = ({ subtotal, address, environment = process.env }) => {
  const config = envConfig(environment);
  const normalizedSubtotal = money(subtotal, 0);
  const zone = classifyPhilippineShippingZone(address);
  assertLuzonShippingAvailable(zone);
  const distance = estimateDeliveryDistance({ address, shippingZone: zone, environment });
  const freeShippingApplied = normalizedSubtotal >= config.freeShippingThreshold;
  const zoneFee = zone === 'metro_manila'
    ? config.metroManilaFee
    : zone === 'luzon'
      ? config.provincialFee
      : config.defaultFee;

  return {
    provider: 'internal',
    courier: config.courier,
    courier_name: config.courierName,
    service_type: config.serviceType,
    coverage: 'luzon_only',
    shipping_zone: zone,
    estimated_distance_km: distance.estimated_distance_km,
    distance_class: distance.distance_class,
    far_delivery: distance.far_delivery,
    shipping_fee: freeShippingApplied ? 0 : zoneFee,
    currency: 'PHP',
    free_shipping_applied: freeShippingApplied,
    estimated_delivery_days: '3-7 days',
  };
};

export const normalizeShippingQuoteItems = (input) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    throw Object.assign(new Error('Shipping quote requires 1 to 100 items.'), { status: 400 });
  }
  const merged = new Map();
  for (const raw of input) {
    const productId = Number(raw?.product_id ?? raw?.productId);
    const variantValue = raw?.variant_id ?? raw?.variantId;
    const variantId = variantValue === undefined || variantValue === null || variantValue === ''
      ? null
      : Number(variantValue);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      throw Object.assign(new Error('Each item requires a valid product_id and quantity from 1 to 100.'), { status: 400 });
    }
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) {
      throw Object.assign(new Error('variant_id is invalid.'), { status: 400 });
    }
    const key = `${productId}:${variantId || 0}`;
    const combined = (merged.get(key)?.quantity || 0) + quantity;
    if (combined > 100) {
      throw Object.assign(new Error('Combined item quantity cannot exceed 100.'), { status: 400 });
    }
    merged.set(key, { product_id: productId, variant_id: variantId, quantity: combined });
  }
  return [...merged.values()];
};

export const calculateDatabaseShippingQuote = async (db, { userId, addressId, items }) => {
  const normalizedAddressId = Number(addressId);
  if (!Number.isInteger(normalizedAddressId) || normalizedAddressId <= 0) {
    throw Object.assign(new Error('A valid address_id is required.'), { status: 400 });
  }
  const normalizedItems = normalizeShippingQuoteItems(items);
  const addressResult = await db.query(
    'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
    [normalizedAddressId, userId]
  );
  const address = addressResult.rows[0];
  if (!address) throw Object.assign(new Error('Saved address not found.'), { status: 404 });

  let subtotal = 0;
  for (const item of normalizedItems) {
    const productResult = await db.query(
      `SELECT p.id, p.name, p.price, p.sale_price, p.is_on_sale, p.status, p.is_deleted,
              EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id) AS has_variants
       FROM products p
       WHERE p.id = $1`,
      [item.product_id]
    );
    const product = productResult.rows[0];
    if (!product || product.is_deleted || product.status !== 'active') {
      throw Object.assign(new Error(`Product #${item.product_id} is not available.`), { status: 400 });
    }

    let unitPrice = money(product.sale_price && product.is_on_sale ? product.sale_price : product.price, -1);
    if (item.variant_id) {
      const variantResult = await db.query(
        'SELECT id, price, price_adjustment FROM product_variants WHERE id = $1 AND product_id = $2',
        [item.variant_id, item.product_id]
      );
      const variant = variantResult.rows[0];
      if (!variant) throw Object.assign(new Error(`The selected variant for ${product.name} is invalid.`), { status: 400 });
      unitPrice = variant.price !== null
        ? money(variant.price, -1)
        : money(unitPrice + Number(variant.price_adjustment || 0), -1);
    } else if (product.has_variants) {
      throw Object.assign(new Error(`Select a variant for ${product.name}.`), { status: 400 });
    }
    if (unitPrice < 0) throw Object.assign(new Error(`${product.name} has an invalid price.`), { status: 409 });
    subtotal = money(subtotal + unitPrice * item.quantity, 0);
  }

  return calculateInternalShippingQuote({ subtotal, address });
};

export const getInternalShippingConfig = envConfig;
