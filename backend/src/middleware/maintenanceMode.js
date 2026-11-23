import { optionalAuth } from './auth.js';
import { readMaintenance } from '../services/maintenanceControl.js';

const operationsRoles = new Set(['owner', 'admin', 'super_admin', 'store_staff', 'cashier']);
const recoveryAuth = /^\/api\/auth\/(?:login|logout|oauth\/exchange|exchange-code|forgot-password(?:\/phone(?:\/verify)?)?|reset-password|verify-reset-token|verify-email|resend-verification|2fa\/(?:setup|verify|challenge))\/?$/i;

export const maintenanceExempt = req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  || /^\/api\/payments\/paymongo\/webhook\/?$/i.test(req.path)
  || recoveryAuth.test(req.path);

export const createMaintenanceMiddleware = ({ db, authenticate = optionalAuth }) => async (req, res, next) => {
  if (!/^\/api(?:\/|$)/i.test(req.path) || maintenanceExempt(req)) return next();
  const restrict = (code, message) => authenticate(req, res, () => {
    if (operationsRoles.has(req.user?.role) && !req.user.requires_2fa_enrollment && !req.user.requires_2fa_challenge) return next(); // Existing route permissions still apply.
    res.set('Retry-After', '60');
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({ code, message, retry_after_seconds: 60 });
  });
  try {
    // Read the persisted flag for each mutation: no stale per-process cache can
    // let a second Render process ignore a newly activated maintenance window.
    const state = await readMaintenance(db);
    if (!state.active) return next();
    return await restrict('MAINTENANCE_MODE', state.message);
  } catch {
    // Failure to check the flag must not silently reopen commerce.
    return restrict('MAINTENANCE_STATUS_UNAVAILABLE', 'The shop is temporarily unavailable. Please try again shortly.');
  }
};

export const publicMaintenanceStatus = db => async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try { const state = await readMaintenance(db); return res.json({ active: state.active, message: state.active ? state.message : null }); }
  catch { return res.status(503).json({ code: 'MAINTENANCE_STATUS_UNAVAILABLE', message: 'The shop is temporarily unavailable. Please try again shortly. If you have already paid, there is no need to pay again.' }); }
};
