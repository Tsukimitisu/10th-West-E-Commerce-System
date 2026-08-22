Act as a senior full-stack developer, QA engineer, UI/UX engineer, backend engineer, and security engineer.

Project: 10th West Motorcycle E-Commerce System.

Goal:
Fix the reported customer-facing bugs and unfinished account/order/cart/shop functions without breaking the already working checkout, cart, order, Manual J&T, and shipping flow.

Important rules:
1. Do not implement PayMongo/GCash yet.
2. Do not change the current shipping provider logic unless needed for checkout compatibility.
3. Do not disable CSRF.
4. Do not weaken authentication or RBAC.
5. Do not bypass stock validation.
6. Do not trust frontend quantity, price, subtotal, total, or stock.
7. Do not commit `.env`.
8. Commit per fix/change.
9. Keep the 50 quantity limit consistent across Shop, Cart, Side Cart, Wishlist, Checkout, and backend.
10. Run all tests before final report.

Reported issues to fix:

A. Not Available Functions
- Google login is not available.
- Facebook login is not available.
- Enable 2FA is not available.

B. Profile Issues
- No number verification.
- Change Password has only one toggle for viewing password.
- No forgot password option.

C. Orders Issues
- When viewing an order, the order number font is white and hard to read.
- Clarify what the Order Number is for, and still show item names clearly.
- No filter for Pending Orders.

D. Shopping Cart Menu
- Visual bug at screen width starting around 769px where the peso sign clips through the plus button when price is 1,000+.

E. Shopping Cart Side Panel
- Adding quantity is not responsive / a bit slow.
- In Shop, adding an item to cart with quantity of 50, then pressing the cart icon again, bypasses the 50 quantity limit.

F. Checkout
- If the customer uses a different address than the saved address book, or has no saved address, checkout fails even after filling in all required address fields.

G. Wishlist
- Wishlist does not enforce the 50 quantity limit.

H. Shop / Stock
- After ordering a set amount of items, product stock does not decrease.

Required fixes:

1. Auth provider availability: Google/Facebook Login

Inspect existing Google/Facebook login implementation.

If OAuth is already partially implemented:
- Fix the UI so buttons are only enabled when provider is configured.
- Add backend readiness/config check for OAuth providers.
- If credentials are missing, show a clear message:
  "Google login is not configured yet."
  "Facebook login is not configured yet."
- Do not show broken "Not Available" buttons that look clickable.
- Do not fake OAuth success.
- Do not expose OAuth secrets to the frontend.
- Frontend may only know provider availability, not secrets.

If OAuth implementation is missing:
- Add safe provider availability detection only.
- Add clear disabled states and messages.
- Do not build full OAuth unless existing project structure already supports it safely.

Suggested commit:
git add backend frontend
git commit -m "fix(auth): handle oauth provider availability"

2. Enable 2FA

Inspect existing 2FA implementation.

If 2FA is already partially implemented:
- Fix Enable 2FA flow.
- User should be able to enable 2FA from profile/security settings.
- User should confirm password before enabling if the app already supports sensitive-action confirmation.
- Generate and verify code using existing 2FA/email/OTP mechanism if available.
- Add disable 2FA flow if missing.
- Add clear loading/error/success states.
- Do not expose secrets.
- Do not store plain OTP codes if there is already a secure hashing pattern.

If no real 2FA backend exists:
- Do not fake it.
- Add a clear disabled explanation:
  "Two-factor authentication is not configured yet."
- Add backend readiness key:
  two_factor.available = false

Suggested commit:
git add backend frontend
git commit -m "fix(auth): repair two factor availability flow"

3. Profile: phone/number verification

Inspect existing phone/number field.

Implement:
- Phone number field validation.
- Philippine phone number format support.
- Save phone number safely.
- Show verification status:
  - Verified
  - Not verified
  - Verification unavailable
- If SMS provider does not exist, do not pretend SMS verification works.
- If email-based OTP verification already exists, you may allow verifying account contact info using existing OTP flow, but label it accurately.
- The UI must not claim "number verified" unless there is a real verification step.

Suggested commit:
git add backend frontend
git commit -m "fix(profile): validate phone number verification state"

4. Profile: Change Password visibility toggles

Fix Change Password UI.

Each password field should have its own eye toggle:
- Current password
- New password
- Confirm new password

Rules:
- Toggling one field must not toggle all fields.
- New password and confirm password must validate.
- Show proper error if confirm password does not match.
- Keep existing backend password validation.

Suggested commit:
git add frontend
git commit -m "fix(profile): add independent password visibility toggles"

5. Forgot Password option

Add Forgot Password option to login page.

Requirements:
- Login page has "Forgot Password?"
- User can enter email.
- Backend sends reset email only if existing email/password reset flow exists.
- If backend reset flow is missing, add secure reset request flow using existing email service if available.
- Do not reveal whether an email exists. Response should be generic:
  "If an account exists for this email, password reset instructions have been sent."
- Add reset token expiry.
- Store reset token hashed if new table/column is needed.
- Add reset password page.
- Validate new password and confirm password.

Suggested commit:
git add backend frontend
git commit -m "feat(auth): add forgot password flow"

6. Orders: order number font color

Fix order detail page.

Issue:
- Order number text is white and hard to read.

Requirements:
- Make order number readable in light/dark modes.
- Check responsive/mobile view.
- Ensure contrast is acceptable.
- Do not use white text on white/light background.

Suggested commit:
git add frontend
git commit -m "fix(orders): improve order number readability"

7. Orders: clarify Order Number and show item names

Order Number should stay because it is used for:
- customer reference
- admin lookup
- support inquiry
- receipt/reference tracking
- order history

Fix UI:
- Display "Order Number" clearly.
- Add small helper text:
  "Use this number when asking support about your order."
- Still show ordered item names prominently.
- In order list, show item summary if available:
  Example: "Yamaha NMAX Brake Pad + 2 more items"
- In order detail, show complete order_items list with product name, quantity, unit price, and line total.

Suggested commit:
git add frontend backend
git commit -m "fix(orders): clarify order number and item names"

8. Orders: Pending filter

Add order filter tabs/dropdown:
- All
- Pending
- Processing
- Shipped
- Delivered
- Cancelled

Requirements:
- Customer order page supports Pending filter.
- Admin order page supports Pending filter if admin order list exists.
- Backend API supports status filter safely, or frontend filters only if all data is already loaded.
- Validate allowed status values.
- Do not allow arbitrary SQL/status injection.

Suggested commit:
git add backend frontend
git commit -m "feat(orders): add pending status filter"

9. Shopping cart menu visual bug at 769px+

Fix responsive layout issue.

Issue:
- At screen width around 769px, peso sign clips through plus sign when price is 1,000+.

Requirements:
- Test at 769px, 768px, 800px, tablet widths, desktop widths.
- Price and quantity controls should not overlap.
- Peso sign and price text should wrap/truncate properly if needed.
- Quantity plus/minus buttons must have fixed safe spacing.
- For prices like ₱1,000, ₱10,000, and ₱100,000, layout must remain stable.
- Use CSS flex/grid fixes, min-width, gap, and overflow handling as needed.

Suggested commit:
git add frontend
git commit -m "fix(cart): prevent price and quantity control overlap"

10. Shopping cart side panel responsiveness

Issue:
- Adding quantity in side panel is slow.

Requirements:
- Inspect cart state update flow.
- Improve perceived responsiveness with optimistic UI only if safe.
- Debounce or queue quantity API updates to prevent race conditions.
- Disable plus/minus button briefly during update if needed.
- Show loading state per item, not whole cart.
- Ensure final quantity always matches backend.
- Do not allow quantity above 50.
- Do not allow quantity above available stock.
- Do not allow negative/zero quantity.

Suggested commit:
git add backend frontend
git commit -m "fix(cart): improve side panel quantity updates"

11. Fix 50 quantity limit bypass

Issue:
- In Shop, user adds item with quantity 50.
- Then pressing cart icon again bypasses 50 quantity limit.

Required backend rule:
- All add-to-cart and update-cart endpoints must enforce:
  final_quantity <= 50
  final_quantity <= available_stock
- If item already exists in cart, adding more must check existing_quantity + add_quantity.
- Return clear error:
  "Maximum quantity per item is 50."

Required frontend rule:
- Shop add-to-cart button should check current cart quantity before adding.
- Cart side panel should prevent increment above 50.
- Cart page should prevent increment above 50.
- Wishlist move/add-to-cart should prevent quantity above 50.

Suggested commit:
git add backend frontend
git commit -m "fix(cart): enforce maximum quantity across cart flows"

12. Checkout address bug

Issue:
- If customer uses a different address than saved address book, or has no saved address, checkout fails even after filling in all address fields.

Required behavior:
- Checkout supports two address modes:
  1. Select saved address
  2. Use new address for this order

If customer has no saved address:
- Show new address form by default.
- Allow checkout after all required fields are filled.

If customer uses new address:
- Validate fields.
- Save the address snapshot to the order.
- Do not require address_id if full address fields are provided.
- Optional checkbox:
  "Save this address to my address book"
- If checked, create saved address after successful validation.
- If not checked, use it only for the order.

Backend rules:
- Checkout accepts either:
  address_id belonging to user
  OR complete address payload
- Never allow using another user's address_id.
- Validate required fields:
  recipient_name
  phone
  street/address_line
  city
  province
  region or coverage classification if needed
  postal_code if project requires it
- Shipping quote must work with saved address or new address payload.
- Luzon-only shipping validation must also work for new address payload.

Suggested commit:
git add backend frontend
git commit -m "fix(checkout): support new address checkout"

13. Wishlist 50 quantity limit

Issue:
- Wishlist does not have 50 quantity limit.

Requirements:
- Wishlist quantity must be limited to 50.
- Moving wishlist item to cart must not bypass cart limit.
- Adding wishlist item to cart must account for existing cart quantity.
- Backend must enforce the limit.
- Frontend must show clear message if limit is reached.

Suggested commit:
git add backend frontend
git commit -m "fix(wishlist): enforce maximum quantity limit"

14. Shop stock does not decrease after ordering

Issue:
- After placing an order, stock number does not change.

Required behavior:
- When order is successfully placed, product stock should decrease.
- Stock deduction must happen in a safe backend transaction.
- Deduct stock based on ordered quantity.
- Do not allow checkout if requested quantity exceeds stock.
- Prevent race condition where two users order the last stock at the same time.
- If payment method is COD:
  deduct stock on successful order creation.
- If future payment method is GCash:
  decide later whether stock is reserved on pending payment or deducted only after paid. Do not implement GCash yet.
- If order is cancelled before fulfillment, stock should be restored if the project already has cancellation flow.
- If cancellation flow exists, ensure stock restoration is idempotent.
- If cancellation flow does not exist, do not invent a risky cancellation system; report it as next step.

Database rules:
- Use transaction or safe SQL update:
  UPDATE products
  SET stock = stock - quantity
  WHERE id = product_id AND stock >= quantity
- If affected rows = 0, reject checkout with OUT_OF_STOCK.
- Order creation and stock deduction must be atomic.

Suggested commit:
git add backend frontend
git commit -m "fix(orders): deduct stock after successful checkout"

15. Regression tests

Add/update backend tests for:
- OAuth availability response
- 2FA availability or working enable flow
- phone number validation state
- forgot password generic response
- pending order filter
- cart max quantity at add-to-cart endpoint
- cart max quantity at update quantity endpoint
- adding existing cart item cannot exceed 50
- wishlist max quantity
- wishlist move-to-cart cannot exceed 50
- checkout with saved address works
- checkout with new unsaved address works
- checkout with no saved address works when form is complete
- checkout rejects incomplete new address
- checkout rejects address_id owned by another user
- stock deducts after COD order
- checkout rejects out-of-stock
- stock deduction is atomic/safe
- order item names are returned for order detail/list

Add/update frontend tests for:
- Google/Facebook unavailable buttons are disabled or show configured state
- Enable 2FA no longer shows broken "Not Available" without explanation
- independent password visibility toggles
- forgot password link/page
- pending order filter
- order number readable
- item names visible in order detail
- cart layout at 769px with ₱1,000+ price
- side cart quantity update cannot exceed 50
- shop add-to-cart cannot bypass 50
- wishlist quantity cannot exceed 50
- checkout with new address works
- checkout with no saved address shows address form
- checkout blocks incomplete address
- stock display updates after order or after refetch

Suggested commit:
git add backend frontend
git commit -m "test(regression): cover customer account cart checkout order fixes"

16. Run final checks

Run:

npm --prefix backend run migrate:status
npm --prefix backend run lint
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run e2e
npm --prefix backend run audit:integrity

17. Final report format

Final report must include:

1. Git status
2. Commits created
3. Files changed
4. OAuth Google result
5. OAuth Facebook result
6. 2FA result
7. Phone verification/profile result
8. Change password toggle result
9. Forgot password result
10. Order number font/readability result
11. Order item names result
12. Pending order filter result
13. Cart 769px visual bug result
14. Side cart responsiveness result
15. 50 quantity bypass result
16. Checkout new address result
17. Checkout no saved address result
18. Wishlist 50 quantity limit result
19. Stock deduction result
20. Backend lint/test result
21. Frontend lint/test/build result
22. E2E result
23. Integrity audit result
24. Remaining blockers
25. Next recommended step

Strict success criteria:
This task is complete only if:
- Broken unavailable auth functions are handled or fixed properly
- 2FA is either working or clearly shown as not configured without broken UI
- Change password has separate visibility toggles
- Forgot password option exists
- Order number is readable
- Item names are visible in orders
- Pending order filter exists
- Cart layout no longer overlaps at 769px
- Cart quantity update is responsive and safe
- 50 quantity limit cannot be bypassed anywhere
- Checkout works with saved address, new address, and no saved address
- Wishlist also enforces 50 quantity limit
- Stock decreases safely after successful order
- Backend tests pass
- Frontend build passes
- E2E passes
- Integrity audit passes