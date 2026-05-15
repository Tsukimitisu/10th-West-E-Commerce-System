import assert from 'node:assert/strict';
import test from 'node:test';
import { createJntWaybillForOrder } from './jntShipments.js';

const makeDb = ({ existingWaybill = null } = {}) => {
  const order = {
    id: 42,
    status: 'paid',
    source: 'online',
    shipping_method: 'standard',
    waybill_number: existingWaybill,
    waybill_status: existingWaybill ? 'generated' : 'not_requested',
    total_amount: 1250,
    payment_method: 'cod',
    shipping_address: 'Juan Dela Cruz, 123 Test, Barangay 1, Quezon City, Metro Manila 1100, Philippines',
    shipping_address_snapshot: {
      recipient_name: 'Juan Dela Cruz',
      phone: '09171234567',
      street: '123 Test',
      barangay: 'Barangay 1',
      city: 'Quezon City',
      state: 'Metro Manila (NCR)',
      postal_code: '1100',
      province_code: 'NCR',
      city_code: '137404000',
      barangay_code: '137404001',
      address_string: 'Juan Dela Cruz, 123 Test, Barangay 1, Quezon City, Metro Manila 1100, Philippines',
    },
  };
  const items = [
    {
      order_id: 42,
      product_id: 7,
      product_name: 'Brake Pad',
      product_price: 1250,
      quantity: 1,
      shipping_weight_kg: 0.3,
    },
  ];
  const queries = [];
  const client = {
    query: async (sql) => {
      queries.push(String(sql));
      if (String(sql).includes('SELECT id, status, source')) {
        return { rows: [{ ...order }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };

  const db = {
    queries,
    connect: async () => client,
    query: async (sql, params = []) => {
      queries.push(String(sql));
      if (String(sql).startsWith('ALTER TABLE') || String(sql).startsWith('CREATE INDEX')) {
        return { rows: [] };
      }
      if (String(sql).includes('SELECT o.*, u.name AS customer_name')) {
        return { rows: [{ ...order, customer_name: 'Juan Dela Cruz' }] };
      }
      if (String(sql).includes('FROM order_items')) {
        return { rows: items };
      }
      if (String(sql).includes('SELECT id, courier, waybill_number')) {
        return {
          rows: [{
            id: order.id,
            courier: 'jnt',
            waybill_number: order.waybill_number,
            tracking_number: order.waybill_number,
            waybill_status: order.waybill_status,
            waybill_label_payload: order.waybill_label_payload || null,
            courier_metadata: {},
          }],
        };
      }
      if (String(sql).includes('SET courier =') && String(sql).includes('waybill_number = $2')) {
        order.waybill_number = params[1];
        order.tracking_number = params[1];
        order.waybill_status = 'generated';
        order.waybill_label_payload = JSON.parse(params[2]);
        return { rows: [{ ...order }] };
      }
      return { rows: [] };
    },
  };
  return db;
};

test('createJntWaybillForOrder creates a mock J&T waybill and label', async () => {
  process.env.JNT_MOCK_MODE = 'true';
  process.env.JNT_SENDER_PHONE = '09170000000';
  process.env.JNT_SENDER_ADDRESS = '10th West Moto, Quezon City';

  const db = makeDb();
  const order = await createJntWaybillForOrder(db, 42, { generatedBy: 1 });

  assert.equal(order.waybill_status, 'generated');
  assert.match(order.waybill_number, /^JNT/);
  assert.equal(order.tracking_number, order.waybill_number);
  assert.equal(order.waybill_label_payload.barcode_value, order.waybill_number);
  assert.match(order.waybill_label_payload.qr_data_url, /^data:image\/png;base64,/);
});

test('createJntWaybillForOrder is idempotent when a waybill already exists', async () => {
  process.env.JNT_MOCK_MODE = 'true';

  const db = makeDb({ existingWaybill: 'JNTEXISTING123' });
  const waybill = await createJntWaybillForOrder(db, 42, { generatedBy: 1 });

  assert.equal(waybill.waybill_number, 'JNTEXISTING123');
  assert.equal(waybill.waybill_status, 'generated');
  assert.equal(db.queries.some((query) => query.includes('waybill_number = $2')), false);
});
