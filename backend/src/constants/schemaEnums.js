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
  'store_staff',
]);

export const PRODUCT_STATUSES = Object.freeze([
  'draft',
  'active',
  'out_of_stock',
  'archived',
]);

export const PRODUCT_TYPES = Object.freeze([
  'single',
  'bundle',
]);

export const CHAT_THREAD_STATUSES = Object.freeze([
  'open',
  'closed',
  'blocked',
  'archived',
]);

export const CHAT_MESSAGE_TYPES = Object.freeze([
  'text',
  'image',
  'video',
  'file',
  'system',
]);

export const PRODUCT_SHIPPING_OPTIONS = Object.freeze([
  'standard',
  'express',
]);

export const ORDER_STATUSES = Object.freeze([
  'pending',
  'payment_pending',
  'paid',
  'processing',
  'packed',
  'ready_for_pickup',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'return_requested',
  'return_approved',
  'return_rejected',
  'returned',
  'refund_processing',
  'refunded',
  'partially_refunded',
  'failed',
]);

export const REVIEW_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
]);

export const STAFF_ROLE_SET = new Set(STAFF_ROLES);
export const PRODUCT_PUBLISHER_ROLE_SET = new Set(PRODUCT_PUBLISHER_ROLES);
export const PRODUCT_STATUS_SET = new Set(PRODUCT_STATUSES);
export const PRODUCT_TYPE_SET = new Set(PRODUCT_TYPES);
export const PRODUCT_SHIPPING_OPTION_SET = new Set(PRODUCT_SHIPPING_OPTIONS);
export const CHAT_THREAD_STATUS_SET = new Set(CHAT_THREAD_STATUSES);
export const CHAT_MESSAGE_TYPE_SET = new Set(CHAT_MESSAGE_TYPES);
