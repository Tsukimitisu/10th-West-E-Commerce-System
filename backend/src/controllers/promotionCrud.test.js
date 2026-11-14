import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { createPromotion, updatePromotion, listPromotions } from './discountController.js';

after(() => pool.end());
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const base = { code: 'OWNER20', type: 'percentage', value: 20, min_purchase: 0, max_uses: null, starts_at: null, expires_at: null, is_active: true };

test('Owner form creates percentage/fixed promotions with blank optional fields and immediately lists them', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE discounts(id serial PRIMARY KEY,code varchar(100) NOT NULL UNIQUE,type varchar(20),value numeric(10,2) NOT NULL,
    min_purchase numeric(10,2) NOT NULL DEFAULT 0,max_discount numeric(12,2),max_uses int,used_count int NOT NULL DEFAULT 0,
    per_user_limit int NOT NULL DEFAULT 1,is_active boolean NOT NULL DEFAULT true,starts_at timestamp,expires_at timestamp,
    created_at timestamp DEFAULT now(),updated_at timestamp,deleted_at timestamp,
    CONSTRAINT discounts_limits_check CHECK(min_purchase>=0 AND (max_discount IS NULL OR max_discount>=0) AND per_user_limit>0));`);
  const query=async (sql,args) => { const result = await db.query(sql,args); return { ...result,rowCount:result.rows.length }; };
  t.mock.method(pool, 'query', query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  const created = response(); await createPromotion({ body:base },created);
  assert.equal(created.statusCode,201,JSON.stringify(created.body));
  assert.equal(created.body.max_discount,null); assert.equal(created.body.max_uses,null); assert.equal(created.body.per_user_limit,1);
  const fixed = response(); await createPromotion({ body:{...base,code:'FIXED50',type:'fixed',value:50,min_purchase:'',max_discount:'',max_uses:''} },fixed);
  assert.equal(fixed.statusCode,201,JSON.stringify(fixed.body)); assert.equal(Number(fixed.body.min_purchase),0);
  const listed = response(); await listPromotions({query:{}},listed); assert.equal(listed.body.pagination.total,2);
  assert.equal(listed.body.data.filter(row=>row.is_active).length,2);
  const duplicate=response(); await createPromotion({body:base},duplicate);assert.equal(duplicate.statusCode,409);
  assert.equal(duplicate.body.message,'This promotion code already exists.');
  const duplicateEdit=response();await updatePromotion({params:{id:fixed.body.id},body:{code:'owner20'}},duplicateEdit);
  assert.equal(duplicateEdit.statusCode,409);assert.equal(duplicateEdit.body.message,'This promotion code already exists.');
  const edited=response(); await updatePromotion({params:{id:created.body.id},body:{value:25,is_active:false}},edited);
  assert.equal(edited.statusCode,200);assert.equal(Number(edited.body.value),25);assert.equal(edited.body.is_active,false);
  const invalidEdit=response();await updatePromotion({params:{id:created.body.id},body:{value:101}},invalidEdit);
  assert.equal(invalidEdit.statusCode,400);assert.match(invalidEdit.body.message,/Value.*100/);
  const invalidDates=response();await updatePromotion({params:{id:created.body.id},body:{starts_at:'2026-12-02',expires_at:'2026-12-01'}},invalidDates);
  assert.equal(invalidDates.statusCode,400);assert.match(invalidDates.body.message,/End date/);
  const scheduled=response();await updatePromotion({params:{id:created.body.id},body:{starts_at:'2026-12-02',expires_at:'2026-12-10'}},scheduled);assert.equal(scheduled.statusCode,200);
  const partialDate=response();await updatePromotion({params:{id:created.body.id},body:{expires_at:'2026-12-01'}},partialDate);assert.equal(partialDate.statusCode,400);
  const minimal=response();await createPromotion({body:{code:'MINIMAL',type:'fixed',value:10,max_uses:0}},minimal);
  assert.equal(minimal.statusCode,201);assert.equal(minimal.body.max_uses,null);assert.equal(minimal.body.max_discount,null);assert.equal(minimal.body.per_user_limit,1);
  const afterEdit=response();await listPromotions({query:{}},afterEdit);assert.equal(afterEdit.body.data.filter(row=>row.is_active).length,2);
});

test('promotion validation rejects unsafe values, dates and limits before any SQL write',async t=>{
  t.mock.method(pool,'query',()=>assert.fail('Invalid promotion must not reach SQL'));
  for(const [patch,message] of [
    [{value:101},/Value.*100/],[{value:0},/Value/],[{value:''},/Value/],[{value:'bad'},/Value/],
    [{value:{toString:null}},/Value/],[{code:{toString:null}},/Code/],
    [{min_purchase:-1},/Minimum purchase/],[{min_purchase:1e40},/Minimum purchase/],[{value:1e40},/Value/],
    [{max_uses:-1},/Maximum uses/],[{max_uses:1.5},/Maximum uses/],
    [{per_user_limit:0},/Per-user limit/],[{is_active:'false'},/Active status/],
    [{starts_at:'invalid'},/Start date/],[{expires_at:'2026-02-30'},/End date/],
    [{starts_at:'2026-12-02',expires_at:'2026-12-01'},/End date/],
  ]) {
    const res=response();await createPromotion({body:{...base,...patch}},res);
    assert.equal(res.statusCode,400,JSON.stringify(patch));assert.match(res.body.message,message);
  }
});
