import { pendingPosSales, updateOfflineSale, posMoney } from './offlinePosDb.js';
let running;
export const isRecoverablePosError = error => ['NETWORK_ERROR','REQUEST_TIMEOUT','CSRF_TOKEN_UNAVAILABLE','POS_REQUEST_IN_PROGRESS'].includes(error.code) || error.status===429 || error.status>=500;
export const synchronizeOfflineSales = ({ send,onChange=()=>{} }) => {
  if (running) return running;
  const synchronize=async()=>{
    for (const sale of await pendingPosSales()) {
      if (sale.status==='attention' || (sale.next_attempt_at || 0)>Date.now()) continue;
      try {
        const response=await send({ items:sale.items,paymentMethod:'cash',amountTendered:sale.amount_tendered,idempotencyKey:sale.offline_transaction_id,offline:{ transaction_id:sale.offline_transaction_id,device_id:sale.device_id,snapshot_id:sale.snapshot_id,created_at:sale.created_at } });
        const receipt=response.receipt || response.order;
        if(!receipt || !Number.isSafeInteger(Number(receipt.order_id || receipt.id)) || !receipt.receipt_number || receipt.source!=='pos' || receipt.payment_method!=='cash' || receipt.payment_status!=='paid' || posMoney(receipt.total_amount)!==sale.total_amount)throw Object.assign(new Error('The server receipt needs review.'),{status:409,code:'POS_SYNC_ACK_INVALID'});
        await updateOfflineSale(sale.id,{ status:'synchronized',synced_at:new Date().toISOString(),server_order_id:receipt.order_id || receipt.id,server_receipt_number:receipt.receipt_number,server_receipt:receipt,last_error:null });
      } catch (error) {
        if (error.status===401) return { authenticationRequired:true };
        const recoverable=isRecoverablePosError(error);
        const delay=Math.max(Math.min(300000,15000*2**Math.min(sale.sync_attempts,5)),Math.min(3600000,Math.max(0,Number(error.retry_after_seconds) || 0)*1000));
        await updateOfflineSale(sale.id,{ status:recoverable ? 'pending' : 'attention',sync_attempts:sale.sync_attempts+1,next_attempt_at:recoverable ? Date.now()+delay : 0,last_error:recoverable ? 'Connection interrupted. This sale is saved and will retry.' : 'This in-store sale needs review. Check the sale and physical stock before retrying.',error_code:error.code || 'POS_SYNC_FAILED' });
        await onChange();
        if (recoverable) break;
      }
      await onChange();
    }
    return {};
  };
  running=(globalThis.navigator?.locks ? navigator.locks.request('10th-west-pos-sync',{ ifAvailable:true },lock=>lock ? synchronize() : {}) : synchronize()).finally(()=>{ running=null; });
  return running;
};
