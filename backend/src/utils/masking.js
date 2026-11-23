export const maskEmail = value => {
  const [local, domain] = String(value || '').split('@');
  return local && domain ? `${local[0]}•••••••@${domain}` : '•••••••';
};
export const maskPhone = value => {
  const phone = String(value || '');
  return phone.startsWith('+63') && phone.length >= 10 ? `+63•••••••${phone.slice(-3)}` : '•••••••';
};
export const lockedAccountSummary = user => ({
  id: user.id,
  masked_email: maskEmail(user.email),
  category: `${String(user.role || 'user').replaceAll('_', ' ')} account`,
  login_attempts: user.login_attempts,
  lock_stage: user.login_lock_stage,
  locked_until: user.locked_until,
  recovery_required: Boolean(user.login_security_locked_at || user.login_lock_stage >= 3),
});
