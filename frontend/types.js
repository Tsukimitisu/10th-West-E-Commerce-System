// Role constants
export const Role = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  CASHIER: 'cashier'
};

// Order status constants
export const OrderStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Return status constants
export const ReturnStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REFUNDED: 'refunded'
};

// Purchase order status constants
export const POStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  RECEIVED: 'received',
  CANCELLED: 'cancelled'
};

// Adjustment reason constants
export const AdjustmentReason = {
  DAMAGED: 'damaged',
  LOST: 'lost',
  CORRECTION: 'correction',
  TRANSFER: 'transfer',
  RECEIVED: 'received'
};

// Discount type constants
export const DiscountType = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed'
};
