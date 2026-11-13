# API contract

Base path `/api/v1`. JSON requests and responses. Errors: `{ "error": { "message": "…", "requestId": "…" } }`. Discovery collections use bounded pagination (`page`, `limit`, maximum 60) where supported. Every mutation validates a dedicated Zod schema; unsupported fields are discarded.

## Authentication

`POST /auth/register`: `{name,email,password}` (minimum 12 characters).

`POST /auth/login`: `{email,password}`. Both return a public user object and `csrf`, setting HTTP-only `o4o_session` and readable `o4o_csrf` cookies. Send cookies on subsequent requests. Authenticated mutations require `X-CSRF-Token` and an `Origin` exactly equal to `WEB_ORIGIN`. Production cookies require HTTPS. Cross-site deployments need a same-site reverse proxy arrangement; do not disable these controls to make cross-site cookies work.

`POST /auth/logout`, `GET /me`, `PATCH /me/preferences`, `DELETE /me` (password confirmation; customer accounts without business memberships only).

`POST /auth/recover`: `{email}`; requires SMTP. `POST /auth/reset`: `{token,password}`. Tokens expire in 30 minutes, are stored hashed, are single-use, and revoke all sessions when consumed. No recovery token is returned in an API response.

`POST /auth/verification/request` sends an authenticated customer a verification link when SMTP is configured. `POST /auth/verification/confirm` consumes its token. Verification tokens cannot be used to reset passwords. Private list/retailer invitation recipients require verified email ownership.

## Public reads

| Endpoint | Query/behaviour |
|---|---|
| `/health` | Database readiness |
| `/locations` | `parent` or `q`; database hierarchy |
| `/categories`, `/content` | Enabled categories/editorial blocks |
| `/retailers` | `q,location,category,page,limit` |
| `/retailers/:slug` | Active retailer and branches |
| `/branches` | `location,retailer` |
| `/nearby` | `latitude,longitude,radius` (maximum 50km) |
| `/campaigns` | `location,q,retailer,sort,page,limit` |
| `/offers` | `location,q,category,retailer,campaign,minPrice,maxPrice,sort,page,limit` |
| `/products` | `q,category,page,limit`; availability is not implied |
| `/compare/:variantId` | `location`; exact-variant active verified offers |
| `/coupons` | `location,q,page,limit`; explicit scope/restrictions |
| `/search` | `q,location`; product typo suggestions, retailers, categories, campaigns and catalogue text |
| `/catalogues/:id` | `location`; compact approved page manifest |
| `/catalogues/:id/pages/:number` | `location`; one page and active verified hotspots |
| `/catalogues/:id/search` | `location,q`; matching page numbers |
| `/catalogues/:id/download` | `location`; redirect only if permitted |
| `/assets/:encodedKey` | Short-lived approved page-asset redirect |
| `/advertisements` | `location`; active region-targeted creatives |

Active campaigns/offers/catalogues/coupons require a valid selected location. Region scopes intersect branch restrictions, and empty applicability never means worldwide. Broader region discovery can include narrower localities, always returning their actual scope. End timestamps are exclusive.

## Customer writes

- `GET/POST /lists`, `POST /lists/:id/items`, `PATCH/DELETE /lists/:id/items/:itemId`, `POST /lists/:id/members`, `DELETE /lists/:id`.
- Item edits require the current list `version`; stale edits return 409. Shared members must already have an O4O account. Sharing grants editor access; only owners share/delete lists.
- `GET /me/follows`, `POST/DELETE /me/follows/:retailerId`.
- `GET /me/saved`, `POST/DELETE /me/saved/:offerId`.
- `GET /notifications`, `PATCH /notifications/:id` marks owned notifications read.

## Retailer and moderation

- `/retailer/register`, `/retailer/overview`, `PATCH /retailer/:id`.
- `POST /retailer/:id/branches`, `PATCH /retailer/:id/branches/:branchId`.
- `POST /retailer/:id/members`: owner-only employee invitation by existing account email.
- `POST /retailer/campaigns`: title, description, dates, retailerId, regionIds and branchIds.
- `PATCH /retailer/campaigns/:id`: title, description and version. Live edits create revisions.
- `POST /retailer/campaigns/:id/submit`, `POST /retailer/campaigns/:id/withdraw`.
- `POST /retailer/offers`: exact variant, campaign, prices, validity, regionIds/branchIds. Unverified by default.
- `POST /admin/campaigns/:id/moderate`: decision, version and rejection reason where applicable.
- `POST /admin/campaigns/:id/revisions/:revisionId`: approve/reject a submitted revision.
- `POST /admin/offers/:id/verify`: explicit human verification with audit record.

## Uploads

`POST /uploads`: `{campaignId,filename,mimeType:"application/pdf",byteSize}`; maximum 50MB. Returns a five-minute signed PUT URL and flyerId. PUT bytes directly to storage, then `POST /uploads/:flyerId/complete`. Storage metadata is checked and a retryable processing job is enqueued. Upload is not publication.

`GET /admin/catalogues`, `POST /admin/catalogues/:id/retry`, `POST /admin/catalogues/:id/publish`, `GET /admin/pages/:id/asset`.

`POST /admin/pages/:id/regions`: normalised `x,y,width,height`, product label and a verified `offerId` belonging to the same campaign.

## Administration and analytics

Admin collections: overview, retailers, campaigns, products, offers, catalogues, coupons, categories, locations, branches, users, content, advertisements, audit.

Dedicated mutations manage retailer status, products, coupons, category status/order/hierarchy, location status, user access, content and ad schedules. Administrative access changes revoke user sessions. Protected actions create audit records in the same transaction.

`POST /events` accepts a bounded event type and existing entityId. It records measured interactions without claiming unique visitors, redemption or sales. `GET /retailer/:id/analytics` returns that retailer’s last-30-day event counts only. Public event ingestion can be inflated and is not billing-grade attribution.
