// Role constants
export const Role = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  CASHIER: 'cashier',
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  STORE_STAFF: 'store_staff'
};

// Order status constants
export const OrderStatus = {
  PENDING: 'pending',
  PAYMENT_PENDING: 'payment_pending',
  PAID: 'paid',
  PROCESSING: 'processing',
  PACKED: 'packed',
  READY_FOR_PICKUP: 'ready_for_pickup',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return_requested',
  RETURN_APPROVED: 'return_approved',
  RETURN_REJECTED: 'return_rejected',
  RETURNED: 'returned',
  REFUND_PROCESSING: 'refund_processing',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  FAILED: 'failed',
};

// Return status constants
export const ReturnStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
