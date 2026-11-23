import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { securityPolicy } from '../services/securityPolicy.js';
import { getSessionState, recordSessionActivity, refreshSession } from './sessionController.js';

after(() => pool.end());
const response = () => ({ statusCode:200, status(value){this.statusCode=value;return this;},set(key,value){this[key]=value;return this;},json(body){this.body=body;return this;} });
test('session timing is server-authoritative; polling is not activity; explicit refresh preserves auth/MFA and cannot revive expired sessions', async t => {
  const db = new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE sessions(id int,user_id int,token_hash text,is_active boolean,created_at timestamptz,last_active timestamptz,explicitly_refreshed_at timestamptz,expires_at timestamptz);
    INSERT INTO sessions VALUES(1,7,'synthetic-hash',true,NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '2 minutes',NULL,NOW()+INTERVAL '20 minutes');`);
  const calls=[];t.mock.method(pool,'query',async(sql,args)=>{calls.push(sql);const result=await db.query(sql,args);return {...result,rowCount:result.rows.length};});
  t.mock.method(securityPolicy,'get',async()=>({session_timeout_minutes:30}));
  const req={user:{id:7},session:{auth:{userId:7,tokenHash:'synthetic-hash',authenticatedAt:123,twoFactorVerified:true},cookie:{},save(done){done();}}};
  const initial=(await db.query('SELECT * FROM sessions')).rows[0];
  for(let i=0;i<2;i++){const res=response();await getSessionState(req,res);assert.equal(res.statusCode,200);assert.equal(res['Cache-Control'],'no-store');assert.ok(Date.parse(res.body.expires_at)>Date.now());assert.doesNotMatch(JSON.stringify(res.body),/synthetic-hash|token|user_id|twoFactor/);}
  assert.deepEqual((await db.query('SELECT * FROM sessions')).rows[0],initial);
  assert.ok(!calls.some(sql=>sql.startsWith('UPDATE')));
  const activity=response();await recordSessionActivity(req,activity);assert.equal(activity.statusCode,200);
  assert.ok(new Date((await db.query('SELECT last_active FROM sessions')).rows[0].last_active)>new Date(initial.last_active));
  const refreshed=response();await refreshSession(req,refreshed);assert.equal(refreshed.statusCode,200);
  assert.ok(Date.parse(refreshed.body.expires_at)>new Date(initial.expires_at).getTime());
  assert.deepEqual(req.session.auth,{userId:7,tokenHash:'synthetic-hash',authenticatedAt:123,twoFactorVerified:true});
  assert.ok(req.session.cookie.maxAge>29*60000 && req.session.cookie.maxAge<=30*60000);
  await db.exec("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second'");
  const expired=response();await refreshSession(req,expired);assert.equal(expired.statusCode,401);
  await db.exec("UPDATE sessions SET expires_at=NOW()+INTERVAL '30 minutes',last_active=NOW()-INTERVAL '31 minutes'");
  const idle=response();await refreshSession(req,idle);assert.equal(idle.statusCode,401);
  await db.exec('UPDATE sessions SET is_active=false,last_active=NOW()');
  const revoked=response();await refreshSession(req,revoked);assert.equal(revoked.statusCode,401);
  const bearerOnly=response();await refreshSession({user:{id:7}},bearerOnly);assert.equal(bearerOnly.statusCode,401);
});

test('explicit renewal keeps the original maximum session TTL and saved policy cap', async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const oldTtl=process.env.SESSION_TTL;process.env.SESSION_TTL='1h';t.after(()=>{if(oldTtl===undefined)delete process.env.SESSION_TTL;else process.env.SESSION_TTL=oldTtl;});
  await db.exec(`CREATE TABLE sessions(user_id int,token_hash text,is_active boolean,created_at timestamptz,last_active timestamptz,explicitly_refreshed_at timestamptz,expires_at timestamptz);
    INSERT INTO sessions VALUES(7,'hash',true,NOW()-INTERVAL '50 minutes',NOW(),NOW()-INTERVAL '1 minute',NOW()+INTERVAL '10 minutes');`);
  t.mock.method(pool,'query',(sql,args)=>db.query(sql,args));
  t.mock.method(securityPolicy,'get',async()=>({session_timeout_minutes:30}));
  const req={user:{id:7},session:{auth:{userId:7,tokenHash:'hash'},cookie:{},save(done){done();}}};
  const res=response();await refreshSession(req,res);assert.equal(res.statusCode,200);
  assert.ok(Date.parse(res.body.expires_at)-Date.parse(res.body.server_now)<=10*60000);
  t.mock.method(securityPolicy,'get',async()=>({session_timeout_minutes:5}));
  const capped=response();await refreshSession(req,capped);assert.equal(capped.statusCode,200);
  assert.ok(Date.parse(capped.body.expires_at)-Date.parse(capped.body.server_now)<=5*60000);
});
