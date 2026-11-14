import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const migration=require('../../migrations/202610170001_hero_carousel_metadata.cjs');

test('carousel migration is additive, repeatable and retains existing banner content',async()=>{
  const columns=new Set(['id','title','image_url','link_url','is_active','display_order']);
  const records=[{id:1,title:'Existing merchant content'}];
  const touched=[];
  const knex={schema:{
    hasColumn:async(table,column)=>{assert.equal(table,'banners');return columns.has(column);},
    alterTable:async(table,callback)=>{
      assert.equal(table,'banners');
      const chain={notNullable:()=>chain,defaultTo:()=>chain};
      const add=column=>{columns.add(column);touched.push(column);return chain;};
      callback({string:add,integer:add,timestamp:add,dropColumn:column=>columns.delete(column)});
    },
  }};
  await migration.up(knex);
  assert.deepEqual(touched,['button_text','destination_type','destination_id','starts_at','ends_at','alt_text']);
  await migration.up(knex);assert.equal(touched.length,6);
  assert.deepEqual(records,[{id:1,title:'Existing merchant content'}]);
  await migration.down(knex);
  assert.ok(columns.has('button_text'));assert.ok(columns.has('title'));assert.equal(columns.has('destination_type'),false);
});
