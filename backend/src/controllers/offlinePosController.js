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
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ message:error.status ? error.message : 'Offline POS preparation could not be completed.', code:error.status ? error.code : 'OFFLINE_POS_PREPARATION_FAILED' });
  } finally { client.release(); }
};
const audit = (client,req,action,id,metadata) => writeAuditLog(client,{ req,actorUserId:req.user.id,action,entityType:'pos_offline_device',entityId:id,metadata });
export const getOfflineDevice = run(async client => ({ device:(await client.query('SELECT id,name,registered_at,last_synced_at FROM pos_offline_devices WHERE is_active=true')).rows[0] || null }));
export const getOfflineReserves = run(async(client,req)=>{
  const id=Number(req.query.product_id);
  if(!Number.isInteger(id)||id<1)throw offlineError('Select a valid inventory item.','OFFLINE_POS_RESERVE_INVALID',400);
  return {reserves:(await client.query('SELECT product_id,variant_id,target_quantity,remaining,quarantined FROM pos_offline_reserves WHERE product_id=$1',[id])).rows};
});
export const registerOfflineDevice = run(async (client,req) => {
  const issued = Number(req.session?.auth?.authenticatedAt);
  if (!issued || Date.now()-issued > 15*60000 || issued > Date.now()) throw offlineError('Sign in again before enabling offline access on this computer.', 'OFFLINE_POS_REAUTH_REQUIRED', 401);
  const id = String(req.body?.device_uuid || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw offlineError('A valid computer identifier is required.', 'OFFLINE_POS_DEVICE_INVALID',400);
  const current = (await client.query('SELECT * FROM pos_offline_devices WHERE is_active=true FOR UPDATE')).rows[0];
  if (current && current.device_uuid !== id) throw offlineError('Another computer is registered. Ask the owner to revoke it before replacing the POS computer.', 'OFFLINE_POS_DEVICE_EXISTS');
  if (current) return { device:{ id:current.id,name:current.name } };
  const revoked=(await client.query('SELECT id FROM pos_offline_devices WHERE device_uuid=$1 FOR UPDATE',[id])).rows[0];
  if(revoked){
    if(!['owner','super_admin','admin'].includes(req.user.role))throw offlineError('Ask the owner to authorize this previously revoked computer.','OFFLINE_POS_DEVICE_REVOKED',403);
    await client.query('UPDATE pos_offline_devices SET is_active=true,revoked_at=NULL,registered_by=$2,registered_at=now() WHERE id=$1',[revoked.id,req.user.id]);
    await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',revoked.id,{ reauthorized:true });
    return {device:{id:revoked.id,name:'10th West POS'}};
  }
  const device = (await client.query("INSERT INTO pos_offline_devices(id,device_uuid,name,registered_by) VALUES($1,$2,'10th West POS',$3) RETURNING id,name", [crypto.randomUUID(),id,req.user.id])).rows[0];
  await audit(client,req,'OFFLINE_POS_DEVICE_REGISTERED',device.id,{});
  return { device };
});
export const revokeOfflineDevice = run(async (client,req) => {
  const device = (await client.query('UPDATE pos_offline_devices SET is_active=false,revoked_at=now() WHERE is_active=true RETURNING id')).rows[0];
  if (device) {
    await client.query('UPDATE pos_offline_reserves SET quarantined=true WHERE remaining>0');
    await audit(client,req,'OFFLINE_POS_DEVICE_REVOKED',device.id,{ warning:'Disconnected physical sales require reconciliation before replacement.' });
  }
  // Holds intentionally remain protected until an inventory manager reviews them.
  return { revoked:true };
});
export const saveOfflineReserve = run(async (client,req) => {
  await setOfflineReserve(client,{ productId:Number(req.body?.product_id),variantId:req.body?.variant_id == null ? null : Number(req.body.variant_id),quantity:Number(req.body?.quantity),reviewed:req.body?.reviewed === true });
  await audit(client,req,'OFFLINE_POS_RESERVE_UPDATED',req.body.product_id,{ variant_id:req.body.variant_id || null,quantity:Number(req.body.quantity) });
  return { saved:true };
});
export const syncOfflineCatalogue = run(async (client,req) => createOfflineSnapshot(client,req.body?.device_id,req.user.id));
