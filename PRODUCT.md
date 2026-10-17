# 10th West Motorcycle Parts & Accessories

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Motorcycle owners, riders, enthusiasts, mechanics and shops buying parts. Owners and staff managing inventory, orders, POS, shipping, returns and messages. Super administrators operating the platform.

## Product Purpose

A deployed motorcycle parts store connected to retail operations. Clear part identification, fitment, prices and availability for customers; fast and readable workflows for store teams.

## Capabilities and Constraints

React 19, Vite, Tailwind CDN, HashRouter; Express/PostgreSQL. Preserve authentication, OAuth, verification, 2FA, sessions, idle logout, RBAC, cart, checkout, COD, PayMongo/GCash, refunds, inventory, barcode, POS, J&T, tracking, reports, chat and notifications. This rebrand changes presentation, not APIs, database schema or business rules. The configured database is shared: QA must not create sales, orders or inventory changes.

## Brand Commitments

Official unmodified asset: `frontend/public/brand/10th-west-logo.png`. Premium automotive retail and professional business software; navy/black structure, orange interactions, selective red, white content. Condensed headings, readable UI, subtle angular details. No gaming, neon, skulls, flames, fabricated ratings or unsupported claims.

## Evidence on Hand

The explicit user brief, official logo, existing routes, catalog imagery and configured merchandising. Prices, ratings, fitment and stock must come from real data. No additional photography was supplied.

## Product Principles

- Retail usability and part identification first.
- Compact readable operations.
- Preserve permissions, integrations and workflows.
- One brand with distinct retail and operational contexts.

## Accessibility & Inclusion

Keyboard navigation, visible focus, meaningful labels, non-color status, reduced motion, WCAG-conscious contrast and practical 44px touch targets. Phone, tablet and desktop verification.

## Premium redesign commitments (17 October 2026)

The customer experience uses the active management-controlled banner and published-announcement carousel as its single Home hero, a compact searchable header and merchandise-led light catalog. Merchant banner imagery remains the hero content; no separate hardcoded marketing hero, duplicate offer section or Home search is added. Existing valid banner destinations are actionable; absent destinations are not invented. Authentication is one centered 420–480px surface with a compact official-logo header and Back to Store action: no split layout. Customer accounts retain the storefront header and use horizontal top navigation on desktop and phone. Orange owns interaction; red is restrained to danger/sale/critical state. Business workspaces prioritize neutral data surfaces, compact toolbars and readable Inter text. Existing banners, product records and permissions remain editable through their original workflows. The user's detailed composition is pinned and supersedes concept-workflow alternates.

## Customer shopping continuity

Customers can build a guest cart before signing in. The existing cookie-backed server cart remains authoritative; a local recovery snapshot preserves shopping context without making locally stored price, stock or discount authoritative. Authentication merges the guest cart through the server and acknowledges completion before the recovery snapshot is discarded. Protected customer destinations return to the intended shopping route after sign-in; operational role destinations remain governed by their existing role redirects. Customer Shop omits year filtering while product compatibility data remains available.
