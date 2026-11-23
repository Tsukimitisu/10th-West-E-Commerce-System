import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('setup resolves local browser UUID, lists approved devices and revokes only the selected computer',()=>{
  const ui=read('../components/staff/OfflinePosSetup.jsx');
  assert.match(ui,/getOfflinePosDevice\(computer.uuid\)/);assert.match(ui,/Registered Offline POS Devices/);assert.match(ui,/This computer/);
  assert.match(ui,/Computer name/);assert.match(ui,/revokeOfflinePosDevice\(row.id\)/);assert.match(ui,/row.device_uuid===computerUuid/);
  assert.doesNotMatch(ui,/Another computer is registered|Use only this shop computer/);
});
test('both reserve editors use device-specific controls and the existing reserve API',()=>{
  for(const path of ['../components/staff/OfflinePosSetup.jsx','../components/owner/OfflinePosReserveModal.jsx']){
    const ui=read(path);assert.match(ui,/<OfflineReserveFields/);assert.match(ui,/saveOfflinePosReserve\(\{device_id:/);
  }
  const fields=read('../components/staff/OfflineReserveFields.jsx');assert.match(fields,/Total Offline Protected/);assert.match(fields,/Other Reserved/);assert.match(fields,/Online Available/);assert.match(fields,/Select a computer/);
  const api=read('../services/api.js');assert.match(api,/offline\/device\/\$\{encodeURIComponent\(deviceId\)\}/);
});
