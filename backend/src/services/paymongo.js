import crypto from 'crypto';

const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

const normalizeText = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const getSecretKey = () => normalizeText(process.env.PAYMONGO_SECRET_KEY);

const getPublicBaseUrl = () => (
  normalizeText(process.env.PUBLIC_APP_URL)
  || normalizeText(process.env.FRONTEND_URL)
  || 'http://localhost:3000'
).replace(/\/+$/, '');

const buildAuthHeader = () => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    const error = new Error('PayMongo secret key is not configured.');
    error.code = 'PAYMONGO_NOT_CONFIGURED';
    throw error;
  }

  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
};

const parsePaymongoResponse = async (response) => {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      body?.errors?.[0]?.detail
      || body?.errors?.[0]?.title
      || `PayMongo request failed with ${response.status}`
    );
    error.code = 'PAYMONGO_API_ERROR';
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
};

export const createPaymongoGcashCheckout = async ({ order, items }) => {
  const baseUrl = getPublicBaseUrl();
  const orderId = Number(order.id);
  const orderNumber = order.order_number || `TWM-${String(orderId).padStart(8, '0')}`;
  let lineItems = items.map((item) => ({
    currency: 'PHP',
    amount: Math.round(Number(item.product_price || item.price || 0) * 100),
    name: String(item.product_name || item.name || `Product #${item.product_id}`).slice(0, 120),
    quantity: Math.max(1, Number.parseInt(String(item.quantity || 1), 10)),
  })).filter((item) => item.amount > 0);

  const orderTotalCents = Math.round(Number(order.total_amount || 0) * 100);
  const lineItemsTotalCents = lineItems.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
  if (orderTotalCents > 0 && lineItemsTotalCents !== orderTotalCents) {
    lineItems = [{
      currency: 'PHP',
      amount: orderTotalCents,
      name: `10th West Moto ${orderNumber}`.slice(0, 120),
      quantity: 1,
    }];
  }

  const response = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          description: `10th West Moto Order #${orderId}`,
          line_items: lineItems,
          payment_method_types: ['gcash'],
          success_url: `${baseUrl}/#/payment-result?order=${orderId}&status=success`,
          cancel_url: `${baseUrl}/#/payment-result?order=${orderId}&status=cancelled`,
          metadata: {
            order_id: String(orderId),
            order_number: String(orderNumber),
            payment_reference: String(order.payment_reference || ''),
          },
        },
      },
    }),
  });

  const body = await parsePaymongoResponse(response);
  const checkout = body?.data;
  const attributes = checkout?.attributes || {};
  const checkoutUrl = attributes.checkout_url || attributes.url || attributes.redirect_url;

  if (!checkout?.id || !checkoutUrl) {
    const error = new Error('PayMongo did not return a checkout URL.');
    error.code = 'PAYMONGO_CHECKOUT_URL_MISSING';
    error.body = body;
    throw error;
  }

  return {
    id: checkout.id,
    checkout_url: checkoutUrl,
    raw: body,
  };
};

const parseSignatureHeader = (header) => {
  const parts = {};
  String(header || '').split(',').forEach((part) => {
    const [key, value] = part.split('=');
    if (!key || value === undefined) return;
    parts[key.trim()] = value.trim();
  });
  return parts;
};

export const verifyPaymongoWebhookSignature = ({ rawBody, signatureHeader }) => {
  const webhookSecret = normalizeText(process.env.PAYMONGO_WEBHOOK_SECRET);
  if (!webhookSecret) return true;

  const parts = parseSignatureHeader(signatureHeader);
  const timestamp = parts.t;
  const expected = process.env.NODE_ENV === 'production' ? parts.li : (parts.te || parts.li);

  if (!timestamp || !expected || !rawBody) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const signedPayload = `${timestamp}.${payload}`;
  const digest = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
  } catch {
    return false;
  }
};
