import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pool from '../config/database.js';
import { createReturnSecure, markReturnReceived, processRefundSecure } from './returnWorkflowController.js';
import { approveReturn, rejectReturn } from './returnController.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
after(() => pool.end());
const response = () => ({ statusCode: 200, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } });
const req = (body = {}) => ({ params: { id: '9' }, body, user: { id: 1, role: 'owner' }, get: name => name === 'Idempotency-Key' ? 'return-test-123' : null });

function fixture(t, { status = 'approved', method = 'original', orderStatus = 'delivered', already = 0 } = {}) {
  const state = { status, calls: [], refund: null, stock: 2, returned: 0, credits: 0 };
  const row = value => ({ rows: value ? [value] : [], rowCount: value ? 1 : 0 });
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(query, args=[]) {
    const sql = query.replace(/\s+/g, ' ').trim(); state.calls.push({ sql, args });
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return row();
    if (sql.startsWith('SELECT r.id,r.order_id')) return row({ id: 9, order_id: 8, user_id: 2, status: state.status });
    if (sql.startsWith('SELECT id, order_id, status FROM returns')) return row({ id: 9, order_id: 8, user_id: 2, status: state.status });
    if (sql.startsWith('UPDATE returns SET status = $1')) { state.status=args[0]; return row({ id:9, order_id:8, user_id:2, status:state.status, items:[] }); }
    if (sql.startsWith('SELECT * FROM orders')) return row({ id: 8, status: orderStatus, updated_at: new Date(), user_id: 1 });
    if (sql.includes('FROM system_settings')) return row();
    if (sql.startsWith('SELECT oi.*')) return row({ id: 3, product_id: 5, quantity: 3, already_requested: already, product_price: 100 });
    if (sql.startsWith('INSERT INTO returns')) return row({ id: 9, status: 'pending' });
    if (sql.startsWith('SELECT * FROM refunds')) return row(state.refund);
    if (sql.startsWith('SELECT r.*, o.payment_method')) return row({ id: 9, order_id: 8, user_id: 2, status: state.status, refund_method: method, provider: 'cod', payment_method: 'cod', refund_amount: 100, order_status: 'returned', order_payment_status: 'paid', provider_payment_status: 'paid' });
    if (sql.startsWith('INSERT INTO refunds')) { state.refund = { id: 7, return_id: 9, amount: 100, provider: args[3], refund_method: method, status: 'processing' }; return row(state.refund); }
    if (sql.startsWith('SELECT f.*, r.order_id')) return row({ ...state.refund, order_id: 8, user_id: 2, return_status: state.status, refund_method: method });
    if (sql.startsWith('SELECT ri.*')) return row({ order_item_id: 3, product_id: 5, quantity: 1, purchased_quantity: 3, returned_quantity: state.returned });
    if (sql.startsWith('UPDATE products SET stock_quantity')) { state.stock++; return row({ stock_before: state.stock-1, stock_after: state.stock }); }
    if (sql.startsWith('UPDATE order_items SET returned_quantity')) state.returned++;
    if (sql.startsWith('UPDATE refunds SET status=')) state.refund.status='succeeded';
    if (sql.startsWith('INSERT INTO store_credits')) state.credits++;
    if (sql.startsWith('UPDATE returns SET status=')) { state.status = sql.match(/status='([^']+)'/)[1]; return row({ id: 9, status: state.status }); }
    if (sql.startsWith('SELECT COALESCE(SUM(f.amount)')) return row({ refunded: 100, paid: 100 });
    if (/^(UPDATE|INSERT INTO)/.test(sql)) return row({});
    throw new Error(`Unexpected mocked SQL: ${sql}`);
  } }));
  return state;
}

test('received action locks the return and order, writes history/audit/notification, and never changes stock or refunds', async t => {
  const state=fixture(t); const res=response(); await markReturnReceived(req(), res);
  assert.equal(res.statusCode,200); assert.equal(state.status,'received'); assert.equal(state.stock,2); assert.equal(state.refund,null);
  assert.ok(state.calls.some(c=>c.sql.includes('FOR UPDATE OF r,o')));
  assert.ok(state.calls.some(c=>c.sql.includes("orders SET status='returned'")));
  assert.ok(state.calls.some(c=>c.sql.includes('order_status_history')));
  assert.ok(state.calls.some(c=>c.args.includes('return.received')));
  assert.ok(state.calls.some(c=>c.sql.includes('INSERT INTO notifications')));
  const duplicate=response(); await markReturnReceived(req(),duplicate); assert.equal(duplicate.statusCode,409);
});
for (const status of ['pending','rejected','received','refunded']) test(`${status} cannot be marked received`,async t=>{
  fixture(t,{status});const res=response();await markReturnReceived(req(),res);assert.equal(res.statusCode,409);
});
for (const [status, action] of [['approved',approveReturn], ['rejected',rejectReturn]]) test(`pending can become ${status} without refund or stock change`,async t=>{
  const state=fixture(t,{status:'pending'});const res=response();await action(req(),res);
  assert.equal(res.statusCode,200);assert.equal(state.status,status);assert.equal(state.stock,2);assert.equal(state.refund,null);
});
test('approval alone cannot process a refund',async t=>{const state=fixture(t);const res=response();await processRefundSecure(req(),res);assert.equal(res.statusCode,409);assert.equal(state.refund,null);});
test('received COD refund requires a manual reference',async t=>{fixture(t,{status:'received'});const res=response();await processRefundSecure(req(),res);assert.equal(res.statusCode,400);});
for (const method of ['original','store_credit']) test(`received ${method} refund finalizes stock/quantity once and replays the same idempotency result`,async t=>{
  const state=fixture(t,{status:'received',method});const res=response();await processRefundSecure(req({manual_reference:'CASH-RECEIPT-42'}),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.status,'succeeded');assert.equal(state.status,'refunded');assert.equal(state.stock,3);assert.equal(state.returned,1);assert.equal(state.credits,method==='store_credit'?1:0);
  await processRefundSecure(req({manual_reference:'CASH-RECEIPT-42'}),response());assert.equal(state.stock,3);assert.equal(state.returned,1);
  assert.equal(state.calls.filter(c=>c.sql.startsWith('INSERT INTO stock_movements')).length,1);
});
test('non-delivered order is rejected, eligible quantities accepted and remaining quantity enforced server-side',async t=>{
  for (const [orderStatus,already,quantity,expected] of [['processing',0,1,409],['delivered',0,2,201],['delivered',2,2,409]]) {
    fixture(t,{orderStatus,already});const res=response();await createReturnSecure(req({order_id:8,reason:'Wrong fit',items:[{order_item_id:3,quantity}]}),res);assert.equal(res.statusCode,expected);
  }
});
test('received and refund routes retain distinct permissions and deny customers',async()=>{
  const routes=readFileSync(new URL('../routes/returns.js',import.meta.url),'utf8');
  assert.match(routes,/patch\('\/:id\/received'.*requirePermission\('returns.manage'\)/);
  assert.match(routes,/post\('\/:id\/refund'.*requirePermission\('refunds.process'\)/);
  const res=response();requireRole('owner','store_staff','super_admin')({user:{role:'customer'}},res,()=>assert.fail());assert.equal(res.statusCode,403);
  const noUser=response();await requirePermission('refunds.process')({},noUser,()=>assert.fail());assert.equal(noUser.statusCode,401);
});
test('staff need each explicit permission; returns management does not grant refund permission',async t=>{
  t.mock.method(pool,'query',async(_sql,args)=>({rows:[{has_permission:args[2]==='returns.manage'}]}));
  const actor={user:{id:3,role:'store_staff'}};let allowed=false;
  await requirePermission('returns.manage')(actor,response(),()=>{allowed=true;});assert.ok(allowed);
  const denied=response();await requirePermission('refunds.process')(actor,denied,()=>assert.fail());assert.equal(denied.statusCode,403);
});
