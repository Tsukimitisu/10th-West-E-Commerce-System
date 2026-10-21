import crypto from 'node:crypto';
import pool from '../config/database.js';
import { writeAuditLog } from '../utils/audit.js';
import { createOfflineSnapshot, lockOfflineDevice, offlineError, setOfflineReserve } from '../services/offlinePos.js';

const run = fn => async (req,res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockOfflineDevice(client);
    const result = await fn(client,req);
    await client.query('COMMIT');
    return res.json(result);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code==='23505' && error.constraint==='pos_one_active_offline_device') {
      return res.status(503).json({code:'OFFLINE_POS_SCHEMA_NOT_READY',message:'Multi-device Offline POS database setup is not ready. Apply 202610210001_multi_device_offline_pos.cjs before registering another computer.'});
    }
    if (['42P01','42703'].includes(error.code)) {
      return res.status(503).json({ code:'OFFLINE_POS_SCHEMA_NOT_READY', message:'Offline POS database setup is not ready. Apply the offline POS migration before enabling this computer.' });
    }
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ message:error.status ? error.message : 'Offline POS preparation could not be completed.', code:error.status ? error.code : 'OFFLINE_POS_PREPARATION_FAILED' });
  } finally { client.release(); }
};
const audit = (client,req,action,id,metadata) => writeAuditLog(client,{ req,actorUserId:req.user.id,action,entityType:'pos_offline_device',entityId:id,metadata });
const managementRole = req => ['owner','super_admin','admin'].includes(req.user?.role);
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const deviceName = (value,id) => {
  if (value == null || !String(value).trim()) return `10th West POS ${id.slice(0,8)}`;
  if (typeof value !== 'string' || value.trim().length>80 || /[<>\x00-\x1f\x7f]/.test(value)) throw offlineError('Use a computer name of 1 to 80 characters without markup.','OFFLINE_POS_DEVICE_INVALID',400);
  return value.trim();
};
export const getOfflineDevice = run(async (client,req) => {
  const id=req.params?.deviceUuid || req.query?.device_uuid;
  if (!id) return {device:null}; // Old clients must never select an arbitrary laptop.
  if (!validUuid(id)) throw offlineError('A valid computer identifier is required.','OFFLINE_POS_DEVICE_INVALID',400);
  return {device:(await client.query('SELECT id,device_uuid,name,is_active,registered_at,last_synced_at,revoked_at FROM pos_offline_devices WHERE device_uuid=$1',[id])).rows[0] || null};
});
export const getOfflineDevices = run(async client => ({devices:(await client.query('SELECT id,device_uuid,name,is_active,registered_at,last_synced_at,revoked_at FROM pos_offline_devices ORDER BY registered_at,id')).rows}));
export const getOfflineReserves = run(async(client,req)=>{
  const id=Number(req.query.product_id);
  if(!Number.isInteger(id)||id<1)throw offlineError('Select a valid inventory item.','OFFLINE_POS_RESERVE_INVALID',400);
  const reserves=(await client.query(`SELECT r.id,r.device_id,d.name AS device_name,r.product_id,r.variant_id,r.target_quantity,r.remaining,r.quarantined
    FROM pos_offline_reserves r LEFT JOIN pos_offline_devices d ON d.id=r.device_id WHERE r.product_id=$1`,[id])).rows;
  const inventory=(await client.query(`SELECT id AS product_id,NULL::int AS variant_id,stock_quantity,reserved_stock FROM products WHERE id=$1
    UNION ALL SELECT product_id,id AS variant_id,stock_quantity,reserved_stock FROM product_variants WHERE product_id=$1`,[id])).rows;
  return {reserves,stock:inventory.map(row=>{
    const protectedQuantity=reserves.filter(r=>Number(r.variant_id || 0)===Number(row.variant_id || 0)).reduce((sum,r)=>sum+Number(r.remaining),0);
    return {...row,offline_protected:protectedQuantity,other_reserved:Math.max(0,Number(row.reserved_stock)-protectedQuantity),online_available:Math.max(0,Number(row.stock_quantity)-Number(row.reserved_stock))};
  })};
});
export const registerOfflineDevice = run(async (client,req) => {
  const issued = Number(req.session?.auth?.authenticatedAt);
  if (!issued || Date.now()-issued > 15*60000 || issued > Date.now()) throw offlineError('Sign in again before enabling offline access on this computer.', 'OFFLINE_POS_REAUTH_REQUIRED', 401);
  const id = String(req.body?.device_uuid || '');
  if (!validUuid(id)) throw offlineError('A valid computer identifier is required.', 'OFFLINE_POS_DEVICE_INVALID',400);
  const current = (await client.query('SELECT * FROM pos_offline_devices WHERE device_uuid=$1 FOR UPDATE',[id])).rows[0];
  if (current?.is_active) return { device:current };
  if (!managementRole(req)) throw offlineError('Ask an owner or system administrator to approve this computer before preparing Offline POS.','OFFLINE_POS_DEVICE_APPROVAL_REQUIRED',403);
  if(current){
    const device=(await client.query('UPDATE pos_offline_devices SET is_active=true,revoked_at=NULL,registered_by=$2,registered_at=now() WHERE id=$1 RETURNING *',[current.id,req.user.id])).rows[0];
    await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',current.id,{device_id:current.id,device_name:current.name,reauthorized:true});
    return {device};
  }
  const name=deviceName(req.body?.name,id);
  const device=(await client.query('INSERT INTO pos_offline_devices(id,device_uuid,name,registered_by) VALUES($1,$2,$3,$4) RETURNING *',[crypto.randomUUID(),id,name,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',device.id,{device_id:device.id,device_name:name});
  return { device };
});
export const renameOfflineDevice = run(async (client,req) => {
  if(!validUuid(req.params?.id))throw offlineError('Select a valid computer.','OFFLINE_POS_DEVICE_INVALID',400);
  const name=deviceName(req.body?.name,req.params.id);
  const device=(await client.query('UPDATE pos_offline_devices SET name=$2 WHERE id=$1 RETURNING id,device_uuid,name,is_active,last_synced_at',[req.params.id,name])).rows[0];
  if(!device)throw offlineError('Computer not found.','OFFLINE_POS_DEVICE_INVALID',404);
  await audit(client,req,'OFFLINE_POS_DEVICE_RENAMED',device.id,{device_id:device.id,device_name:name});
  return {device};
});
export const revokeOfflineDevice = run(async (client,req) => {
  const id=req.params?.id || req.body?.device_id;
  if(!validUuid(id))throw offlineError('Select the specific computer to revoke.','OFFLINE_POS_DEVICE_INVALID',400);
  const device = (await client.query('UPDATE pos_offline_devices SET is_active=false,revoked_at=now() WHERE id=$1 AND is_active=true RETURNING id,name',[id])).rows[0];
  if (device) {
    await client.query('UPDATE pos_offline_reserves SET quarantined=true WHERE device_id=$1 AND remaining>0',[id]);
    await audit(client,req,'OFFLINE_POS_DEVICE_REVOKED',id,{device_id:id,device_name:device.name,warning:'Disconnected physical sales require review.'});
  }
  return { revoked:true,device_id:id };
});
export const saveOfflineReserve = run(async (client,req) => {
  await setOfflineReserve(client,{deviceId:req.body?.device_id ?? null,productId:Number(req.body?.product_id),variantId:req.body?.variant_id == null ? null : Number(req.body.variant_id),quantity:Number(req.body?.quantity),reviewed:req.body?.reviewed === true});
  await audit(client,req,'OFFLINE_POS_RESERVE_UPDATED',req.body.device_id || 'unassigned',{device_id:req.body.device_id || null,product_id:req.body.product_id,variant_id:req.body.variant_id || null,quantity:Number(req.body.quantity)});
  return { saved:true };
});
export const syncOfflineCatalogue = run(async (client,req) => createOfflineSnapshot(client,req.body?.device_id,req.user.id));
