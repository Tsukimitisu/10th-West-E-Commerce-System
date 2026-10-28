import { normalizeShippingPlace, SHIPPING_ZONES } from './shippingLocation.js';

const CITY_DISTANCE_KM = Object.freeze({
  malabon: 0,
  caloocan: 5,
  navotas: 5,
  valenzuela: 8,
  manila: 12,
  'quezon city': 15,
  'san juan': 18,
  mandaluyong: 20,
  pasig: 25,
  makati: 25,
  pasay: 28,
  taguig: 30,
  paranaque: 32,
  'las pinas': 35,
  muntinlupa: 40,
  baguio: 250,
});

const PROVINCE_DISTANCE_KM = Object.freeze({
  bulacan: 35,
  rizal: 40,
  cavite: 45,
  laguna: 65,
  pampanga: 75,
  bataan: 110,
  batangas: 110,
  tarlac: 130,
  'nueva ecija': 140,
  zambales: 160,
  quezon: 160,
  'quezon province': 160,
  'oriental mindoro': 170,
  marinduque: 200,
  pangasinan: 210,
  'occidental mindoro': 220,
  baguio: 250,
  'la union': 270,
  'nueva vizcaya': 280,
  'camarines norte': 300,
  isabela: 350,
  'camarines sur': 390,
  'ilocos sur': 400,
  albay: 470,
  cagayan: 480,
  'ilocos norte': 480,
  sorsogon: 570,
  palawan: 600,
});

const finiteNonNegative = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const normalizeLookupPlace = (value) => normalizeShippingPlace(value)
  .replace(/^city of /, '')
  .replace(/ city$/, '')
  .trim();

const lookupDistance = (table, rawValue) => {
  const normalized = normalizeShippingPlace(rawValue);
  const simplified = normalizeLookupPlace(rawValue);
  if (Object.hasOwn(table, normalized)) return table[normalized];
  if (Object.hasOwn(table, simplified)) return table[simplified];
  return null;
};

export const getDistanceConfig = (environment = process.env) => ({
  metroManilaDefaultKm: finiteNonNegative(environment.METRO_MANILA_DEFAULT_DISTANCE_KM, 20),
  luzonDefaultKm: finiteNonNegative(environment.LUZON_DEFAULT_DISTANCE_KM, 150),
  nearMaxKm: finiteNonNegative(environment.NEAR_DISTANCE_MAX_KM, 10),
  midMaxKm: finiteNonNegative(environment.MID_DISTANCE_MAX_KM, 50),
  farMaxKm: finiteNonNegative(environment.FAR_DISTANCE_MAX_KM, 150),
  maxLuzonDeliveryKm: finiteNonNegative(environment.MAX_LUZON_DELIVERY_DISTANCE_KM, 300),
});

export const classifyDistance = (distanceKm, environment = process.env) => {
  const config = getDistanceConfig(environment);
  if (distanceKm <= config.nearMaxKm) return 'near';
  if (distanceKm <= config.midMaxKm) return 'mid';
  if (distanceKm <= config.farMaxKm) return 'far';
  return 'very_far';
};

export const estimateDeliveryDistance = ({ address = {}, shippingZone, environment = process.env }) => {
  if (shippingZone === SHIPPING_ZONES.OUTSIDE_LUZON || shippingZone === SHIPPING_ZONES.UNKNOWN) {
    throw Object.assign(new Error('Delivery distance is only estimated for classified Luzon addresses.'), {
      status: 422,
      code: shippingZone === SHIPPING_ZONES.OUTSIDE_LUZON
        ? 'SHIPPING_NOT_AVAILABLE'
        : 'SHIPPING_ADDRESS_UNCLEAR',
    });
  }

  const cityDistance = lookupDistance(CITY_DISTANCE_KM, address.city);
  const provinceDistance = lookupDistance(PROVINCE_DISTANCE_KM, address.province || address.state);
  const config = getDistanceConfig(environment);
  const estimatedDistanceKm = cityDistance !== null
    ? cityDistance
    : provinceDistance !== null
      ? provinceDistance
      : shippingZone === SHIPPING_ZONES.METRO_MANILA
        ? config.metroManilaDefaultKm
        : config.luzonDefaultKm;
  const source = cityDistance !== null
    ? 'city'
    : provinceDistance !== null
      ? 'province'
      : 'zone_default';

  return {
    estimated_distance_km: estimatedDistanceKm,
    distance_class: classifyDistance(estimatedDistanceKm, environment),
    distance_source: source,
    far_delivery: estimatedDistanceKm > config.maxLuzonDeliveryKm,
  };
};

export const INTERNAL_DISTANCE_TABLES = Object.freeze({
  city: CITY_DISTANCE_KM,
  province: PROVINCE_DISTANCE_KM,
});
