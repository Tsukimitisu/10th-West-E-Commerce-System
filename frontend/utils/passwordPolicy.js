// Same secure defaults as the backend securityPolicy service.
export const DEFAULT_PASSWORD_POLICY = Object.freeze({
  password_min_length: 8, password_require_uppercase: true,
  password_require_lowercase: true, password_require_number: true, password_require_special: true,
});
const requirements = [
  ['uppercase', /[A-Z]/, 'One uppercase letter', 'uppercase'],
  ['lowercase', /[a-z]/, 'One lowercase letter', 'lowercase'],
  ['number', /\d/, 'One number', 'a number'],
  ['special', /[^\w\s]/, 'One special character', 'a special character'],
];
export const normalizePasswordPolicy = input => Object.fromEntries(Object.entries(DEFAULT_PASSWORD_POLICY).map(([key, fallback]) => {
  const value = input?.[key];
  const valid = typeof fallback === 'number'
    ? Number.isInteger(value) && value >= 8 && value <= 128
    : typeof value === 'boolean';
  return [key, valid ? value : fallback];
}));
export const loadPasswordPolicy = async request => {
  try { return normalizePasswordPolicy(await request()); }
  catch { return DEFAULT_PASSWORD_POLICY; }
};
export const passwordChecks = (password, policy) => [
  { key: 'length', label: `At least ${policy.password_min_length} characters`, pass: password.length >= policy.password_min_length },
  ...requirements.filter(([key]) => policy[`password_require_${key}`]).map(([key, regex, label]) => ({ key, label, pass: regex.test(password) })),
];
export const passwordRequirementsText = policy => {
  const included = requirements.filter(([key]) => policy[`password_require_${key}`]).map(([, , , text]) => text);
  return `Password must be at least ${policy.password_min_length} characters${included.length ? ` and include ${included.join(', ')}` : ''}.`;
};
export const passwordPolicyError = (password, policy) => typeof password === 'string'
  && !/[\r\n]/.test(password) && passwordChecks(password, policy).every(check => check.pass)
  ? null : passwordRequirementsText(policy);
