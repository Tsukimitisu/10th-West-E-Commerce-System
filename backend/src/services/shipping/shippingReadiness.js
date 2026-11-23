const SCHEMA_ERROR_CODES = new Set(['42P01', '42703']);

const emptyActivity = (schemaStatus = 'ready') => ({
  schema_status: schemaStatus,
  last_successful_booking: null,
  last_tracking_refresh: null,
  last_webhook_received: null,
  recent_provider_errors: [],
});

export const getShippingOperationalReadiness = async (db) => {
  try {
    const activity = await db.query(
      `SELECT
         MAX(booked_at) FILTER (WHERE provider_shipment_id IS NOT NULL) AS last_successful_booking,
         MAX(last_tracking_refresh_at) AS last_tracking_refresh,
         MAX(webhook_received_at) AS last_webhook_received
       FROM shipments`
    );
    const recentErrors = await db.query(
      `SELECT order_id, booking_error AS message, updated_at
       FROM shipments
       WHERE booking_error IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 5`
    );
    return {
      ...emptyActivity(),
      ...activity.rows[0],
      recent_provider_errors: recentErrors.rows.map((row) => ({
        order_id: row.order_id,
        message: 'Shipping provider operation failed.',
        updated_at: row.updated_at,
      })),
    };
  } catch (error) {
    if (SCHEMA_ERROR_CODES.has(error?.code)) {
      return emptyActivity('migration_required');
    }
    throw error;
  }
};
