export const normalizePhilippineMobile = (value) => {
  const compact = String(value || '').trim().replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^639\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
};

export const isValidPhilippineMobile = (value) => /^\+639\d{9}$/.test(normalizePhilippineMobile(value));
