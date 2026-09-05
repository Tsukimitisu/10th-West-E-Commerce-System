const PSGC_BASE_URL = 'https://psgc.gitlab.io/api';
const NCR_REGION_CODE = '130000000';
const NCR_PROVINCE_CODE = 'NCR';

const cache = new Map();

const normalizePlaceName = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[().,-]/g, ' ')
  .replace(/\b(city|municipality|province|barangay|brgy)\b/g, ' ')
  .replace(/\bof\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^(ncr|metro manila|metro manila ncr|national capital region)$/, 'metro manila');

const fetchJson = async (path) => {
  const url = `${PSGC_BASE_URL}${path}`;
  if (cache.has(url)) return cache.get(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': '10th-west-moto-address-validation',
      },
    });
    if (!res.ok) throw new Error(`PSGC request failed: ${res.status}`);
    const data = await res.json();
    cache.set(url, data);
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getProvinces = async () => {
  const rows = await fetchJson('/provinces/?per_page=200');
  return [
    { code: NCR_PROVINCE_CODE, name: 'Metro Manila (NCR)', isNcr: true },
    ...(Array.isArray(rows) ? rows : []),
  ];
};

const getCities = async (provinceCode) => {
  if (provinceCode === NCR_PROVINCE_CODE) {
    return fetchJson(`/regions/${NCR_REGION_CODE}/cities-municipalities/?per_page=500`);
  }
  return fetchJson(`/provinces/${provinceCode}/cities-municipalities/?per_page=500`);
};

const getBarangays = async (cityCode) => fetchJson(`/cities-municipalities/${cityCode}/barangays/?per_page=1000`);

const findByCodeOrName = (rows, code, name) => {
  const normalizedCode = String(code || '').trim();
  const normalizedName = normalizePlaceName(name);

  if (normalizedCode) {
    const match = rows.find((row) => String(row.code || '').trim() === normalizedCode);
    if (match) return match;
  }

  if (normalizedName) {
    return rows.find((row) => normalizePlaceName(row.name) === normalizedName) || null;
  }

  return null;
};

export const normalizePsgcCode = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

export const validatePhilippineAddress = async ({
  state,
  city,
  barangay,
  province_code,
  city_code,
  barangay_code,
} = {}) => {
  const fieldErrors = {};
  const normalized = {
    state: String(state || '').trim(),
    city: String(city || '').trim(),
    barangay: String(barangay || '').trim(),
    province_code: normalizePsgcCode(province_code),
    city_code: normalizePsgcCode(city_code),
    barangay_code: normalizePsgcCode(barangay_code),
  };

  if (!normalized.state) fieldErrors.state = 'Province is required.';
  if (!normalized.city) fieldErrors.city = 'City is required.';
  if (!normalized.barangay) fieldErrors.barangay = 'Barangay is required.';
  if (Object.keys(fieldErrors).length > 0) return { valid: false, fieldErrors, normalized };

  try {
    const province = findByCodeOrName(await getProvinces(), normalized.province_code, normalized.state);
    if (!province) {
      return {
        valid: false,
        fieldErrors: { state: 'Select a valid Philippine province/region.' },
        normalized,
      };
    }

    const cities = await getCities(province.code);
    const cityRow = findByCodeOrName(Array.isArray(cities) ? cities : [], normalized.city_code, normalized.city);
    if (!cityRow) {
      return {
        valid: false,
        fieldErrors: { city: 'Select a valid city/municipality for the selected province.' },
        normalized: {
          ...normalized,
          state: province.name,
          province_code: province.code,
        },
      };
    }

    const barangays = await getBarangays(cityRow.code);
    const barangayRow = findByCodeOrName(Array.isArray(barangays) ? barangays : [], normalized.barangay_code, normalized.barangay);
    if (!barangayRow) {
      return {
        valid: false,
        fieldErrors: { barangay: 'Select a valid barangay for the selected city/municipality.' },
        normalized: {
          ...normalized,
          state: province.name,
          province_code: province.code,
          city: cityRow.name,
          city_code: cityRow.code,
        },
      };
    }

    return {
      valid: true,
      fieldErrors: {},
      normalized: {
        state: province.name,
        province_code: province.code,
        city: cityRow.name,
        city_code: cityRow.code,
        barangay: barangayRow.name,
        barangay_code: barangayRow.code,
      },
    };
  } catch (error) {
    return {
      valid: false,
      fieldErrors: {
        address: 'Unable to validate Philippine address right now. Please try again.',
      },
      normalized,
      error,
    };
  }
};
