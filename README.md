# Wazabishara Backend

Next.js + TypeScript + Prisma (PostgreSQL) API backend with Better Auth.

## Setup

```bash
npm install
cp .env.example .env   # fill in values
./scripts/dev-db.sh    # start local dev Postgres (port 5434)
npx prisma migrate dev # apply migrations
npm run dev            # http://localhost:3001
```

## Auth API

All auth routes are under `/api/auth/*` (handled by Better Auth).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-up/email` | Register with email + password |
| POST | `/api/auth/sign-in/email` | Login with email + password |
| POST | `/api/auth/phone-number/send-otp` | Send OTP to phone number |
| POST | `/api/auth/phone-number/verify` | Verify OTP (signs up user if new) |
| GET | `/api/auth/sign-in/social?provider=google` | Google OAuth login |
| GET | `/api/auth/get-session` | Current session (cookie or `Authorization: Bearer <token>`) |
| POST | `/api/auth/sign-out` | Sign out |
| GET | `/api/health` | Health check |

Mobile clients should use the `token` returned by sign-in/verify as a
`Authorization: Bearer <token>` header.

### Phone OTP

`sendOTP` currently logs the code to the server console (see
`lib/auth.ts`). Connect an SMS provider (Africa's Talking, Twilio,
Beem, ...) there for production.

### Google OAuth

Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`
(Google Cloud Console → Credentials). Redirect URI:
`http://localhost:3001/api/auth/callback/google`.

## API v1 (`/api/v1`)

All v1 endpoints return a consistent envelope:
`{ success, data, message, request_id }` or
`{ success: false, error: { code, message, fields? }, request_id }`.

Auth: `Authorization: Bearer <token>` (from `/api/auth/*` sign-in).
Tenant context: `X-Business-Id: <business_id>` header — always validated
server-side against the user's membership (never trusted).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/me` | Profile + all business memberships |
| GET | `/api/v1/business-types` | Active business types |
| GET | `/api/v1/businesses` | Businesses the user belongs to |
| POST | `/api/v1/businesses` | Create business (+ default roles + owner membership) |
| GET | `/api/v1/businesses/{id}` | Business detail (requires `X-Business-Id`) |
| GET | `/api/v1/packages` | Active packages (limits + modules) |
| GET | `/api/v1/businesses/{id}/plan` | Subscription, limits, enabled modules |
| POST | `/api/v1/businesses/{id}/plan` | Change package (`business.update` perm) |

**Business core** (all under `/api/v1/businesses/{id}/...`, all
tenant-scoped + permission-checked):

| Resource | Endpoints | Permission |
|----------|-----------|------------|
| Products | `GET/POST products`, `GET/PATCH/DELETE products/{id}` | `products.*` |
| Categories | `GET/POST categories` | `products.*` |
| Inventory | `GET inventory`, `POST inventory` (adjust) | `inventory.*` |
| Customers | `GET/POST customers`, `GET/PATCH/DELETE customers/{id}` | `customers.*` |
| Suppliers | `GET/POST suppliers`, `GET/PATCH/DELETE suppliers/{id}` | `suppliers.*` |
| Sales | `GET/POST sales`, `GET sales/{id}`, `POST sales/{id}/cancel` | `sales.*` |
| Expenses | `GET/POST expenses`, `GET/POST expense-categories` | `expenses.*` |
| Debts | `GET/POST debts`, `GET/POST debts/{id}/payments` | `debts.*` |
| Members | `GET/POST members`, `DELETE members/{membershipId}` | `staff.*` |
| Misc | `GET /api/v1/payment-methods`, `POST /api/v1/memberships/{id}/accept` | — |

Sales support `Idempotency-Key` header — safe retries without duplicates.
Credit sales auto-create a `customer_owes` debt. Every stock change writes
an `inventory_movement` row. Products/customers/suppliers are archived
(never hard-deleted) to preserve financial history.

**Plan engine** (`lib/plan.ts`): `getPlan`, `requireModule`,
`assertWithinLimit`, `canCreateBusiness`, `isFeatureEnabled`.
Module resolution: `isCore` ∪ package modules ∪ business overrides —
non-core modules require a usable subscription
(trialing / active / past_due). Limit value `null` = unlimited.

## Key files

- `lib/auth.ts` — Better Auth config (email/password, phone OTP, Google, bearer)
- `lib/prisma.ts` — PrismaClient singleton (pg driver adapter)
- `lib/context.ts` — session + tenant (X-Business-Id) resolution
- `lib/authz.ts` — permission checks (owner bypass + role permissions)
- `lib/permissions.ts` — permission registry + default role templates
- `lib/api/` — response envelope, error codes, zod validation
- `lib/services/` — business logic (thin controllers)
- `lib/audit.ts` — audit logging
- `prisma/schema.prisma` — full data model
- `prisma/seed.ts` — permissions + business types (`npm run db:seed`)
- `scripts/dev-db.sh` — local dev Postgres on port 5434
