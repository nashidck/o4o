# O4O implementation record

Approved architecture: Next.js customer/retailer/admin UI, NestJS REST API, PostgreSQL/PostGIS, Prisma, Redis/BullMQ, S3-compatible private storage, isolated catalogue workers. No existing files or data were present at audit.

## Delivery sequence
1. Foundation: database, geography, sessions, permissions, runnable UI and CI.
2. Retailers, branches, moderated campaigns and regional discovery.
3. Secure catalogue ingestion, processing, viewer and manual hotspots.
4. Products, verified offers, search, comparison, coupons.
5. Accounts, follows, saved offers, lists, notifications, nearby discovery.
6. Content management, advertising, analytics, localisation.
7. Security, responsive QA, deployment and recovery verification.

No retailer partnerships or promotional prices are implied. Production records must be supplied and verified by authorised operators. Seed content is limited to location/category reference data.

## Architectural invariants
- All active discovery checks publication, retailer status and validity at query time.
- Explicit branch restrictions never become regional/universal availability.
- Retailer mutations check memberships on the server; browser role state grants no permission.
- OCR results are candidates, never automatically verified prices.
- Published campaign revisions require moderation before replacement.
- Private originals and unverified assets are never public by default.
- Billing is disabled; delivery and optional identity providers require configuration.
