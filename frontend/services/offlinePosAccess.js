import { readPosValue, writePosValue, posTransaction } from './offlinePosDb.js';
const ITERATIONS=600000;
let unlocked=null;
const derive = async (pin,salt) => {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return [...new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2',salt:new Uint8Array(salt),iterations:ITERATIONS,hash:'SHA-256' },key,256))];
};
export const currentOfflineAccess = () => unlocked && Date.parse(unlocked.expires_at)>Date.now() ? unlocked : null;
export const lockLocalPos = () => { unlocked=null; };
export const renewUnlockedPos = grant => { if(unlocked?.device_id===grant.device_id)unlocked=grant; };
export const setupOfflinePin = async (pin,snapshot,cashier) => {
  if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit Offline POS PIN.');
  const salt=[...crypto.getRandomValues(new Uint8Array(16))];
  const verifier=await derive(pin,salt);
  const grant={ id:'grant',salt,verifier,iterations:ITERATIONS,device_id:snapshot.device_id,expires_at:snapshot.expires_at,cashier:{ id:cashier.id,name:cashier.name || 'Cashier' },attempts:0,locked_until:0 };
  await writePosValue('offline_access',grant);
  unlocked=grant;
};
export const unlockOfflinePos = async pin => {
  const grant=await readPosValue('offline_access','grant');
  if (!grant || Date.parse(grant.expires_at)<=Date.now()) throw new Error('Offline POS is not ready or access has expired. Connect to the internet to prepare this computer.');
  if (grant.locked_until>Date.now()) throw new Error('Too many PIN attempts. Try again in a few minutes.');
  const input=await derive(String(pin),grant.salt);
  let difference=input.length ^ grant.verifier.length;
  for (let i=0;i<input.length;i++) difference |= input[i] ^ grant.verifier[i];
  const allowed=await posTransaction(['offline_access'],'readwrite',async(s,r)=>{
    const latest=await r(s.offline_access.get('grant'));
    if (!latest || latest.locked_until>Date.now() || Date.parse(latest.expires_at)<=Date.now() || String(latest.verifier)!==String(grant.verifier)) return false;
    if (difference) { latest.attempts=(latest.attempts || 0)+1; if (latest.attempts>=5) { latest.locked_until=Date.now()+5*60000; latest.attempts=0; } }
    else { latest.attempts=0; latest.locked_until=0; }
    await r(s.offline_access.put(latest));
    return difference===0;
  });
  if (!allowed) throw new Error('PIN not accepted. After 5 failed attempts, this computer pauses PIN access for 5 minutes.');
  unlocked=grant;
  return grant;
};
