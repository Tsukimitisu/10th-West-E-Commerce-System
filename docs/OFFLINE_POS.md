# Offline POS — one shop computer

The existing POS can use a local PIN to unlock cached
products and record **walk-in cash sales** during an outage. The PIN unlocks only
the local POS; it is not a server login. Manual GCash, provider payments,
promotions, server receipt voids and other workspaces require internet.

## Deployment and preparation

- Apply `202610200004_offline_pos.cjs` through the existing controlled migration
  process before enabling this feature. It has **not** been applied to the shared
  database during implementation. Verify on an isolated staging database first.
- Optional backend setting: `OFFLINE_POS_ACCESS_HOURS` (default 72; valid 1–168).
  The same validity bounds cached prices. An expired grant stops new offline
  sales, but never deletes receipts or pending transactions.
- Deploy the normal Vite build. A small build plugin produces a static-only
  service worker and install manifest. Existing Tailwind styling is cached from
  its exact public CDN URL; fonts, logo, fallback image and built app files are
  cached locally. No authenticated API response is cached by the worker.
- Use one current browser/profile on the shop computer, preferably an installed
  app. Keep its clock correct. Do not clear site data or use private browsing.
  Pending sales exist on this computer until the server acknowledges them;
  losing the computer/profile can lose unsynchronized records.
- Sign in freshly, open POS → **Offline POS setup**, choose a 6-digit PIN and
  enable this computer. Preparation waits for the production app shell to be
  cached. Installation is optional if the browser does not offer it.
- An inventory manager can open **Inventory → Adjust stock → Offline POS
  reserve**, select the variant where applicable, and save a quantity. The same
  reserve controls are available to authorized managers in POS setup. Existing
  products default to zero reserve.
- Synchronize the catalogue after configuring reserves. Confirm the last-sync
  time and access-expiry time before disconnecting.

## Stock protection

Offline holds are included in the existing `reserved_stock` total, separately
tracked by product/variant. Consequently all existing online availability checks,
including POS and storefront checkout, exclude those protected units. Physical
`stock_quantity` changes only through the existing stock transaction path.

Example: 10 physical units, no other reservations, offline reserve 3 → 7 online
sellable units and 3 offline units. Offline sales decrement the local allowance
atomically. On sync the server consumes the hold and writes the normal POS sale.
Catalogue refresh replenishes the configured hold only from unreserved stock,
and subtracts still-pending local sales before making any allowance available.
Reducing an issued live allowance is blocked while physical sales may exist.

Only one active device is permitted. Owner/Super Admin may revoke it from POS
setup. First synchronize/recover all pending sales. A disconnected computer
cannot receive an immediate remote revocation: stop using it physically. Its
protected quantities are quarantined on the server and are not granted to a
replacement until an inventory manager explicitly reviews physical stock and
old pending sales. Revocation never releases unknown physical sales to the web.
Only Owner/Super Admin can reauthorize a previously revoked computer.

## During an outage

Enter the Offline POS PIN after reopening the app. Search, scan or type a barcode,
SKU or part number. Sell only available reserved quantities. Cash receipt shows
**OFFLINE SALE / Pending synchronization** and an `OFF-POS-…` number. IndexedDB
saves the immutable UUID, sale, receipt and allowance decrement together before
the cart clears. Five wrong PINs cause a five-minute local cooldown. Passwords,
PIN plaintext, cookies and provider credentials are never stored in this data.

When the backend becomes reachable, pending sales synchronize one at a time.
If signed out, sign in and return to POS; the queue survives. Each retry uses the
original UUID as the existing Idempotency-Key. A permanent server ledger also
prevents duplication after the normal idempotency cache expires or cashier
changes. Successful records retain their original local receipt and server
receipt link. New app versions never delete IndexedDB or force a mid-sale reload.

**Needs attention** records stay saved and do not retry repeatedly. An owner can
review the physical sale, correct inventory/reserve through normal authorized
controls, then use **Retry after stock review**. This is not a force-accept action:
server prices, device, allowance and stock checks still apply. Do not enter a
second sale to resolve an uncertain one. An uncertain online payment must be
confirmed online before switching that cart to offline cash.

## Non-technical staging UAT (no production inventory)

1. Sign in to staging POS while online; enable Offline POS and choose its PIN.
2. Configure a test product/variant reserve, synchronize, then install/open POS.
3. Disconnect Wi-Fi/Ethernet; confirm **Offline mode** and the last-sync time.
4. Scan/search the test item. Confirm GCash and promotions are unavailable.
5. Complete a cash sale; print/view the pending offline receipt.
6. Close and reopen POS while disconnected; enter the PIN. Confirm the sale is
   still pending in Recent sales and the remaining allowance decreased.
7. Restore internet; sign in if requested. Confirm automatic synchronization
   (or choose Sync now), one order, one inventory deduction, and a server receipt
   linked to the same local transaction.
8. Verify allowance exhaustion, variant lookup, expired access, denied local
   PIN/cooldown, and that other workspaces cannot be opened through offline unlock.
9. On staging, simulate an inventory/product conflict; verify Needs attention
   preserves the receipt and owner-reviewed retry never duplicates the sale.
10. Check normal online cash, manual GCash, promotion, receipt/void, daily summary,
    barcode camera/USB scanner, and replacement-device quarantine using staging
    data. Confirm both desktop and phone layouts.

Automated tests mock the backend/provider operations. Real migration constraints,
physical scanners/printers, browser installation/storage persistence and the
complete outage/restart/reconnect sequence must still be checked on staging and
then on the designated shop computer using an approved non-production sale.

## Implementation files

Paths below are relative to each directory (34 files including this guide).

- `backend/`: `.env.example`, `migrations/202610200004_offline_pos.cjs`.
- `backend/src/`: `controllers/posController.js`, `controllers/offlinePosController.js`, `controllers/offlinePos.test.js`, `routes/pos.js`, `services/offlinePos.js`.
- `frontend/`: `App.jsx`, `index.jsx`, `vite.config.ts`, `posPwaPlugin.js`, `package.json`, `package-lock.json`.
- `frontend/pages/`: `staff/PosTerminal.jsx`, `staff/PaymentModal.jsx`, `staff/ReceiptModal.jsx`, `owner/InventoryView.jsx` (reserve button only).
- `frontend/components/`: `staff/OfflinePosRoute.jsx`, `staff/OfflinePosSetup.jsx`, `owner/OfflinePosReserveModal.jsx`.
- `frontend/hooks/`: `useOfflinePos.js`, `usePosConnection.js`.
- `frontend/services/`: `api.js`, `offlinePosDb.js`, `offlinePosAccess.js`, `offlinePosSync.js`, `offlinePosScope.js`, `posReachability.js`, `posPwa.js`.
- `frontend/tests/`: `offlinePos.test.js`, `qa-auth-profile-scanner.test.js`, `role-landing.test.js`.
- `frontend/e2e/`: `offlinePos.spec.js`.
