import crypto from 'crypto';
import pool from '../config/database.js';
import { emitNewOrder, emitStockUpdate } from '../socket.js';

const round = (value) => Math.round(Number(value) * 100) / 100;

export const createPosOrder = async (req, res) => {
  const key = String(req.get('Idempotency-Key') || '').trim();
  const input = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(key) || !input.length || input.length > 100) {
    return res.status(400).json({ message: 'Items and a valid Idempotency-Key header are required.' });
  }
  if (Number(req.body?.discount_amount || 0) !== 0) return res.status(400).json({ message: 'Client-calculated POS discounts are not allowed. Use a promotion code.' });
  const items = input.map((item) => ({ product_id: Number(item.product_id ?? item.productId), variant_id: item.variant_id ? Number(item.variant_id) : null, quantity: Number(item.quantity) }));
  if (items.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100)) {
    return res.status(400).json({ message: 'POS item data is invalid.' });
  }
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
  const client = await pool.connect();
  const stockUpdates = [];
  try {
    await client.query('BEGIN');
    const previous = await client.query(`SELECT * FROM idempotency_keys WHERE user_id=$1 AND scope='pos' AND key=$2 FOR UPDATE`, [req.user.id, key]);
    if (previous.rows[0]) {
      if (previous.rows[0].request_hash !== requestHash) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Idempotency key payload mismatch.' }); }
      if (previous.rows[0].status === 'completed') { await client.query('COMMIT'); return res.status(previous.rows[0].response_status).json(previous.rows[0].response_body); }
      await client.query('ROLLBACK'); return res.status(409).json({ message: 'POS order is already processing.' });
    }
    await client.query(`INSERT INTO idempotency_keys (user_id,scope,key,request_hash,expires_at) VALUES ($1,'pos',$2,$3,NOW()+INTERVAL '24 hours')`, [req.user.id, key, requestHash]);
    let subtotal = 0;
    const snapshots = [];
    for (const item of items) {
      const result = await client.query(`SELECT * FROM products WHERE id=$1 AND status='active' AND COALESCE(is_deleted,false)=false FOR UPDATE`, [item.product_id]);
      const product = result.rows[0];
      if (!product) throw Object.assign(new Error(`Product #${item.product_id} is unavailable.`), { status: 400 });
      let variant = null;
      let price = Number(product.is_on_sale && product.sale_price ? product.sale_price : product.price);
      let stock;
      if (item.variant_id) {
        const vr = await client.query(`SELECT * FROM product_variants WHERE id=$1 AND product_id=$2 FOR UPDATE`, [item.variant_id, item.product_id]);
        variant = vr.rows[0];
        if (!variant) throw Object.assign(new Error('Invalid product variant.'), { status: 400 });
        price = variant.price !== null ? Number(variant.price) : price + Number(variant.price_adjustment || 0);
        stock = await client.query(`UPDATE product_variants SET stock_quantity=stock_quantity-$1,updated_at=NOW() WHERE id=$2 AND stock_quantity-reserved_stock >= $1 RETURNING stock_quantity+$1 AS before,stock_quantity AS after`, [item.quantity, variant.id]);
      } else {
        stock = await client.query(`UPDATE products SET stock_quantity=stock_quantity-$1,updated_at=NOW() WHERE id=$2 AND stock_quantity-reserved_stock >= $1 RETURNING stock_quantity+$1 AS before,stock_quantity AS after`, [item.quantity, product.id]);
      }
      if (!stock.rowCount) throw Object.assign(new Error(`Insufficient stock for ${product.name}.`), { status: 409 });
      subtotal = round(subtotal + price * item.quantity);
      snapshots.push({ ...item, name: product.name, price, sku: variant?.sku || product.sku, variant_name: variant ? `${variant.variant_type}: ${variant.variant_value}` : null, image: variant?.image_url || product.image, before: stock.rows[0].before, after: stock.rows[0].after });
    }
    const tendered = Number(req.body?.amount_tendered);
    if (!Number.isFinite(tendered) || tendered < subtotal) throw Object.assign(new Error('Amount tendered is below the server-calculated total.'), { status: 400 });
    const order = await client.query(
      `INSERT INTO orders (user_id,total_amount,subtotal_amount,shipping_fee,discount_amount,tax_amount,currency,status,shipping_address,source,payment_method,payment_provider,payment_status,amount_tendered,change_due,cashier_id,shipping_method,checkout_idempotency_key,paid_at)
       VALUES (NULL,$1,$1,0,0,0,'PHP','paid','In-Store Pickup','pos','cash','cash','paid',$2,$3,$4,'pickup',$5,NOW()) RETURNING *`,
      [subtotal, round(tendered), round(tendered - subtotal), req.user.id, key]
    );
    for (const item of snapshots) {
      await client.query(`INSERT INTO order_items (order_id,product_id,variant_id,product_name,product_price,quantity,sku_snapshot,variant_name_snapshot,image_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [order.rows[0].id,item.product_id,item.variant_id,item.name,item.price,item.quantity,item.sku,item.variant_name,item.image]);
      await client.query(`INSERT INTO stock_movements (product_id,variant_id,order_id,quantity_delta,stock_before,stock_after,reason,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,'sale','pos',$3,$7)`, [item.product_id,item.variant_id,order.rows[0].id,-item.quantity,item.before,item.after,req.user.id]);
      stockUpdates.push({ product_id:item.product_id,variant_id:item.variant_id,stock_quantity:Number(item.after) });
    }
    await client.query(`INSERT INTO payments (order_id,user_id,provider,method,status,amount,currency,paid_at) VALUES ($1,$2,'cash','cash','paid',$3,'PHP',NOW())`, [order.rows[0].id,req.user.id,subtotal]);
    await client.query(`INSERT INTO order_status_history (order_id,to_status,source,changed_by,note) VALUES ($1,'paid','pos',$2,'In-store sale completed')`, [order.rows[0].id,req.user.id]);
    const response = { order_id:order.rows[0].id,id:order.rows[0].id,status:'paid',total_amount:subtotal,change_due:round(tendered-subtotal) };
    await client.query(`UPDATE idempotency_keys SET status='completed',response_status=201,response_body=$4::jsonb,updated_at=NOW() WHERE user_id=$1 AND scope='pos' AND key=$2 AND request_hash=$3`, [req.user.id,key,requestHash,JSON.stringify(response)]);
    await client.query('COMMIT');
    stockUpdates.forEach(emitStockUpdate);
    emitNewOrder(order.rows[0]);
    return res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('POS order failed:',error);
    return res.status(error.status||500).json({ message:error.status?error.message:'POS order could not be completed.' });
  } finally { client.release(); }
};
