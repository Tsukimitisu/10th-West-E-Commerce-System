import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from '../config/database.js';
import { STOCK_ADJUSTMENT_REASONS, validateStockAdjustmentReason } from './inventoryController.js';

after(async () => {
  await pool.end().catch(() => {});
});

test('ADD stock accepts only its configured reasons', () => {
  for (const reason of STOCK_ADJUSTMENT_REASONS.add) {
    assert.equal(validateStockAdjustmentReason(1, reason).valid, true, reason);
  }
  assert.equal(validateStockAdjustmentReason(1, 'damaged').valid, false);
  assert.equal(validateStockAdjustmentReason(1, 'expired').valid, false);
});

test('REMOVE stock accepts only its configured reasons', () => {
  for (const reason of STOCK_ADJUSTMENT_REASONS.remove) {
    assert.equal(validateStockAdjustmentReason(-1, reason).valid, true, reason);
  }
  assert.equal(validateStockAdjustmentReason(-1, 'restocking').valid, false);
  assert.equal(validateStockAdjustmentReason(-1, 'returned').valid, false);
});

test('stock adjustment reasons reject zero changes and legacy ambiguous correction', () => {
  assert.equal(validateStockAdjustmentReason(0, 'correction_add').valid, false);
  assert.equal(validateStockAdjustmentReason(1, 'correction').valid, false);
  assert.equal(validateStockAdjustmentReason(-1, 'correction').valid, false);
});
