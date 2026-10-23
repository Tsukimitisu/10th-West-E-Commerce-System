import crypto from 'node:crypto';
import pool from '../config/database.js';
import { writeAuditLog } from '../utils/audit.js';
import { createOfflineSnapshot, lockOfflineDevice, offlineError, setOfflineReserve, setOfflineStockMode } from '../services/offlinePos.js';

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
    if(error.code==='23505' && error.constraint==='pos_one_active_automatic_device')return res.status(409).json({code:'OFFLINE_POS_AUTOMATIC_DEVICE_CONFLICT',message:'Another computer is already the primary automatic device. Switch it to Manual first. Existing protected stock remains reserved.'});
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
  return {device:(await client.query('SELECT id,device_uuid,name,is_active,stock_mode,registered_at,last_synced_at,revoked_at FROM pos_offline_devices WHERE device_uuid=$1',[id])).rows[0] || null};
});
export const getOfflineDevices = run(async client => ({devices:(await client.query('SELECT d.id,d.device_uuid,d.name,d.is_active,d.stock_mode,d.registered_at,d.last_synced_at,d.revoked_at,u.name AS registered_by_name FROM pos_offline_devices d LEFT JOIN users u ON u.id=d.registered_by ORDER BY d.registered_at,d.id')).rows}));
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
const requireFreshAuth = req => {
  const issued = Number(req.session?.auth?.authenticatedAt);
  if (!issued || Date.now()-issued > 15*60000 || issued > Date.now()) throw offlineError('Sign in again before enabling offline access on this computer.', 'OFFLINE_POS_REAUTH_REQUIRED', 401);
};
// Both direct management registration and approval use the same device writer.
// It never allocates stock or touches other computers.
const activateDevice = async (client,req,id,name,current) => {
  if(current?.is_active)return current;
  if(current){
    const device=(await client.query('UPDATE pos_offline_devices SET is_active=true,revoked_at=NULL,registered_by=$2,registered_at=now() WHERE id=$1 RETURNING *',[current.id,req.user.id])).rows[0];
    await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',current.id,{device_id:current.id,device_name:current.name,reauthorized:true});
    return device;
  }
  const device=(await client.query(`INSERT INTO pos_offline_devices(id,device_uuid,name,registered_by,stock_mode)
    SELECT $1,$2,$3,$4,CASE WHEN EXISTS(SELECT 1 FROM pos_offline_devices WHERE is_active) THEN 'manual' ELSE 'automatic' END RETURNING *`,[crypto.randomUUID(),id,name,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',device.id,{device_id:device.id,device_name:name});
  return device;
};
export const registerOfflineDevice = run(async (client,req) => {
  requireFreshAuth(req);
  const id = String(req.body?.device_uuid || '');
  if (!validUuid(id)) throw offlineError('A valid computer identifier is required.', 'OFFLINE_POS_DEVICE_INVALID',400);
  const current = (await client.query('SELECT * FROM pos_offline_devices WHERE device_uuid=$1 FOR UPDATE',[id])).rows[0];
  if (current?.is_active) return { device:current };
  if (!managementRole(req)) throw offlineError('Ask an owner or system administrator to approve this computer before preparing Offline POS.','OFFLINE_POS_DEVICE_APPROVAL_REQUIRED',403);
  return {device:await activateDevice(client,req,id,deviceName(req.body?.name,id),current)};
});

const requireManagement = req => {
  if(!managementRole(req))throw offlineError('Management approval is required.','OFFLINE_POS_DEVICE_APPROVAL_REQUIRED',403);
};
const expireRequests = client => client.query("UPDATE pos_offline_device_requests SET status='expired',updated_at=now() WHERE status='pending' AND requested_at <= now()-interval '7 days'");
const safeDevice = d => d ? {id:d.id,device_uuid:d.device_uuid,name:d.name,is_active:d.is_active,stock_mode:d.stock_mode,registered_at:d.registered_at,last_synced_at:d.last_synced_at} : null;
const safeRequest = r => r ? {id:r.id,requested_name:r.requested_name,status:r.status,requested_at:r.requested_at,reviewed_at:r.reviewed_at,rejection_reason:r.rejection_reason,approved_device_id:r.approved_device_id} : null;
const browserId = req => {
  const id=req.body?.device_uuid || req.query?.device_uuid;
  if(!validUuid(id))throw offlineError('A valid computer identifier is required.','OFFLINE_POS_DEVICE_INVALID',400);
  return id;
};
export const requestOfflineDevice = run(async(client,req)=>{
  const id=browserId(req),name=deviceName(req.body?.name,id);
  await expireRequests(client);
  const device=(await client.query('SELECT * FROM pos_offline_devices WHERE device_uuid=$1',[id])).rows[0];
  if(device?.is_active)return {status:'approved',device:safeDevice(device)};
  const pending=(await client.query("SELECT * FROM pos_offline_device_requests WHERE device_uuid=$1 AND status='pending'",[id])).rows[0];
  if(pending){
    if(pending.requested_by!==req.user.id)throw offlineError('A request for this computer is already pending. Contact an owner.','OFFLINE_POS_REQUEST_PENDING',409);
    return {status:'pending',request:safeRequest(pending)};
  }
  const row=(await client.query('INSERT INTO pos_offline_device_requests(id,device_uuid,requested_name,requested_by) VALUES($1,$2,$3,$4) RETURNING *',[crypto.randomUUID(),id,name,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_APPROVAL_REQUESTED',row.id,{request_id:row.id,device_name:name,requested_by:req.user.id});
  return {status:'pending',request:safeRequest(row)};
});
export const getCurrentOfflineDeviceRequest = run(async(client,req)=>{
  const id=browserId(req);
  await expireRequests(client);
  const device=(await client.query('SELECT * FROM pos_offline_devices WHERE device_uuid=$1',[id])).rows[0];
  if(device?.is_active)return {status:'approved',device:safeDevice(device)};
  const row=(await client.query('SELECT * FROM pos_offline_device_requests WHERE device_uuid=$1 AND requested_by=$2 ORDER BY requested_at DESC,id DESC LIMIT 1',[id,req.user.id])).rows[0];
  // An old approval cannot undo a later revocation.
  return {status:row?.status==='approved' ? 'none' : row?.status || 'none',request:row?.status==='approved' ? null : safeRequest(row)};
});
export const listOfflineDeviceRequests = run(async(client,req)=>{
  requireManagement(req);
  await expireRequests(client);
  const rows=(await client.query(`SELECT r.*,u.name AS requested_by_name FROM pos_offline_device_requests r
    LEFT JOIN users u ON u.id=r.requested_by ORDER BY (r.status='pending') DESC,r.requested_at DESC LIMIT 100`)).rows;
  return {requests:rows.map(r=>({...safeRequest(r),requested_by_name:r.requested_by_name || 'Former user'}))};
});
const reviewRequest = async(client,req)=>{
  requireManagement(req);requireFreshAuth(req);
  if(!validUuid(req.params?.id))throw offlineError('Select a valid request.','OFFLINE_POS_REQUEST_INVALID',400);
  await expireRequests(client);
  const row=(await client.query('SELECT * FROM pos_offline_device_requests WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
  if(!row || row.status!=='pending')throw offlineError('This request is no longer pending. Refresh the list.','OFFLINE_POS_REQUEST_NOT_PENDING',409);
  return row;
};
export const approveOfflineDeviceRequest = run(async(client,req)=>{
  const row=await reviewRequest(client,req);
  const current=(await client.query('SELECT * FROM pos_offline_devices WHERE device_uuid=$1 FOR UPDATE',[row.device_uuid])).rows[0];
  const device=await activateDevice(client,req,row.device_uuid,row.requested_name,current);
  const updated=(await client.query("UPDATE pos_offline_device_requests SET status='approved',approved_device_id=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[row.id,device.id,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_APPROVED',device.id,{request_id:row.id,device_id:device.id,device_name:device.name,requested_by:row.requested_by,reviewed_by:req.user.id});
  return {status:'approved',device:safeDevice(device),request:safeRequest(updated)};
});
export const rejectOfflineDeviceRequest = run(async(client,req)=>{
  const row=await reviewRequest(client,req),reason=req.body?.reason ?? '';
  if(typeof reason!=='string' || reason.length>300 || /[<>\x00-\x1f\x7f]/.test(reason))throw offlineError('Use a short reason without markup (maximum 300 characters).','OFFLINE_POS_REQUEST_INVALID',400);
  const updated=(await client.query("UPDATE pos_offline_device_requests SET status='rejected',rejection_reason=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[row.id,reason.trim() || null,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_REJECTED',row.id,{request_id:row.id,device_name:row.requested_name,requested_by:row.requested_by,reviewed_by:req.user.id});
  return {status:'rejected',request:safeRequest(updated)};
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
export const saveOfflineStockMode = run(async(client,req)=>{
  const device=await setOfflineStockMode(client,req.params?.id,req.body?.stock_mode);
  await audit(client,req,'OFFLINE_POS_STOCK_MODE_UPDATED',device.id,{device_id:device.id,stock_mode:device.stock_mode});
  return {device};
});
export const syncOfflineCatalogue = run(async (client,req) => createOfflineSnapshot(client,req.body?.device_id,req.user.id));
