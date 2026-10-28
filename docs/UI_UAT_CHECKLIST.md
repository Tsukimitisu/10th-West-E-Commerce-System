# Phase 2 UI manual UAT

Use a staging environment with test accounts and isolated order data. These checks are **pending manual verification** until a tester records a date, account role, browser, viewport, and result. Do not run checkout, POS, inventory edits, or refund actions against the shared remote database solely for UI testing.

## Auth

- [ ] Local login: valid, invalid, unverified, and locked accounts show appropriate states.
- [ ] Google sign in and callback; switching Google accounts; cancellation and provider failure.
- [ ] Facebook sign in and callback; cancellation and provider failure.
- [ ] Registration confirmation accurately describes whether verification email was sent.
- [ ] Email verification succeeds, expires, and can be resent without revealing provider errors.
- [ ] Forgot password and reset password: valid, expired, and reused links.
- [ ] 2FA setup, recovery codes, challenge, and disable flow with keyboard access.
- [ ] Idle logout and expired session preserve a clear route back to login.

## Shopping

- [ ] Search suggestions, product detail, compatibility, and unavailable products.
- [ ] Cart quantity, remove, stock change, and price change notices; check selected totals.
- [ ] Checkout with a saved address and with a valid new address that has no `address_id`.
- [ ] Checkout displays contact, address, shipping, payment, and review sections.
- [ ] COD order uses the final displayed total.
- [ ] GCash redirects through PayMongo and returns to the correct result state.
- [ ] Manual J&T shipping fee and wording match the server quote; no live tracking is implied.

## Operations

- [ ] Inventory search, filters, edit, stock status, and mobile record layout.
- [ ] Barcode scan permissions, camera prompts, and manual fallback.
- [ ] POS product selection, cart, payment, receipt, and phone layout.
- [ ] Orders filters, status transitions, assignment, and manual J&T waybill handling.
- [ ] Return request detail, evidence when present, approval/rejection confirmation, and refund status.
- [ ] Reports date filters, chart labels, tables, PDF print, and CSV import into Excel.
- [ ] Promotions active, upcoming, expired, and inactive states; create, edit, and delete confirmation.
- [ ] Banners image preview, missing image fallback, placement, order, and publish state.
- [ ] Customer directory search, detail, and responsive layout.

## Owner content

- [ ] Edit a policy with heading, bold, italic, list, and safe HTTPS link.
- [ ] Publish and confirm the customer policy page shows the saved title and formatting.
- [ ] Confirm unsafe script, event handler, iframe, and unsafe link markup is removed.
- [ ] Confirm existing policy content still renders after deployment.

## Super Admin

- [ ] System overview KPIs, health rows, and links to detail views.
- [ ] Users and roles search, filters, mobile records, account detail, and guarded actions.
- [ ] Security controls and login attempt filters.
- [ ] Monitoring and audit events on desktop and phone.
- [ ] Configuration sections and save feedback.
- [ ] Maintenance status: verify whether server enforcement exists before enabling a maintenance control.
- [ ] Backup metadata and recovery instructions; verify recoverable backups directly in Supabase before relying on them.

## Mobile

- [ ] Chat list and thread navigation, keyboard, and footer clearance.
- [ ] Notifications list, unread state, and action targets.
- [ ] POS catalog and sticky sale summary.
- [ ] Inventory cards, filters, and action menus.
- [ ] Checkout address picker, payment choice, final review, and sticky elements.
- [ ] Profile account deletion sheet: immediate visibility, focus trap, body scroll lock, visible destructive action, Escape, and focus return.

## Viewport matrix

Record results at **375, 390, 430, 768, 1024, 1280, and 1440 px**. Cover Home, Shop, Product, Cart, Checkout, Login, Register, Profile, Orders, Chat, Notifications, Owner Dashboard, Inventory, Orders, POS, Reports, Content, Customers, and Super Admin Overview, Users, Monitoring, Maintenance, Audit. Check horizontal overflow, dialog clipping, hidden buttons, table readability, text wrapping, navigation, safe spacing, and footer interference.

| Date / tester | Environment / browser | Role / route / viewport | Result | Issue link |
| --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | — |
