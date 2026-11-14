import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.NODE_ENV='test';
process.env.TEST_DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE='postgres';
const {default:pool}=await import('../config/database.js');
const {default:router}=await import('./announcements.js');

test('public hero announcements never expose future, draft or invalid publication records',async()=>{
  const original=pool.query,originalFetch=globalThis.fetch;
  const originalEnv={DB_READ_MODE:process.env.DB_READ_MODE,SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
  const base={id:1,title:'Open today',content:'Shop support is available.',is_published:true,published_at:'2020-01-01T00:00:00Z',private_owner_note:'private'};
  const rows=[base,{...base,id:2,title:'Future campaign',published_at:'2099-01-01T00:00:00Z'},{...base,id:3,is_published:false},{...base,id:4,published_at:'invalid'}];
  pool.query=async sql=>({rows:sql.includes('system_settings') ? [{value:'true'}] : rows});
  const app=express();app.use('/announcements',router);const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    process.env.SUPABASE_URL='https://fixture-rest.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-key';
    globalThis.fetch=async(url,options)=>String(url).startsWith('https://fixture-rest.invalid/') ? Response.json(String(url).includes('system_settings') ? [{value:'true'}] : rows) : originalFetch(url,options);
    for(const mode of ['postgres','supabase_rest']){
      process.env.DB_READ_MODE=mode;
      const result=await (await originalFetch(`http://127.0.0.1:${server.address().port}/announcements`)).json();
      assert.deepEqual(result.map(row=>row.id),[1],mode);
      assert.equal(result[0].private_owner_note,undefined,mode);
    }
  }finally{
    pool.query=original;globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(originalEnv)){if(value===undefined) delete process.env[key];else process.env[key]=value;}
    await new Promise(resolve=>server.close(resolve));await pool.end();
  }
});
