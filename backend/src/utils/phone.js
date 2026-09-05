export const normalizePhilippineMobile = (value) => String(value || '').trim().replace(/[\s()-]/g, '');

export const PHILIPPINE_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

export const getPhoneVerificationState = (phone) => {
  const normalized = normalizePhilippineMobile(phone);
  if (!normalized) {
    return {
      available: false,
      verified: false,
      status: 'not_verified',
      label: 'Not verified',
    };
  }

  return {
    available: false,
    verified: false,
    status: 'unavailable',
    label: 'Verification unavailable',
  };
};
