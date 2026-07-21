import pool from '../config/database.js';
import { createPaymongoRefund } from '../services/paymongo.js';
import { emitNotification, emitOrderStatusUpdate, emitReturnCreated, emitReturnUpdated, emitStockUpdate } from '../socket.js';
import { getRuntimeSettings } from '../services/settings.js';
import { writeAuditLog } from '../utils/audit.js';

const cleanEvidence = (input) => Array.isArray(input)
  ? [...new Set(input.map((value) => String(value || '').trim()).filter((value) => /^https:\/\//i.test(value)).slice(0, 8))]
  : [];

export const createReturnSecure = async (req, res) => {
  const orderId = Number(req.body?.order_id);
  const reason = String(req.body?.reason || '').trim();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const evidence = cleanEvidence(req.body?.evidence_urls);
  const refundMethod = String(req.body?.refund_method || 'original').trim();
  if (!Number.isInteger(orderId) || orderId <= 0 || !reason || reason.length > 1000 || !items.length) {
    return res.status(400).json({ message: 'order_id, items, and a reason of at most 1000 characters are required.' });
  }
  if (!['original', 'store_credit'].includes(refundMethod)) return res.status(400).json({ message: 'Invalid refund method.' });
  const requested = new Map();
  for (const raw of items) {
    const orderItemId = Number(raw?.order_item_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Each return item requires a valid order_item_id and positive quantity.' });
    }
    requested.set(orderItemId, (requested.get(orderItemId) || 0) + quantity);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`, [orderId, req.user.id]);
    const order = orderResult.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Delivered order not found.' }); }
    if (order.status !== 'delivered') { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Only delivered orders are eligible for return.' }); }
    const returnSettings = await getRuntimeSettings(client, 'returns', { return_window_days: 15 });
    const returnDays = Math.max(0, returnSettings.return_window_days);
    const deliveredAt = new Date(order.delivered_at || order.updated_at);
    if (Date.now() > deliveredAt.getTime() + returnDays * 86400000) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `The ${returnDays}-day return window has closed.` });
    }
    const itemRows = await client.query(
      `SELECT oi.*, COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id = ri.return_id
         WHERE ri.order_item_id = oi.id AND r.status NOT IN ('rejected','cancelled')),0)::int AS already_requested
       FROM order_items oi WHERE oi.order_id = $1 AND oi.id = ANY($2::int[]) FOR UPDATE`,
      [orderId, [...requested.keys()]]
    );
    if (itemRows.rowCount !== requested.size) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'One or more items do not belong to this order.' }); }
    let refundAmount = 0;
    const normalized = [];
    for (const row of itemRows.rows) {
      const quantity = requested.get(Number(row.id));
      if (quantity + Number(row.already_requested) > Number(row.quantity)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `Return quantity exceeds the remaining quantity for ${row.product_name}.` });
      }
      const amount = Number(row.product_price) * quantity;
      refundAmount += amount;
      normalized.push({ order_item_id: row.id, product_id: row.product_id, variant_id: row.variant_id, name: row.product_name, quantity, price: Number(row.product_price), refund_amount: amount });
    }
    const created = await client.query(
      `INSERT INTO returns (order_id,user_id,reason,status,refund_amount,return_type,items,evidence_urls,refund_method)
       VALUES ($1,$2,$3,'pending',$4,'online',$5::jsonb,$6::jsonb,$7) RETURNING *`,
      [orderId, req.user.id, reason, refundAmount, JSON.stringify(normalized), JSON.stringify(evidence), refundMethod]
    );
    for (const item of normalized) {
      await client.query(
        `INSERT INTO return_items (return_id,order_item_id,quantity,reason,refund_amount) VALUES ($1,$2,$3,$4,$5)`,
        [created.rows[0].id, item.order_item_id, item.quantity, reason, item.refund_amount]
      );
    }
    await client.query(`UPDATE orders SET status = 'return_requested', updated_at = NOW() WHERE id = $1`, [orderId]);
    await client.query(
      `INSERT INTO order_status_history (order_id,from_status,to_status,source,changed_by,note,metadata)
       VALUES ($1,'delivered','return_requested','return',$2,$3,$4::jsonb)`,
      [orderId, req.user.id, reason, JSON.stringify({ return_id: created.rows[0].id })]
    );
    await writeAuditLog(client, {
      req,
      actorUserId: req.user.id,
      action: 'return.create',
      entityType: 'return',
      entityId: created.rows[0].id,
      afterData: {
        order_id: orderId,
        status: 'pending',
        refund_method: refundMethod,
        refund_amount: refundAmount,
      },
      metadata: { order_id: orderId, item_count: normalized.length },
    });
    await client.query('COMMIT');
    emitReturnCreated(created.rows[0]);
    emitOrderStatusUpdate(orderId, 'return_requested');
    return res.status(201).json(created.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create secure return failed:', error);
    return res.status(500).json({ message: 'Return request could not be created.' });
  } finally { client.release(); }
};

const finalizeRefund = async ({ refundId, providerReference, providerResponse, actorId }) => {
  const client = await pool.connect();
  const stockUpdates = [];
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT f.*, r.order_id, r.user_id, r.status AS return_status, r.refund_method, o.status AS order_status
       FROM refunds f JOIN returns r ON r.id = f.return_id JOIN orders o ON o.id = r.order_id WHERE f.id = $1 FOR UPDATE OF f,r,o`,
      [refundId]
    );
    const refund = result.rows[0];
    if (!refund || refund.status === 'succeeded') { await client.query('COMMIT'); return refund; }
    const items = await client.query(
      `SELECT ri.*, oi.product_id, oi.variant_id, oi.quantity AS purchased_quantity, oi.returned_quantity
       FROM return_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.return_id = $1 FOR UPDATE OF oi`,
      [refund.return_id]
    );
    for (const item of items.rows) {
      if (Number(item.returned_quantity) + Number(item.quantity) > Number(item.purchased_quantity)) throw new Error('Return stock was already restored.');
      const stock = item.variant_id
        ? await client.query(`UPDATE product_variants SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_quantity - $1 AS stock_before, stock_quantity AS stock_after`, [item.quantity, item.variant_id])
        : await client.query(`UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_quantity - $1 AS stock_before, stock_quantity AS stock_after`, [item.quantity, item.product_id]);
      await client.query(`UPDATE order_items SET returned_quantity = returned_quantity + $1 WHERE id = $2`, [item.quantity, item.order_item_id]);
      await client.query(
        `INSERT INTO stock_movements (product_id,variant_id,order_id,quantity_delta,stock_before,stock_after,reason,reference_type,reference_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'return','refund',$7,$8)`,
        [item.product_id, item.variant_id, refund.order_id, item.quantity, stock.rows[0].stock_before, stock.rows[0].stock_after, refund.id, actorId]
      );
      stockUpdates.push({ product_id: item.product_id, variant_id: item.variant_id, stock_quantity: Number(stock.rows[0].stock_after) });
    }
    if (refund.refund_method === 'store_credit') {
      await client.query(`INSERT INTO store_credits (user_id,amount,reason,reference_id,reference_type) VALUES ($1,$2,$3,$4,'return')`, [refund.user_id, refund.amount, `Refund for return #${refund.return_id}`, refund.return_id]);
      await client.query(`UPDATE users SET store_credit = store_credit + $1 WHERE id = $2`, [refund.amount, refund.user_id]);
    }
    const totals = await client.query(
      `SELECT COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'succeeded' OR f.id = $2),0) AS refunded,
              p.amount AS paid FROM refunds f JOIN returns r ON r.id=f.return_id
       JOIN payments p ON p.order_id=r.order_id WHERE r.order_id=$1 GROUP BY p.amount ORDER BY p.amount DESC LIMIT 1`,
      [refund.order_id, refund.id]
    );
    const full = Number(totals.rows[0]?.refunded || refund.amount) >= Number(totals.rows[0]?.paid || refund.amount);
    const finalStatus = full ? 'refunded' : 'partially_refunded';
    await client.query(`UPDATE refunds SET status='succeeded',provider_refund_id=$2,payment_reference=$2,processed_at=NOW(),updated_at=NOW() WHERE id=$1`, [refund.id, providerReference]);
    await client.query(`UPDATE refund_attempts SET status='succeeded',provider_reference=$2,provider_response=$3::jsonb,completed_at=NOW() WHERE refund_id=$1 AND status='started'`, [refund.id, providerReference, JSON.stringify(providerResponse || {})]);
    await client.query(`UPDATE returns SET status='refunded',updated_at=NOW() WHERE id=$1`, [refund.return_id]);
    await client.query(`UPDATE orders SET status=$2,payment_status=$2,updated_at=NOW() WHERE id=$1`, [refund.order_id, finalStatus]);
    await client.query(`UPDATE payments SET status=$2,updated_at=NOW() WHERE order_id=$1 AND status IN ('paid','partially_refunded')`, [refund.order_id, finalStatus]);
    await client.query(
      `INSERT INTO order_status_history (order_id,from_status,to_status,source,changed_by,note,metadata)
       VALUES ($1,$2,$3,'refund',$4,'Refund completed',$5::jsonb)`,
      [refund.order_id, refund.order_status, finalStatus, actorId, JSON.stringify({ refund_id: refund.id, provider_reference: providerReference })]
    );
    await writeAuditLog(client, {
      actorUserId: actorId,
      action: 'refund.complete',
      entityType: 'refund',
      entityId: refund.id,
      beforeData: { status: refund.status, return_status: refund.return_status },
      afterData: { status: 'succeeded', return_status: 'refunded', order_status: finalStatus },
      metadata: {
        return_id: refund.return_id,
        order_id: refund.order_id,
        provider: refund.provider,
        refund_method: refund.refund_method,
      },
    });
    await client.query('COMMIT');
    stockUpdates.forEach(emitStockUpdate);
    emitReturnUpdated({ id: refund.return_id, status: 'refunded' });
    emitOrderStatusUpdate(refund.order_id, finalStatus);
    return { ...refund, status: 'succeeded', provider_refund_id: providerReference, order_status: finalStatus };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
};

export const processRefundSecure = async (req, res) => {
  const returnId = Number(req.params.returnId || req.params.id);
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!Number.isInteger(returnId) || returnId <= 0 || !/^[A-Za-z0-9._:-]{8,255}$/.test(key)) {
    return res.status(400).json({ message: 'Valid return ID and Idempotency-Key header are required.' });
  }
  const client = await pool.connect();
  let refund;
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM refunds WHERE idempotency_key=$1 FOR UPDATE`, [key]);
    if (existing.rows[0]) {
      if (Number(existing.rows[0].return_id) !== returnId) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This idempotency key was used for a different return.',
          code: 'IDEMPOTENCY_KEY_CONFLICT',
        });
      }
      await client.query('COMMIT');
      return res.status(existing.rows[0].status === 'succeeded' ? 200 : 202).json(existing.rows[0]);
    }
    const returned = await client.query(
      `SELECT r.*, o.payment_method, o.status AS order_status, o.payment_status AS order_payment_status,
              p.id AS payment_row_id, p.provider, p.external_payment_id, p.status AS provider_payment_status
       FROM returns r JOIN orders o ON o.id=r.order_id LEFT JOIN payments p ON p.order_id=o.id
       WHERE r.id=$1 ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF r`,
      [returnId]
    );
    const data = returned.rows[0];
    if (!data) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Return not found.' }); }
    if (data.status !== 'approved') { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Return must be approved before refund processing.' }); }
    const method = data.refund_method || 'original';
    const provider = method === 'store_credit' ? 'store_credit' : data.provider;
    if (method === 'original' && provider === 'paymongo' && !data.external_payment_id) {
      await client.query('ROLLBACK'); return res.status(409).json({ message: 'Verified PayMongo payment reference is missing.' });
    }
    if (method === 'original' && provider === 'cod' && !String(req.body?.manual_reference || '').trim()) {
      await client.query('ROLLBACK'); return res.status(400).json({ message: 'manual_reference is required for a COD refund.' });
    }
    const created = await client.query(
      `INSERT INTO refunds (return_id,amount,method,status,provider,idempotency_key) VALUES ($1,$2,$3,'processing',$4,$5) RETURNING *`,
      [returnId, data.refund_amount, method, provider, key]
    );
    refund = { ...created.rows[0], external_payment_id: data.external_payment_id, order_id: data.order_id };
    await client.query(
      `INSERT INTO refund_attempts (refund_id,idempotency_key,provider_response)
       VALUES ($1,$2,$3::jsonb)`,
      [refund.id, key, JSON.stringify({
        recovery: {
          order_status: data.order_status,
          order_payment_status: data.order_payment_status,
          provider_payment_status: data.provider_payment_status,
        },
      })]
    );
    await client.query(`UPDATE returns SET status='refund_processing',updated_at=NOW() WHERE id=$1`, [returnId]);
    await client.query(`UPDATE orders SET status='refund_processing',payment_status='processing',updated_at=NOW() WHERE id=$1`, [data.order_id]);
    await writeAuditLog(client, {
      req,
      actorUserId: req.user.id,
      action: 'refund.prepare',
      entityType: 'refund',
      entityId: refund.id,
      beforeData: { return_status: data.status, order_status: data.order_status },
      afterData: { refund_status: 'processing', return_status: 'refund_processing' },
      metadata: { return_id: returnId, order_id: data.order_id, refund_method: method, provider },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Prepare refund failed:', error);
    return res.status(500).json({ message: 'Refund could not be prepared.' });
  } finally { client.release(); }

  try {
    let reference;
    let providerResponse = {};
    if (refund.provider === 'paymongo') {
      const result = await createPaymongoRefund({ paymentId: refund.external_payment_id, amount: Math.round(Number(refund.amount) * 100), idempotencyKey: key, notes: `Return #${returnId}` });
      reference = result.id;
      providerResponse = { id: result.id, status: result.status };
    } else if (refund.provider === 'store_credit') {
      reference = `STORE_CREDIT_${refund.id}`;
    } else {
      reference = String(req.body.manual_reference).trim();
    }
    const completed = await finalizeRefund({ refundId: refund.id, providerReference: reference, providerResponse, actorId: req.user.id });
    return res.json(completed);
  } catch (error) {
    const recovery = await compensateFailedRefund({
      refundId: refund.id,
      actorId: req.user.id,
      errorMessage: error.message,
      ipAddress: req.clientIp,
      userAgent: req.clientUa,
    }).catch((compensationError) => {
      console.error('Refund compensation failed:', compensationError);
      return null;
    });
    if (recovery?.notification) emitNotification(recovery.user_id, recovery.notification);
    if (recovery?.order_id) emitOrderStatusUpdate(recovery.order_id, recovery.order_status);
    if (recovery?.return_id) emitReturnUpdated({ id: recovery.return_id, status: 'manual_review' });
    console.error('Refund provider/finalization failed:', error);
    return res.status(502).json({
      message: recovery
        ? 'Refund failed. The original payment state was restored and this return requires manual review.'
        : 'Refund failed and automatic recovery could not be confirmed. Immediate administrator review is required.',
      status: 'manual_review',
    });
  }
};

export const compensateFailedRefund = async ({
  refundId,
  actorId,
  errorMessage,
  ipAddress = null,
  userAgent = null,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT f.id, f.status, f.return_id, r.order_id, r.user_id,
              ra.provider_response->'recovery' AS recovery
       FROM refunds f
       JOIN returns r ON r.id=f.return_id
       LEFT JOIN LATERAL (
         SELECT provider_response FROM refund_attempts
         WHERE refund_id=f.id ORDER BY id DESC LIMIT 1
       ) ra ON true
       WHERE f.id=$1 FOR UPDATE OF f,r`,
      [refundId]
    );
    const row = locked.rows[0];
    if (!row) throw new Error('Refund record not found during compensation.');
    if (row.status === 'succeeded') {
      await client.query('COMMIT');
      return null;
    }
    const recovery = row.recovery || {};
    const orderStatus = String(recovery.order_status || 'return_approved');
    const orderPaymentStatus = String(recovery.order_payment_status || 'paid');
    const providerPaymentStatus = String(recovery.provider_payment_status || 'paid');
    const safeError = String(errorMessage || 'Refund provider failure').slice(0, 2000);

    await client.query(
      `UPDATE refunds SET status='failed',updated_at=NOW()
       WHERE id=$1 AND status IN ('pending','processing','manual_review','failed')`,
      [refundId]
    );
    await client.query(
      `UPDATE refund_attempts
       SET status='failed',error_message=$2,completed_at=NOW()
       WHERE refund_id=$1 AND status='started'`,
      [refundId, safeError]
    );
    await client.query(`UPDATE returns SET status='manual_review',updated_at=NOW() WHERE id=$1`, [row.return_id]);
    await client.query(
      `UPDATE orders SET status=$2,payment_status=$3,updated_at=NOW() WHERE id=$1`,
      [row.order_id, orderStatus, orderPaymentStatus]
    );
    await client.query(
      `UPDATE payments SET status=$2,updated_at=NOW()
       WHERE order_id=$1 AND status='processing'`,
      [row.order_id, providerPaymentStatus]
    );
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id,action,entity_type,entity_id,ip_address,user_agent,before_data,after_data,metadata
       ) VALUES ($1,'refund.failed_compensated','refund',$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [actorId, String(refundId), ipAddress, userAgent,
        JSON.stringify({ refund_status: row.status, return_status: 'refund_processing' }),
        JSON.stringify({ refund_status: 'failed', return_status: 'manual_review', order_status: orderStatus, payment_status: orderPaymentStatus }),
        JSON.stringify({ error: safeError, admin_action_required: true })]
    );
    const notification = await client.query(
      `INSERT INTO notifications (
         user_id,type,title,message,reference_id,reference_type,metadata
       ) VALUES ($1,'refund_failed','Refund requires review',$2,$3,'return',$4::jsonb)
       RETURNING *`,
      [row.user_id,
        'We could not complete your refund automatically. Our team must review it; no additional refund was issued.',
        row.return_id,
        JSON.stringify({ return_id: row.return_id, order_id: row.order_id, status: 'manual_review' })]
    );
    await client.query('COMMIT');
    return {
      ...row,
      order_status: orderStatus,
      notification: notification.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};
