// Existing seeded security defaults. On a cold settings outage use these;
// after a successful read retain the last known policy, never relax it on error.
export const SECURITY_DEFAULTS = Object.freeze({
  max_login_attempts: 5, lockout_duration_minutes: 15,
  password_min_length: 8, password_require_uppercase: true,
  password_require_lowercase: true, password_require_number: true,
  password_require_special: true, session_timeout_minutes: 30,
  '2fa_enforcement': 'optional',
});
const integer = (min, max) => value => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
const boolean = value => ['true', 'false'].includes(String(value).toLowerCase());
export const SECURITY_RULES = Object.freeze({
  max_login_attempts: integer(1, 20), lockout_duration_minutes: integer(1, 1440),
  password_min_length: integer(8, 128), password_require_uppercase: boolean,
  password_require_lowercase: boolean, password_require_number: boolean,
  password_require_special: boolean, session_timeout_minutes: integer(5, 10080),
  '2fa_enforcement': value => ['disabled', 'optional', 'required'].includes(String(value)),
});

export const createSecurityPolicyService = ({ db, now = Date.now, ttl = 30_000 } = {}) => {
  let value = SECURITY_DEFAULTS, expires = 0, pending, generation = 0;
  return {
    invalidate() { generation++; expires = 0; pending = undefined; },
    async get() {
      if (now() < expires) return value;
      if (pending) return pending;
      const revision = generation;
      const load = async () => {
        try {
          const source = db || (await import('../config/database.js')).default;
          const result = await source.query("SELECT key, value FROM system_settings WHERE category = 'security'");
          const next = { ...value };
          for (const row of result.rows) {
            if (!Object.hasOwn(SECURITY_RULES, row.key) || !SECURITY_RULES[row.key](row.value)) continue;
            const type = typeof SECURITY_DEFAULTS[row.key];
            next[row.key] = type === 'boolean' ? String(row.value).toLowerCase() === 'true' : type === 'number' ? Number(row.value) : String(row.value);
          }
          if (revision === generation) value = Object.freeze(next);
        } catch {
          // Do not print driver errors: they may include credentials.
          console.warn('Security policy unavailable; retaining secure defaults or last known policy.');
        }
        if (revision === generation) expires = now() + ttl;
        return value;
      };
      pending = load();
      try { return await pending; } finally { if (revision === generation) pending = undefined; }
    },
  };
};
export const securityPolicy = createSecurityPolicyService();

export const getPublicPasswordPolicy = async () => {
  const policy = await securityPolicy.get();
  return Object.fromEntries([
    'password_min_length', 'password_require_uppercase', 'password_require_lowercase',
    'password_require_number', 'password_require_special',
  ].map(key => [key, policy[key]]));
};

export const passwordPolicyError = (password, policy) => {
  const requirements = [
    ['password_require_uppercase', /[A-Z]/, 'uppercase'],
    ['password_require_lowercase', /[a-z]/, 'lowercase'],
    ['password_require_number', /\d/, 'a number'],
    ['password_require_special', /[^\w\s]/, 'a special character'],
  ].filter(([key]) => policy[key]);
  if (typeof password === 'string' && password.length >= policy.password_min_length
    && !/[\r\n]/.test(password)
    && requirements.every(([, regex]) => regex.test(password))) return null;
  return `Password must be at least ${policy.password_min_length} characters${requirements.length ? ` and include ${requirements.map(([, , label]) => label).join(', ')}` : ''}.`;
};
export const validatePolicyPassword = async password => {
  const error = passwordPolicyError(password, await securityPolicy.get());
  if (error) throw new Error(error);
  return true;
};

export const twoFactorRequirement = (user, policy, verified = false) => {
  if (user.two_factor_enabled) return verified ? null : 'challenge';
  return policy['2fa_enforcement'] === 'required' ? 'enroll' : null;
};
export const policyUser = (user, policy, verified = false) => ({
  ...user, requires_2fa_enrollment: twoFactorRequirement(user, policy, verified) === 'enroll',
  requires_2fa_challenge: twoFactorRequirement(user, policy, verified) === 'challenge',
});
