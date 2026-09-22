import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isValidPhilippineMobile, normalizePhilippineMobile } from '../utils/phone.js';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('registration exposes a loading state and synchronously blocks duplicate submissions', async () => {
  const source = await read('pages/Register.jsx');
  assert.match(source, /submittingRef\.current/);
  assert.match(source, /if \(submittingRef\.current\) return/);
  assert.match(source, /disabled=\{loading\}/);
  assert.match(source, /Creating account\.\.\./);
  assert.match(source, /requiresVerification \|\| err\.code === 'VERIFICATION_EMAIL_FAILED'/);
});

test('Philippine mobile input accepts all supported forms and normalizes storage to E.164', () => {
  for (const input of ['09123456789', '+639123456789', '639123456789', '+63 912 345 6789']) {
    assert.equal(isValidPhilippineMobile(input), true, input);
    assert.equal(normalizePhilippineMobile(input), '+639123456789', input);
  }
  assert.equal(isValidPhilippineMobile('08123456789'), false);
});

test('profile clearly separates OAuth password and deletion behavior', async () => {
  const [profile, api] = await Promise.all([read('pages/customer/Profile.jsx'), read('services/api.js')]);
  assert.match(profile, /has_local_password/);
  assert.match(profile, /Set Local Password/);
  assert.match(profile, /This account uses \{oauthProviderLabel\} sign-in/);
  assert.match(profile, /not change your \$\{oauthProviderLabel\} password/);
  assert.match(profile, /hasLocalPassword \? <div/);
  assert.match(profile, /deleteAccount\(\{ password: hasLocalPassword \? deletePassword : '', confirmation: deleteConfirmText \}\)/);
  assert.match(api, /JSON\.stringify\(\{ password, confirmation \}\)/);
});

test('Google-managed profile email is read-only with an explanatory message', async () => {
  const profile = await read('pages/customer/Profile.jsx');
  assert.match(profile, /email_managed_by_google/);
  assert.match(profile, /readOnly=\{isGoogleManagedEmail\}/);
  assert.match(profile, /Your email address is linked to your Google account and cannot be changed here\./);
});

test('account deletion dialog is centered, focused, scroll locked, and keyboard trapped', async () => {
  const profile = await read('pages/customer/Profile.jsx');
  assert.match(profile, /role="dialog" aria-modal="true"/);
  assert.match(profile, /deleteDialogRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(profile, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(profile, /event\.key === 'Escape'/);
  assert.match(profile, /event\.key !== 'Tab'/);
  assert.match(profile, /deleteConfirmRef\.current\?\.focus/);
  assert.match(profile, /z-\[100\]/);
});

test('policy editor preserves its DOM selection history and wires native undo and redo', async () => {
  const editor = await read('components/owner/RichTextEditor.jsx');
  assert.match(editor, /lastEmittedHtmlRef/);
  assert.match(editor, /nextHtml === lastEmittedHtmlRef\.current/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
  assert.match(editor, /exec\('undo'\)/);
  assert.match(editor, /exec\('redo'\)/);
});

test('privacy, terms, and returns use one legal-page theme and the shared application Footer', async () => {
  const [privacy, terms, returns, app] = await Promise.all([
    read('pages/Support/PolicyPrivacy.jsx'), read('pages/Support/TermsOfService.jsx'),
    read('pages/Support/ReturnPolicy.jsx'), read('App.jsx'),
  ]);
  for (const source of [privacy, terms, returns]) {
    assert.match(source, /data-legal-page/);
    assert.match(source, /min-h-screen bg-slate-50 text-slate-900/);
    assert.doesNotMatch(source, /<Footer/);
  }
  assert.match(app, /!hideFooter && !isSuperAdmin && <Footer \/>/);
});

test('staff camera scanner has permission fallback, manual entry, and deterministic stream cleanup', async () => {
  const [scanner, inventoryForm, receive, pos, app] = await Promise.all([
    read('components/staff/CameraScannerModal.jsx'), read('components/owner/InventoryItemForm.jsx'),
    read('components/owner/ReceiveStock.jsx'), read('pages/staff/PosTerminal.jsx'), read('App.jsx'),
  ]);
  assert.match(scanner, /@zxing\/browser/);
  assert.match(scanner, /facingMode: \{ ideal: 'environment' \}/);
  assert.match(scanner, /Camera permission is required to scan\. You may enter the part number manually\./);
  assert.match(scanner, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(scanner, /controlsRef\.current\?\.stop/);
  assert.match(scanner, /Manual fallback/);
  assert.match(inventoryForm, /Scan with Camera/);
  assert.match(receive, /Scan with Camera/);
  assert.match(pos, /Scan with Camera/);
  assert.match(pos, /Item not found in inventory\./);
  assert.match(pos, /addLine\(exactProduct, exactVariant\)/);
  assert.match(app, /\[Role\.OWNER, Role\.ADMIN, Role\.STORE_STAFF, Role\.CASHIER\]\.includes\(user\?\.role\)/);
  assert.doesNotMatch(app, /Role\.CUSTOMER[^\n]*<PosTerminal/);
});
