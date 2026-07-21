import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextStock } from './inventory.js';

test('inventory additions and subtraction preserve exact integer stock', () => {
  assert.equal(calculateNextStock({ currentStock: 10, reservedStock: 3, quantity: 5, adjustmentType: 'add' }), 15);
  assert.equal(calculateNextStock({ currentStock: 10, reservedStock: 3, quantity: 4, adjustmentType: 'subtract' }), 6);
});

test('inventory mutations cannot reduce stock below a reservation', () => {
  assert.throws(
    () => calculateNextStock({ currentStock: 10, reservedStock: 7, quantity: 4, adjustmentType: 'subtract' }),
    /reserved stock/
  );
  assert.throws(
    () => calculateNextStock({ currentStock: 10, reservedStock: 7, quantity: 6, adjustmentType: 'set' }),
    /reserved stock/
  );
});

test('inventory mutations reject negative, fractional, and unknown operations', () => {
  assert.throws(() => calculateNextStock({ currentStock: 1, quantity: 2, adjustmentType: 'subtract' }), /negative/);
  assert.throws(() => calculateNextStock({ currentStock: 1, quantity: 0.5, adjustmentType: 'add' }), /integer/);
  assert.throws(() => calculateNextStock({ currentStock: 1, quantity: 1, adjustmentType: 'replace' }), /adjustment_type/);
});
