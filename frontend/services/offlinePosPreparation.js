import { readPosValue, writePosValue, savePosSnapshot } from './offlinePosDb.js';
import { setupOfflinePin } from './offlinePosAccess.js';

export async function verifyOfflinePreparation(deviceId) {
  const [snapshot, grant] = await Promise.all([readPosValue('metadata', 'snapshot'), readPosValue('offline_access', 'grant')]);
  if (!snapshot?.snapshot_id || snapshot.device_id !== deviceId || grant?.device_id !== deviceId
    || !Number.isFinite(Date.parse(snapshot.created_at)) || !Number.isFinite(Date.parse(snapshot.expires_at))
    || Date.parse(snapshot.expires_at) <= Date.now() || grant.expires_at !== snapshot.expires_at
    || grant.salt?.length !== 16 || grant.verifier?.length !== 32 || !Number.isInteger(grant.iterations) || grant.iterations < 600000
    || 'pin' in grant || 'password' in grant) {
    throw new Error('Offline preparation could not be verified. Stay online and prepare this computer again.');
  }
  return { snapshot, grant };
}

export async function prepareOfflinePos({ pin, deviceName, user, requireShell, registerDevice, getSnapshot, refreshLocal, onProgress = () => {} }) {
  if (!/^\d{6}$/.test(pin)) throw new Error('Choose a 6-digit Offline POS PIN.');
  onProgress('Preparing offline app…');
  await requireShell();
  let computer = await readPosValue('metadata', 'computer');
  if (!computer) { computer = { id: 'computer', uuid: crypto.randomUUID() }; await writePosValue('metadata', computer); }
  onProgress('Registering this computer…');
  const { device } = await registerDevice(computer.uuid,deviceName);
  if (device?.device_uuid !== computer.uuid) throw new Error('The registered computer does not match this browser. Stay online and ask an administrator to review registration.');
  onProgress('Downloading offline catalogue…');
  const fresh = await getSnapshot(device.id);
  if (fresh.device_id !== device.id || !fresh.id || !Array.isArray(fresh.products) || !Number.isFinite(Date.parse(fresh.expires_at)) || Date.parse(fresh.expires_at) <= Date.now()) {
    throw new Error('The offline catalogue is incomplete. Stay online and synchronize again.');
  }
  await savePosSnapshot(fresh);
  onProgress('Securing offline PIN…');
  await setupOfflinePin(pin, fresh, user);
  const verified = await verifyOfflinePreparation(device.id);
  await refreshLocal();
  onProgress('Offline POS ready.');
  return { ...verified, device };
}
