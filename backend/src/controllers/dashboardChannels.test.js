import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import { getOperationsDashboard } from './dashboardController.js';
after(()=>pool.end());

test('dashboard channel aggregates share recognized-sale conditions and Manila date, without classifying unknown sources',async t=>{
  let commerceSql;
  t.mock.method(pool,'query',async(sql,args)=>{
    if(sql.includes('AS total_orders')){
      commerceSql=sql;
      assert.equal(args[0],'Asia/Manila');
      // Each total/channel FILTER must include precisely the same sale predicate.
      const predicate="status::text IN ('paid','processing','packed','ready_for_pickup','shipped','out_for_delivery','delivered','partially_refunded')";
      for(const field of ['total_sales','today_sales','total_in_store_sales','today_in_store_sales','today_in_store_orders','total_online_sales','today_online_sales','today_online_orders','today_other_sales']){
        const filter=sql.slice(0,sql.indexOf(`AS ${field}`)).split('FILTER (').at(-1);
        assert.ok(filter.includes(predicate),field);assert.ok(filter.includes("payment_status::text IN ('paid','partially_refunded')"),field);
        assert.ok(filter.includes("COALESCE(integrity_status, 'valid') = 'valid'"),field);assert.ok(filter.includes('EXISTS (SELECT 1 FROM order_items'),field);
        if(field.startsWith('today'))assert.ok(filter.includes('AT TIME ZONE $1'),field);
      }
      return {rows:[{today_sales:'350',today_in_store_sales:'200',today_online_sales:'150',today_in_store_orders:'2',today_online_orders:'1',total_in_store_sales:'800',total_online_sales:'700',today_other_sales:'0'}]};
    }
    return {rows:[{}]};
  });
  const res={json(body){this.body=body;return this;},status(){return this;}};
  await getOperationsDashboard({user:{role:'store_staff'}},res);
  assert.equal(res.body.todayInStoreSales+res.body.todayOnlineSales,res.body.todaySales);
  assert.equal(res.body.todayInStoreOrders,2);assert.equal(res.body.totalOnlineSales,700);
  assert.match(commerceSql,/source='pos'/);assert.match(commerceSql,/source='online'/);assert.match(commerceSql,/source IS NULL OR source NOT IN \('pos','online'\)/);
  assert.deepEqual(res.body.recentActivity,[]);
});
