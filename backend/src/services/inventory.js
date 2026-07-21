const integer = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    const error = new Error(`${field} must be an integer.`);
    error.status = 400;
    throw error;
  }
  return parsed;
};

export const calculateNextStock = ({ currentStock, reservedStock = 0, quantity, adjustmentType }) => {
  const current = integer(currentStock, 'current stock');
  const reserved = integer(reservedStock, 'reserved stock');
  const amount = integer(quantity, 'quantity');
  const mode = String(adjustmentType || '').trim();
  if (!['set', 'add', 'subtract'].includes(mode)) {
    const error = new Error('adjustment_type must be set, add, or subtract.');
    error.status = 400;
    throw error;
  }
  const next = mode === 'set' ? amount : mode === 'add' ? current + amount : current - amount;
  if (amount < 0 || next < 0) {
    const error = new Error('Stock cannot be negative.');
    error.status = 409;
    throw error;
  }
  if (next < reserved) {
    const error = new Error('Stock cannot be reduced below reserved stock.');
    error.status = 409;
    throw error;
  }
  return next;
};

export const mutateInventory = async (client, {
  productId,
  variantId = null,
  quantity,
  adjustmentType,
  reason,
  referenceType,
  actorId,
  ipAddress,
  userAgent,
  metadata = {},
  recordAdjustment = false,
}) => {
  const productResult = await client.query(
    `SELECT id, name, stock_quantity, reserved_stock, low_stock_threshold
     FROM products WHERE id = $1 FOR UPDATE`,
    [productId]
  );
  const product = productResult.rows[0];
  if (!product) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }

  let target = product;
  if (variantId !== null && variantId !== undefined) {
    const variantResult = await client.query(
      `SELECT id, product_id, sku, stock_quantity, reserved_stock
       FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE`,
      [variantId, productId]
    );
    target = variantResult.rows[0];
    if (!target) {
      const error = new Error('Product variant not found.');
      error.status = 404;
      throw error;
    }
  }

  const before = Number(target.stock_quantity);
  const after = calculateNextStock({
    currentStock: before,
    reservedStock: Number(target.reserved_stock || 0),
    quantity,
    adjustmentType,
  });
  const delta = after - before;
  const entityType = target === product ? 'product' : 'product_variant';
  const entityId = target.id;

  if (target === product) {
    await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [after, entityId]
    );
  } else {
    await client.query(
      'UPDATE product_variants SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [after, entityId]
    );
  }

  let adjustmentId = null;
  if (recordAdjustment) {
    const adjustment = await client.query(
      `INSERT INTO stock_adjustments (product_id, quantity_change, reason, notes, adjusted_by, status)
       VALUES ($1,$2,$3,$4,$5,'approved') RETURNING id`,
      [productId, delta, reason, String(metadata.notes || ''), actorId]
    );
    adjustmentId = adjustment.rows[0].id;
  }

  const movement = await client.query(
    `INSERT INTO stock_movements (
       product_id, variant_id, quantity_delta, stock_before, stock_after,
       reason, reference_type, reference_id, created_by, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
    [productId, target === product ? null : entityId, delta, before, after, reason,
      referenceType, adjustmentId, actorId, JSON.stringify(metadata)]
  );
  await client.query(
    `INSERT INTO audit_logs (
       actor_user_id, action, entity_type, entity_id, ip_address, user_agent,
       before_data, after_data, metadata
     ) VALUES ($1,'inventory.adjust',$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
    [actorId, entityType, String(entityId), ipAddress, userAgent,
      JSON.stringify({ stock_quantity: before, reserved_stock: Number(target.reserved_stock || 0) }),
      JSON.stringify({ stock_quantity: after, reserved_stock: Number(target.reserved_stock || 0) }),
      JSON.stringify({ ...metadata, product_id: Number(productId), variant_id: target === product ? null : Number(entityId), reason, reference_type: referenceType })]
  );

  return {
    product_id: Number(productId),
    variant_id: target === product ? null : Number(entityId),
    name: product.name,
    previous_stock: before,
    new_stock: after,
    quantity_delta: delta,
    low_stock_threshold: Number(product.low_stock_threshold || 5),
    movement: movement.rows[0],
  };
};
