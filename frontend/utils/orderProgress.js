export const fulfillmentSteps = ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
export const fulfillmentStep = status => ({
  pending: 0, payment_pending: 0, paid: 0, processing: 1, preparing: 1, packed: 1,
  ready_for_pickup: 1, shipped: 2, out_for_delivery: 3, delivered: 4, completed: 4,
  cancelled: -1, failed: -1, returned: -1,
}[status] ?? 0);
