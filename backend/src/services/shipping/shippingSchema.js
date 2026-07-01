import { ProviderError } from './providerError.js';

const REQUIRED_SHIPMENT_COLUMNS = [
  'shipping_provider',
  'tracking_provider',
  'provider_tracking_id',
  'provider_status',
  'normalized_status',
  'booking_error',
];

export const assertShippingProviderSchema = async (db) => {
  const result = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'shipments'
       AND column_name = ANY($1::text[])`,
    [REQUIRED_SHIPMENT_COLUMNS]
  );
  const found = new Set(result.rows.map((row) => row.column_name));
  if (REQUIRED_SHIPMENT_COLUMNS.some((column) => !found.has(column))) {
    throw new ProviderError('Shipping storage is not ready. Apply pending database migrations.', {
      code: 'SHIPPING_SCHEMA_NOT_READY',
      status: 503,
    });
  }
};
