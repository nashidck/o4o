# O4O

Regional retail discovery for Kerala, built with Next.js, NestJS, PostgreSQL, Prisma, Redis/BullMQ and S3-compatible storage.

This repository is a working implementation in development. It is **not yet a production release of the entire master brief**. See `docs/STATUS.md` for verified functionality, untested integrations and remaining work. No retailer partnerships, real offers or prices are seeded.

## Local setup (Windows)

Requires Node.js 24 and npm. The workspace-local PostgreSQL runtime is a development convenience; it installs no Windows service and binds only to loopback. Keep its data outside synchronised folders for sustained use. The supplied workspace is inside OneDrive; production database data must never live there.

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:local
```

Keep the database terminal open. In another terminal:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. API: http://localhost:4000/api/v1. Route inventory: http://localhost:4000/api/docs.

On a machine with PostgreSQL already running, configure `DATABASE_URL` instead. Database encoding must be UTF-8. `pg_trgm` must be available to the migration role. `compose.yaml` supplies PostgreSQL and Redis for Docker-equipped machines; choose a development `POSTGRES_PASSWORD` and align `DATABASE_URL` with it.

## Administrator setup

There are no default admin credentials. Set `BOOTSTRAP_ADMIN_EMAIL` and a unique password of at least 14 characters in your untracked `.env`, then run `npm run db:seed`. This creates a super administrator only if that email does not already exist; it never resets an existing password or promotes an existing account. Remove the bootstrap password after provisioning. Sign in through the website, then open `/admin`.

## First business workflow

1. Register a customer account and open `/retailer`.
2. Submit a business registration. An administrator activates it in `/admin`.
3. Add branches and create a region/branch-scoped campaign draft.
4. An administrator creates exact product variants; the retailer adds prices to the draft.
5. Administrators verify prices. Retailers submit campaigns; moderators approve, then publish.
6. Choose the applicable location on the customer site to discover the campaign and verified offers.
7. Published title/description edits become reviewable revisions. Withdrawing a campaign immediately removes it from active discovery.

## Catalogue processing

Configure Redis, a private S3 bucket, scoped storage credentials and bucket CORS for the website origin. Configure the scanner and converter dependencies described in `docs/OPERATIONS.md`; then run `npm run worker`. Upload an actual PDF to a draft campaign in the retailer workspace. Administrators review processed pages and extracted text, approve the catalogue, and link verified offers to manually confirmed product regions.

OCR price regions are heuristic, unverified suggestions. They never automatically publish prices. Full processing integration has not been executed on this machine because Redis, object storage and the scanner/converters are not configured.

## Checks

```powershell
npm test
npm run build
# With a migrated/seeded database and API running:
npm run test:integration
```

Integration tests create explicitly labelled disposable records and remove those records afterward. Run against a development/test database only. CI configuration is included but has not been executed on a remote CI service.

See `docs/API.md`, `docs/OPERATIONS.md`, `docs/STATUS.md` and `.env.example` for API usage, deployment, recovery and configuration.
