import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('new staff computers resolve approval before showing PIN preparation',()=>{
  const ui=source('../components/staff/OfflinePosSetup.jsx');
  assert.match(ui,/getOfflinePosApproval/);
  assert.match(ui,/Request Device Approval/);
  assert.match(ui,/Pending Approval/);
  assert.match(ui,/15000/);
});
test('management navigation exposes Offline POS Devices for both administration shells',()=>{
  for(const path of ['../components/owner/AdminLayout.jsx','../components/superadmin/SuperAdminLayout.jsx'])assert.match(source(path),/Offline POS Devices/);
});
test('management reviews reuse reserve controls and guard against staff access',()=>{
  const ui=source('../pages/owner/OfflinePosDevicesView.jsx');
  assert.match(ui,/\['owner','admin','super_admin'\]/);assert.match(ui,/if\(!management\)return/);
  assert.match(ui,/<OfflinePosSetup.*managementOnly/);assert.match(ui,/Approve computer/);assert.match(ui,/Reject request/);
  assert.doesNotMatch(ui,/saveOfflinePosReserve|registerOfflinePosDevice/);
});
