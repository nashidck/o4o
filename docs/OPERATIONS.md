# Setup, deployment and recovery

## Environment

Use `.env.example` as the configuration inventory. Never commit actual `.env` files, SMTP credentials, storage credentials or bootstrap passwords. Web `NEXT_PUBLIC_*` values are public and compiled into the client; never put private provider keys there.

- Database: UTF-8 PostgreSQL; migration role can create `pg_trgm`. Use a restricted runtime role after migrations. The embedded development runtime is not a production database or a system service.
- Redis: private Redis/Valkey-compatible service with persistence, authentication and TLS when crossing hosts. `REDIS_URL` supports `rediss:`.
- Storage: private S3-compatible bucket. Give the API scoped signing permissions and workers read-original/write-derivative permissions. Block anonymous bucket access. CORS permits the configured `WEB_ORIGIN`, PUT/GET/HEAD and Content-Type. Signed PUTs expire after five minutes; finalisation verifies actual size and type; the worker validates bytes.
- SMTP: configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and SMTP_FROM. Use a provider-authorised sender. Recovery and email verification return explicit unavailability when delivery is unconfigured.
- Map: set NEXT_PUBLIC_MAP_STYLE_URL to a style URL from a provider whose licensing, attribution and billing fit the deployment. No provider is silently enabled. Geolocation requires the customer’s browser permission; branch-list discovery works without maps.
- Identity: email/password works. OTP and social identity providers are not enabled. There are no placeholder login buttons for them.

## Catalogue worker

The worker requires `pdfinfo`, `pdftoppm`, `pdftotext`, `tesseract` with `eng` and `mal` language data, `clamscan` with current signature files, and Sharp. It refuses to process files when scanning or required converters fail. Original PDF, JPEG, PNG and non-animated WebP catalogues are accepted; actual bytes and decoded image format are validated. PDF page limits are 1–100 and original file size is at most 50MB.

Run the worker in a dedicated non-root container with a read-only root filesystem, a bounded writable temporary volume, PID/memory/CPU limits and no unnecessary outbound network access. Its permitted connections are PostgreSQL, Redis and object storage. Refresh ClamAV signatures through a separate controlled update process; verify that the worker can read them before enabling uploads. The `worker` Docker target contains the converters/scanner, but signature provisioning and container hardening must be supplied by deployment configuration.

Jobs process one page at a time, preserve originals, generate high-resolution WebP pages and thumbnails, extract text and run OCR. Currency-bearing OCR lines become unverified bounding-box proposals, not trusted product-image detections or verified prices. Administrators inspect pages and link verified offers to confirmed regions. Model-based product-image segmentation and automatic canonical product matching are not implemented.

Failed jobs keep failure status and retry with backoff; administrators can retry failed jobs. Page upserts make retries resumable. Original-file checksums prevent reuse of a completed duplicate within a retailer. Quarantined/failed originals need a configured retention and deletion policy. Do not make them public.

## Deployment

1. Select hosting, database, Redis, storage and mail providers. Production infrastructure has not been provisioned.
2. Set secrets in the host secret manager. Set WEB_ORIGIN to the HTTPS public origin.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed` against the selected database.
4. Run `npm run build`. Start the API with `npm run start -w @o4o/api`, web with `npm run start -w @o4o/web`, and worker with `npm run start -w @o4o/worker`.
5. Use one public HTTPS origin, reverse proxy `/api/v1/*` to the API and all other requests to the web. Build with `NEXT_PUBLIC_API_URL=/api/v1`. Keep PostgreSQL, Redis and original storage private.
6. Provision an administrator through the bootstrap environment once; remove its bootstrap password afterwards.
7. Exercise registration, email verification, a business submission, branch restriction, moderation, a real uploaded catalogue and backup restore in staging before launch.

`Dockerfile` has build, runtime and worker targets. `compose.yaml` supplies local PostgreSQL and Redis. These container configurations have not been executed here because Docker is unavailable. Pin reviewed image digests, establish resource limits, run vulnerability scanning, and configure HTTPS and monitoring in the selected deployment system.

The current API rate limiter is process-local. Use a gateway or shared Redis-backed limiter before horizontal API replication. Analytics are raw bounded interaction events, not unique visitors, sales or billing-grade measurements. No billing provider is enabled.

## Monitoring

Readiness: `/api/v1/health` exercises PostgreSQL. Alert on API error rates/latency, database saturation, Redis connectivity, queue backlog, stalled/failed processing jobs, worker storage, scanner signature age, SMTP failures and backup age. Logs contain request IDs and error classes, never request passwords or session cookies. Retain audit records under an operator-approved policy and restrict their database permissions.

## Backups and restore

Use managed PostgreSQL point-in-time recovery where available. Also take encrypted `pg_dump -Fc` backups with retention in an independent account/bucket. Back up originals and approved derivatives with object versioning or replication; preserve their keys because database pages reference them. Redis is a delivery queue, not the authoritative content database; do not depend on a Redis snapshot as the only backup.

Restore procedure: stop writers/workers, restore PostgreSQL into an isolated UTF-8 database using `pg_restore`, restore the corresponding object-storage version set, apply any unapplied migrations, verify foreign keys and sampled asset references, restart services, then run the workflow tests against staging. Requeue recoverable unfinished flyer jobs only after validating their original objects. Test restoration on a schedule selected by the operator. No real backup/restore drill has been executed in this workspace.

## Privacy and content

Precise browser location is used only after explicit customer permission and is not persisted by the nearby endpoint. Customer preferences and personal lists are authenticated. Private invitations require verified email ownership. Customer account deletion is password-confirmed; business/administrative responsibilities must be transferred first. Audit actor references become null on deletion. Business content and audit retention require the operator’s documented legal basis and policies.

Publish operator-approved privacy, consent, reporting, retention and content-rights policies before public launch. Legal compliance has not been certified by this implementation. Retailer names, campaigns, images and prices must come from authorised sources; no integration or partnership is assumed.
