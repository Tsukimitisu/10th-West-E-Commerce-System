import { validatePhilippineAddress } from '../services/psgc.js';

const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
const ZIP_REGEX = /^\d{4}$/;

const text = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const coordinate = (value, min, max) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : NaN;
};

const addressError = (message, fieldErrors, status = 400) =>
  Object.assign(new Error(message), { status, fieldErrors });

export const normalizeCheckoutAddress = (input = {}) => ({
  recipient_name: text(input.recipient_name ?? input.name),
  phone: text(input.phone)?.replace(/[\s()-]/g, '') || null,
  street: text(input.street ?? input.address_line ?? input.addressLine),
  barangay: text(input.barangay),
  city: text(input.city),
  state: text(input.state ?? input.province),
  postal_code: text(input.postal_code ?? input.postalCode ?? input.zip)?.replace(/\D/g, '') || null,
  country: text(input.country) || 'Philippines',
  province_code: text(input.province_code ?? input.provinceCode),
  city_code: text(input.city_code ?? input.cityCode),
  barangay_code: text(input.barangay_code ?? input.barangayCode),
  lat: coordinate(input.lat ?? input.latitude, 4.2, 21.3),
  lng: coordinate(input.lng ?? input.longitude, 116, 127),
  address_string: text(input.address_string),
});

export const validateCheckoutAddressFields = (input = {}) => {
  const address = normalizeCheckoutAddress(input);
  const fieldErrors = {};

  if (!address.recipient_name) fieldErrors.recipient_name = 'Recipient name is required.';
  if (!address.phone) fieldErrors.phone = 'Phone is required.';
  else if (!PHONE_REGEX.test(address.phone)) fieldErrors.phone = 'Phone must start with 09 or +639 and contain 11 digits.';
  if (!address.street) fieldErrors.street = 'Street is required.';
  if (!address.barangay) fieldErrors.barangay = 'Barangay is required.';
  if (!address.city) fieldErrors.city = 'City is required.';
  if (!address.state) fieldErrors.state = 'Province is required.';
  if (!address.postal_code) fieldErrors.postal_code = 'ZIP code is required.';
  else if (!ZIP_REGEX.test(address.postal_code)) fieldErrors.postal_code = 'ZIP code must contain exactly 4 digits.';
  if (!/^philippines$/i.test(address.country)) fieldErrors.country = 'Only Philippine addresses are allowed.';
  if (Number.isNaN(address.lat)) fieldErrors.lat = 'Latitude must be within the Philippines.';
  if (Number.isNaN(address.lng)) fieldErrors.lng = 'Longitude must be within the Philippines.';
  if ((address.lat === null) !== (address.lng === null)) fieldErrors.coordinates = 'Both latitude and longitude are required when using a map pin.';

  if (Object.keys(fieldErrors).length > 0) {
    throw addressError('Please correct the highlighted address fields.', fieldErrors);
  }

  return { ...address, country: 'Philippines' };
};

const validateNewAddressLocation = async (address) => {
  const validation = await validatePhilippineAddress(address);
  if (!validation.valid) {
    throw addressError('Please select a valid Philippine address.', validation.fieldErrors);
  }
  return { ...address, ...validation.normalized, country: 'Philippines' };
};

const buildAddressString = (address) => [
  address.street,
  address.barangay,
  address.city,
  `${address.state} ${address.postal_code}`.trim(),
  'Philippines',
].filter(Boolean).join(', ');

export const resolveCheckoutAddress = async (db, {
  userId,
  addressId,
  address: addressPayload,
  saveAddress = false,
  lockSavedAddress = false,
  validateLocation = true,
}) => {
  const hasAddressId = addressId !== undefined && addressId !== null && addressId !== '';
  if (hasAddressId) {
    const id = Number(addressId);
    if (!Number.isInteger(id) || id <= 0) throw addressError('A valid saved address_id is required.');
    const result = await db.query(
      `SELECT * FROM addresses WHERE id = $1 AND user_id = $2${lockSavedAddress ? ' FOR SHARE' : ''}`,
      [id, userId]
    );
    if (!result.rows[0]) throw addressError('Saved address not found.', undefined, 404);
    return { ...validateCheckoutAddressFields(result.rows[0]), id: result.rows[0].id };
  }

  if (!addressPayload || typeof addressPayload !== 'object' || Array.isArray(addressPayload)) {
    throw addressError('Provide a saved address_id or a complete shipping address.');
  }

  const normalized = validateCheckoutAddressFields(addressPayload);
  const address = validateLocation ? await validateNewAddressLocation(normalized) : normalized;
  const completeAddress = {
    ...address,
    address_string: address.address_string || buildAddressString(address),
    id: null,
  };

  if (!saveAddress) return completeAddress;

  const result = await db.query(
    `INSERT INTO addresses (
       user_id, recipient_name, phone, street, barangay, city, state, postal_code, country,
       address_string, lat, lng, is_default, province_code, city_code, barangay_code
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Philippines',$9,$10,$11,false,$12,$13,$14)
     RETURNING *`,
    [
      userId, address.recipient_name, address.phone, address.street, address.barangay,
      address.city, address.state, address.postal_code, completeAddress.address_string,
      address.lat, address.lng, address.province_code, address.city_code, address.barangay_code,
    ]
  );

  return result.rows[0];
};

