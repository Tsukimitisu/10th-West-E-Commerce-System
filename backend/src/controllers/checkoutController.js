const unsupported = (_req, res) => res.status(410).json({
  message: 'Legacy Stripe checkout is disabled. Use /api/checkout for COD or /api/payments/paymongo/checkout for GCash.',
});

export const createPaymentIntent = unsupported;
export const verifyPayment = unsupported;
export const getPublishableKey = unsupported;
