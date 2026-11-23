# Storefront listing editor mobile regression

## Scope and safety

The change is local only. No deployment, migration, production upload or shared
database mutation was performed. Browser tests use the existing disposable
`backend/test-support/listingEditorServer.js`: real auth/CSRF/controllers/SQL in
PGlite, with the external storage transport replaced. Other API routes and
websockets are intercepted. JPG and PNG payloads are generated with Canvas,
selected through Playwright's file chooser, and decoded as thumbnails.

## Evidence before the fix

At 390×844, a 15-item Owner set was opened and items 1, 4, 6, 10 and 15 were
uploaded, replaced, saved and reopened. Ordinary emulated chooser returns did
**not** reproduce the production blank screen. There were no pageerrors or
console errors. The editor form remained mounted with positive height.

The original panel box was `(x:0, y:67.53125, width:390, height:776.46875)`.
Its `clientHeight` was 774, while its initial `scrollHeight` was 4157. The panel
used `overflow:hidden`, which still permits programmatic/focus scrolling.
The inner content was a separate `overflow-y:auto` area, height 697.46875.
Both document/body scroll positions and `window.scrollY` were 0. Both
`visualViewport.height` and `innerHeight` were 844.

| Item | Content scrollTop before/after selection | Content clientHeight | Content scrollHeight after | Panel scrollTop | Form mounted |
|---|---|---|---|---|---|
| 1 | 0 / 0 | 697 | 4599 | 0 | Yes |
| 4 | 822 / 822 | 697 | 4647 | 0 | Yes |
| 6 | 1328 / 1328 | 697 | 4695 | 0 | Yes |
| 10 | 2292 / 2292 | 697 | 4743 | 0 | Yes |
| 15 | 3485 / 3485 | 697 | 4791 | 0 | Yes |

Focus was the dialog panel before the chooser, the `sr-only` file input while
choosing, and BODY after selection disabled that input. No row scroll jump or
zero-height content occurred in this ordinary emulated path.

### Reproduced clipping mechanism

With the original CSS restored temporarily, explicitly assigning the outer
panel's scrollTop to its scrollHeight reproduced the large white panel. This
is **fault injection**, not an observed native Android focus event:

| Measurement | Value |
|---|---|
| Outer panel scrollTop | 3383 |
| Outer panel clientHeight / scrollHeight | 774 / 4157 |
| Content bounding box y / bottom | -3237.46875 / -2540 |
| Header bounding box y / bottom | -3292.46875 / -3260.46875 |
| Content clientHeight / scrollHeight | 697 / 4551 |
| Editor form still mounted / height | Yes / 4511 |
| Body/document/window scroll | 0 / 0 / 0 |
| visualViewport.height / innerHeight | 844 / 844 |

The screenshot was visually inspected: the panel is white while its header and
entire content scroller are clipped above it. This demonstrates **B**, form
still mounted but clipped outside the visible panel. It is not **A** (React
crash) or **C** (height collapse). **D**, a physical native picker restoring an
invalid focus/ancestor-scroll offset, remains the suspected production trigger
and needs device confirmation. The ordinary emulated picker did not prove D.

The failing regression expected outer panel scrollTop 0 and received 3383.
The separate full-height regression expected at least 843px and received
776.46875px. The fixed CSS passes both checks.

## Implementation

- Storefront editors opt into a mobile full-height sheet at widths below 640px:
  100vh fallback, 100dvh height/max-height, safe-area header/content padding.
- The fixed flex header sits outside the sole `min-height:0; overflow-y:auto`
  content area. `overflow:clip` prevents the outer panel owning a scroll offset,
  even when a browser attempts to restore one. Its scrollHeight can still
  include descendant overflow; its scrollTop must remain zero.
- A visible button opens a `hidden`, non-tabbable native file input in the same
  user activation. The button stays focusable during upload with aria-disabled
  and an action guard. The hidden input is excluded from layout and focus traps.
- The picker transaction remembers the editor scrollTop. Change/cancel, window
  focus, visibility return and window/visualViewport resize restore the visible
  trigger using `focus({preventScroll:true})` and clamp the saved content offset.
  Two animation frames allow layout to settle. If available height changed, only
  enough scrolling to reveal the trigger is applied. The next pointer/key/wheel
  interaction releases restoration; unmount aborts listeners and frames.
- The existing ListingEditorBoundary message, Retry editor and Close remain
  reachable after a deliberate lower-row render fault. Retry preserves unsaved
  form state.
- Owner/Staff stylesheet rules, upload MIME handling, backend APIs and database
  schema are unchanged. Existing desktop sizing and portal/body-lock logic remain.

## Automated verification

`frontend/e2e/listing-mobile-sheet.spec.js` exercises Owner and Staff at
360×800, 390×844, 412×915, 768×1024 and 1440×950 with 15 rows. For items
1, 4, 6, 10 and 15 it selects actual JPG/PNG payloads via filechooser, verifies
row/header/close/form visibility, thumbnail decoding, a valid scroll owner,
panel bounds, upload replacement and save/reopen persistence. Layout and focus
measurements are attached as JSON for every row and viewport.

Additional cases deliberately inject ancestor scroll displacement and late
focus/viewport events; verify user scrolling regains control; exercise cancel,
failed upload, remove, close during upload and reopening at 390/768/1440; and
exercise the mobile render fallback/retry for both roles.

Commands use `E2E_START_SERVER=false` with a local Vite server. Each simultaneous
Playwright process must use a distinct `--output` directory so that artifact
cleanup cannot erase another run's traces. Final checks run serially: concurrent
PGlite startup exceeded the default 30-second hook timeout on this machine.
The fixture allows 60 seconds to start, models auth session activity/expiry, and
retries GET transport resets twice. Write/upload requests are never retried by
this fixture forwarding layer. These harness issues are separate from editor
layout or React failures.

## Physical-phone UAT still required

Status cannot be full PASS without a physical phone. Test Android Chrome and
Android Brave with the native gallery picker, for both Owner and authorized
Staff, against an isolated UAT environment (not production):

1. Open a set with at least 15 items; test rows 4, 6, 10 and 15 individually.
2. Scroll to the row, tap Upload/Replace, choose a JPG/PNG from native gallery,
   and return. Also test Back/cancel and switching gallery/camera providers.
3. Confirm the same row, header and Close remain visible; thumbnail loads;
   subsequent manual scrolling works; save/reopen preserves the image.
4. Repeat with browser chrome expanded/collapsed, portrait/landscape, and a
   keyboard previously opened on a lower row. Include a slow/failed upload and
   closing while upload is pending.
5. Capture the same JSON geometry/focus/scroll values if any failure recurs.

Emulation and injected restoration cases are evidence of resilience, not a
substitute for native-gallery UAT or proof of its precise production event order.

## Final results

- **PASS WITH WARNINGS**: physical Android Chrome/Brave native-gallery UAT remains.
- Frontend unit/source-contract tests: **219 passed, 0 failed**.
- Dedicated mobile project: **20 scenarios passed** (19 in the serial suite,
  plus the Owner 412×915 case rerun successfully against the production preview
  after an initial local GET ECONNRESET; the forwarding layer now retries GETs).
- Compiled production bundle, Chromium: **47 passed, 0 failed**, including the
  dedicated matrix, existing listing-option images and existing upload-runtime
  suites. This run used the local Vite preview at localhost:5180.
- Frontend lint, diff whitespace check and production build: **passed**. Build
  used `VITE_API_URL=https://api.example.com/api`; browser API calls remained
  intercepted and forwarded exclusively to disposable local fixtures.
- Viewports: 360×800, 390×844, 412×915, 768×1024 and 1440×950. Both roles pass
  lower-row uploads/replacements/persistence at rows 4, 6, 10 and 15, plus row 1.
- Mobile render fallback/retry, cancellation, failed upload, removal, closing
  during upload and subsequent reopening pass. Normal upload flows emit no
  pageerror or console error; deliberately failed HTTP uploads are expected.
- No migration, production mutation or deployment. The physical-picker trigger
  for the reported production failure remains unconfirmed; the reproduced
  ancestor-clipping mechanism and restoration fault-injection checks are stated
  separately above.
