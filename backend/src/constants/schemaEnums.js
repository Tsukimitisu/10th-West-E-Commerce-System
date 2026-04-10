export const USER_ROLES = Object.freeze([
  'customer',
  'admin',
  'cashier',
  'super_admin',
  'owner',
  'store_staff',
]);

export const STAFF_ROLES = Object.freeze([
  'admin',
  'super_admin',
  'owner',
  'store_staff',
  'cashier',
]);

export const PRODUCT_PUBLISHER_ROLES = Object.freeze([
  'admin',
  'super_admin',
  'owner',
]);

export const PRODUCT_STATUSES = Object.freeze([
  'draft',
  'published',
]);

export const PRODUCT_SHIPPING_OPTIONS = Object.freeze([
  'standard',
  'express',
]);

export const ORDER_STATUSES = Object.freeze([
  'pending',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
]);

export const REVIEW_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
]);

export const STAFF_ROLE_SET = new Set(STAFF_ROLES);
export const PRODUCT_PUBLISHER_ROLE_SET = new Set(PRODUCT_PUBLISHER_ROLES);
export const PRODUCT_STATUS_SET = new Set(PRODUCT_STATUSES);
export const PRODUCT_SHIPPING_OPTION_SET = new Set(PRODUCT_SHIPPING_OPTIONS);
