# Philippine carrier support

The active production route is:

- Market: Philippines (`PH`)
- Carrier: J&T Express Philippines (`jtexpress-ph`)
- Shipping and labels: BigSeller
- Tracking: AfterShip by default; TrackingMore is an optional safe adapter shell

## Verification

- BigSeller documents connecting J&T Express Philippines for manual and Facebook
  orders, and obtaining tracking numbers and shipping labels:
  https://help.bigseller.com/en_US/detailPage/21/1/4237/content/
- BigSeller's 3PL guide lists J&T Express Philippines for Philippine orders:
  https://help.bigseller.com/en_US/detailPage/21/1/3915/content/
- AfterShip explicitly lists J&T Express Philippines and carrier slug
  `jtexpress-ph`:
  https://www.aftership.com/carriers/jtexpress-ph/api
- TrackingMore explicitly provides a J&T Express Philippines tracking API and
  uses carrier code `jtexpress-ph`:
  https://www.trackingmore.com/jtexpress-ph-tracking-api

BigSeller's public help confirms the operational capability, but its external
Open API contract is private. Production booking remains `not_implemented`
until BigSeller supplies the approved endpoint contract and credentials. This
prevents the application from claiming a booking or label that was not created.

PayRecon is not selectable because its public Philippine material confirms
generic courier synchronization but does not explicitly identify J&T Express
Philippines as a supported carrier.
