const DEFAULTS = Object.freeze({
  metroManilaFee: 100,
  luzonFee: 150,
  defaultFee: 120,
  freeShippingThreshold: 3000,
  smallPackageMaxKg: 1,
  mediumPackageMaxKg: 3,
  largePackageMaxKg: 5,
  mediumPackageSurcharge: 50,
  largePackageSurcharge: 100,
  oversizedPackageSurcharge: 150,
  distanceFreeKm: 5,
  distanceRatePerKm: 5,
  nearDistanceSurcharge: 0,
  midDistanceSurcharge: 30,
  farDistanceSurcharge: 80,
  veryFarDistanceSurcharge: 120,
  courier: 'jnt',
  courierName: 'J&T Express',
  serviceType: 'standard',
});

import {
  assertLuzonShippingAvailable,
  classifyPhilippineShippingZone,
} from './shippingLocation.js';
import { estimateDeliveryDistance } from './shippingDistance.js';
import { MAX_ITEM_QUANTITY, MAX_ITEM_QUANTITY_MESSAGE } from '../../constants/commerce.js';
import { resolveCheckoutAddress } from '../../utils/checkoutAddress.js';

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
  luzonFee: money(environment.LUZON_SHIPPING_FEE ?? environment.PROVINCIAL_SHIPPING_FEE, DEFAULTS.luzonFee),
  defaultFee: money(environment.DEFAULT_SHIPPING_FEE, DEFAULTS.defaultFee),
  freeShippingThreshold: money(environment.FREE_SHIPPING_THRESHOLD, DEFAULTS.freeShippingThreshold),
  smallPackageMaxKg: money(environment.SMALL_PACKAGE_MAX_KG, DEFAULTS.smallPackageMaxKg),
  mediumPackageMaxKg: money(environment.MEDIUM_PACKAGE_MAX_KG, DEFAULTS.mediumPackageMaxKg),
  largePackageMaxKg: money(environment.LARGE_PACKAGE_MAX_KG, DEFAULTS.largePackageMaxKg),
  mediumPackageSurcharge: money(environment.MEDIUM_PACKAGE_SURCHARGE, DEFAULTS.mediumPackageSurcharge),
  largePackageSurcharge: money(environment.LARGE_PACKAGE_SURCHARGE, DEFAULTS.largePackageSurcharge),
  oversizedPackageSurcharge: money(environment.OVERSIZED_PACKAGE_SURCHARGE, DEFAULTS.oversizedPackageSurcharge),
  distanceFreeKm: money(environment.DISTANCE_FREE_KM, DEFAULTS.distanceFreeKm),
  distanceRatePerKm: money(environment.DISTANCE_RATE_PER_KM, DEFAULTS.distanceRatePerKm),
  distanceSurchargeMode: normalizedPlace(environment.DISTANCE_SURCHARGE_MODE).replaceAll(' ', '_') || 'tier',
  distanceSurchargeRounding: normalizedPlace(environment.DISTANCE_SURCHARGE_ROUNDING) || 'ceil',
  nearDistanceSurcharge: money(environment.NEAR_DISTANCE_SURCHARGE, DEFAULTS.nearDistanceSurcharge),
  midDistanceSurcharge: money(environment.MID_DISTANCE_SURCHARGE, DEFAULTS.midDistanceSurcharge),
  farDistanceSurcharge: money(environment.FAR_DISTANCE_SURCHARGE, DEFAULTS.farDistanceSurcharge),
  veryFarDistanceSurcharge: money(environment.VERY_FAR_DISTANCE_SURCHARGE, DEFAULTS.veryFarDistanceSurcharge),
  courier: normalizedPlace(environment.COURIER_PROVIDER) || DEFAULTS.courier,
  courierName: String(environment.JNT_COURIER_NAME || DEFAULTS.courierName).trim(),
  serviceType: normalizedPlace(environment.JNT_DEFAULT_SERVICE).replaceAll(' ', '_') || DEFAULTS.serviceType,
});

export const calculateWeightSurcharge = (actualWeightKg, environment = process.env) => {
  const config = envConfig(environment);
  const normalizedWeight = money(actualWeightKg, 1);
  if (normalizedWeight <= config.smallPackageMaxKg) return { packageClass: 'small', surcharge: 0 };
  if (normalizedWeight <= config.mediumPackageMaxKg) {
    return { packageClass: 'medium', surcharge: config.mediumPackageSurcharge };
  }
  if (normalizedWeight <= config.largePackageMaxKg) {
    return { packageClass: 'large', surcharge: config.largePackageSurcharge };
  }
  return { packageClass: 'oversized', surcharge: config.oversizedPackageSurcharge };
};

const roundDistanceSurcharge = (amount, mode) => {
  if (mode === 'floor') return Math.floor(amount);
  if (mode === 'round') return Math.round(amount);
  return Math.ceil(amount);
};

export const calculateDistanceSurcharge = (distance, environment = process.env) => {
  const config = envConfig(environment);
  if (config.distanceSurchargeMode === 'rate_per_km') {
    const billableKm = Math.max(0, distance.estimated_distance_km - config.distanceFreeKm);
    return money(roundDistanceSurcharge(
      billableKm * config.distanceRatePerKm,
      config.distanceSurchargeRounding
    ), 0);
  }
  const tierSurcharges = {
    near: config.nearDistanceSurcharge,
    mid: config.midDistanceSurcharge,
    far: config.farDistanceSurcharge,
    very_far: config.veryFarDistanceSurcharge,
  };
  return tierSurcharges[distance.distance_class] ?? config.veryFarDistanceSurcharge;
};

export const calculateInternalShippingQuote = ({ subtotal, actualWeightKg = 1, address, environment = process.env }) => {
  const config = envConfig(environment);
  const normalizedSubtotal = money(subtotal, 0);
  const normalizedWeight = money(actualWeightKg, 1);
  const zone = classifyPhilippineShippingZone(address);
  assertLuzonShippingAvailable(zone);
  const distance = estimateDeliveryDistance({ address, shippingZone: zone, environment });
  const weight = calculateWeightSurcharge(normalizedWeight, environment);
  const distanceSurcharge = calculateDistanceSurcharge(distance, environment);
  const freeShippingApplied = normalizedSubtotal >= config.freeShippingThreshold;
  const baseShippingFee = zone === 'metro_manila'
    ? config.metroManilaFee
    : zone === 'luzon'
      ? config.luzonFee
      : config.defaultFee;
  const calculatedShippingFee = money(baseShippingFee + weight.surcharge + distanceSurcharge, 0);

  return {
    provider: 'internal',
    courier: config.courier,
    courier_name: config.courierName,
    service_type: config.serviceType,
    coverage: 'luzon_only',
    shipping_zone: zone,
    base_shipping_fee: baseShippingFee,
    weight_surcharge: weight.surcharge,
    distance_surcharge: distanceSurcharge,
    shipping_fee: freeShippingApplied ? 0 : calculatedShippingFee,
    currency: 'PHP',
    actual_weight_kg: normalizedWeight,
    estimated_distance_km: distance.estimated_distance_km,
    distance_class: distance.distance_class,
    package_class: weight.packageClass,
    far_delivery: distance.far_delivery,
    free_shipping_applied: freeShippingApplied,
    free_shipping_threshold: config.freeShippingThreshold,
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
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      throw Object.assign(new Error(quantity > MAX_ITEM_QUANTITY ? MAX_ITEM_QUANTITY_MESSAGE : `Each item requires a valid product_id and quantity from 1 to ${MAX_ITEM_QUANTITY}.`), { status: 400 });
    }
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) {
      throw Object.assign(new Error('variant_id is invalid.'), { status: 400 });
    }
    const key = `${productId}:${variantId || 0}`;
    const combined = (merged.get(key)?.quantity || 0) + quantity;
    if (combined > MAX_ITEM_QUANTITY) {
      throw Object.assign(new Error(MAX_ITEM_QUANTITY_MESSAGE), { status: 400 });
    }
    merged.set(key, { product_id: productId, variant_id: variantId, quantity: combined });
  }
  return [...merged.values()];
};

export const calculateDatabaseShippingQuote = async (db, {
  userId,
  addressId,
  address: addressPayload,
  items,
  validateAddressLocation = true,
}) => {
  const normalizedItems = normalizeShippingQuoteItems(items);
  const address = await resolveCheckoutAddress(db, {
    userId,
    addressId,
    address: addressPayload,
    saveAddress: false,
    validateLocation: validateAddressLocation,
  });

  let subtotal = 0;
  let actualWeightKg = 0;
  for (const item of normalizedItems) {
    const productResult = await db.query(
      `SELECT p.id, p.name, p.price, p.sale_price, p.is_on_sale, p.status, p.is_deleted, p.weight_kg,
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
    const productWeightKg = money(product.weight_kg, 1);
    if (productWeightKg <= 0) throw Object.assign(new Error(`${product.name} has an invalid product weight.`), { status: 409 });
    subtotal = money(subtotal + unitPrice * item.quantity, 0);
    actualWeightKg = money(actualWeightKg + productWeightKg * item.quantity, 0);
  }

  return calculateInternalShippingQuote({ subtotal, actualWeightKg, address });
};

export const getInternalShippingConfig = envConfig;
