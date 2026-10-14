# SentiRental API — Architecture

NestJS 12 + Prisma 7 (PostgreSQL) backend for the SentiRental rental domain:
owners onboard properties, property managers run day-to-day operations, tenants
live in agreements. The API is a mobile-first REST service under `/api/v1`.

## Directory layout

```
backend/
├── prisma/
│   ├── schema.prisma              # 16 models, 12 enums, snake_case table maps
│   └── migrations/                # SQL migrations (deploy with `prisma migrate deploy`)
├── src/
│   ├── main.ts                    # bootstrap: helmet, CORS, pipes, prefix, Swagger
│   ├── app.module.ts              # composition root + global guard/interceptor order
│   ├── config/
│   │   ├── app-config.ts          # zod-validated env → typed AppConfig + APP_CONFIG token
│   │   ├── config.module.ts       # @Global provider of APP_CONFIG
│   │   └── configuration.ts       # shape handed to ConfigService
│   ├── infrastructure/
│   │   ├── prisma/                # PrismaService (pg driver adapter) + @Global module
│   │   └── mail/                  # nodemailer transport, verification/reset/assignment mail
│   ├── common/
│   │   ├── decorators/            # @Public @CurrentUser @Roles @Audited
│   │   │                          # @RequirePropertyPermissions @PropertyScopedBy
│   │   ├── guards/                # JWT auth, role check, property-permission check
│   │   ├── interceptors/          # request context (AsyncLocalStorage), audit writer
│   │   ├── filters/               # exception → HTTP mapping incl. Prisma error codes
│   │   ├── middleware/            # request-id / IP / user-agent context bootstrap
│   │   ├── services/              # audit writer, property scope + access resolution
│   │   ├── dto/                   # pagination query DTO and helpers
│   │   ├── utils/                 # crypto (argon2, hashing, PKCE), money, pagination
│   │   ├── types/                 # AuthenticatedUser, access-token payload
│   │   └── context/               # AsyncLocalStorage request context
│   ├── modules/                   # one folder per bounded context
│   │   ├── auth/                  # register, login, refresh, verify, reset, Google OAuth
│   │   ├── users/                 # profile, email/password change, sessions, admin
│   │   ├── tenants/               # tenant profile, lifecycle status, KYC
│   │   ├── properties/            # property CRUD, archive, occupancy dashboard
│   │   ├── structures/            # buildings + floors
│   │   ├── rooms/                 # rooms, operational status, amenity assignment
│   │   ├── amenities/             # amenity catalog
│   │   ├── agreements/            # draft → activate → renew → terminate lifecycle
│   │   ├── manager-access/        # manager assignments and their permissions
│   │   ├── audit/                 # audit trail search (scoped)
│   │   └── health/                # liveness + readiness probes
│   └── generated/prisma/          # Prisma client output (never hand-edited)
└── test/                          # jest-e2e + integration harness
```

Each module folder is self-contained: `*.controller.ts` (HTTP + Swagger + guards),
`*.service.ts` (business rules, Prisma access), `dto/` (class-validated inputs),
`*.module.ts` (wiring). No cross-module imports of services except through
exports, and never across module internals.

## Module capabilities

| Module | Capabilities |
| --- | --- |
| **auth** | Register with email verification, credential login (argon2id), access/refresh issuance, refresh rotation with family reuse detection, logout (one or all sessions), forgot/reset password, Google sign-in with PKCE + state, resend verification |
| **users** | Read/update own profile, email change with re-verification, password change revoking all sessions, session listing and per-session revoke, owner-only user search, status and role administration |
| **tenants** | Self-service contact/address/emergency profile, staff-side profile edits, lifecycle transitions (`APPLICANT → ACTIVE → NOTICE_PERIOD → MOVED_OUT → ARCHIVED`) with active-agreement guard, KYC state recording, tenant search |
| **properties** | Create (owner), list scoped to owner/manager assignments, detail with buildings and manager roster, update, archive, occupancy + agreement dashboard |
| **structures** | Buildings per property with nested floors, floor levels, archive operations |
| **rooms** | Room creation on a floor, scoped search, detail with amenities and latest agreement, updates, operational status (`ACTIVE/MAINTENANCE/INACTIVE`) blocked while an agreement is live, archival, amenity set replacement |
| **amenities** | Catalog CRUD with categories and active flag, usage counts |
| **agreements** | Draft creation with overlap detection and exactly-one-primary validation, list scoped per role, update, activate (conflicts checked, tenants become `ACTIVE`), terminate (tenants move to `NOTICE_PERIOD`), renew with re-pricing, `sweepLifecycle()` to flag `EXPIRING` and close `EXPIRED` |
| **manager-access** | Assign a manager to a property with an explicit permission set, bulk assign, permission replacement, revoke, "my access" lookup, permission catalog |
| **audit** | Paginated audit trail filtered by action/resource/actor/date, scoped to what the actor may see |
| **health** | `GET /health` liveness, `GET /health/ready` readiness with database round-trip |

## Request pipeline

```
RequestContextMiddleware      # allocates request id, seeds AsyncLocalStorage
  -> ThrottlerGuard           # global rate limit
  -> JwtAuthGuard             # verifies JWT, loads user, enforces status + authVersion
  -> RolesGuard               # @Roles(UserRole...)
  -> PropertyPermissionsGuard # @RequirePropertyPermissions(...) per property
  -> ValidationPipe           # whitelist + forbidUnknown + implicit conversion
  -> Controller -> Service -> PrismaService
  -> AuditInterceptor         # writes audit_logs for @Audited mutations
  -> AllExceptionsFilter      # maps HttpException + Prisma codes to HTTP responses
```

Guards are registered globally in `app.module.ts` in that order; the JWT guard must
run first because the other two read `request.user`. Endpoints opt out with
`@Public()`.

## Authorization model

Two layers:

1. **Role layer** — `OWNER`, `PROPERTY_MANAGER`, `TENANT` via `@Roles(...)`.
2. **Property permission layer** — a manager may act on a property only through an
   active `PropertyManagerAssignment` that carries the required `ManagerPermission`
   (`MANAGE_ROOMS`, `MANAGE_TENANTS`, `MANAGE_AGREEMENTS`, `MANAGE_RENT`,
   `VIEW_PAYMENTS`, `MANAGE_MAINTENANCE`, `MANAGE_INVENTORY`, `MANAGE_EXPENSES`,
   `MANAGE_DOCUMENTS`, `CREATE_ANNOUNCEMENTS`, `VIEW_ANALYTICS`).

The property is resolved from `:propertyId`, from `body.propertyId`, or by walking
up the hierarchy declared with `@PropertyScopedBy('room' | 'floor' | 'building' |
'agreement')`. `scopePropertiesForActor()` applies the same rule to list queries,
so a manager can never widen a query beyond their assignments.

## Authentication model

- Access token: HS256 JWT, `sub`/`role`/`ver`/`typ`, issuer + audience validated,
  short TTL (`JWT_EXPIRES_IN`, default 15m).
- Refresh token: 48 random bytes, base64url, stored only as
  `sha256(pepper + token)` with `familyId` and `parentSessionId`.
- Rotation: every refresh issues a new session and marks the old one used; replaying
  a consumed token revokes the entire family (`REFRESH_TOKEN_REUSE`).
- `authVersion` on the user invalidates every outstanding access token on password
  change, email change, suspension or disable.
- Verification and reset tokens are single-use, hashed at rest, and expire (24h/60m).
- Google sign-in issues a single-use `OAuthFlow` row holding the state hash and the
  PKCE verifier; redirect URIs are allow-listed against `CORS_ORIGINS`.

## Data model

`User` is the identity root (`AuthIdentity`, `RefreshSession`, verification/reset
tokens, `OAuthFlow`). A user with the `TENANT` role owns exactly one `Tenant`
profile. `Property → Building → Floor → Room` is the physical hierarchy;
`Room ↔ RentalAgreement ↔ AgreementTenant ↔ Tenant` is the contractual side, and
`Room ↔ RoomAmenity ↔ Amenity` is inventory. `PropertyManagerAssignment` plus
`PropertyManagerPermission` carry scoped delegation, and `AuditLog` records every
`@Audited` mutation with actor, request id, IP, user agent and redacted body.

## Configuration

All environment variables are validated by zod in `src/config/app-config.ts`; a bad
or missing value fails fast at startup with a readable error. `JWT_SECRET` and
`TOKEN_PEPPER` must be at least 32 characters. See `.env.example` for the full list
(DATABASE_URL, JWT_*, GOOGLE_*, MAIL_*/SMTP_*, RATE_LIMIT_*, ARGON2_*).

## Commands

```bash
cp .env.example .env
npm run prisma:generate        # regenerate client into src/generated/prisma
npm run prisma:migrate:dev     # apply migrations in development
npm run start:dev              # watch mode on $PORT
npm run verify                 # format:check + lint + typecheck + test + build
npm run prisma:studio          # browse data
```

Swagger is served at `/api/v1/docs` when `SWAGGER_ENABLED=true`.

## Testing

- Unit tests live next to the code (`*.spec.ts`) and run with `npm test`.
- `npm run test:integration` and `npm run test:e2e` require a reachable PostgreSQL
  instance (`test:db:prepare` applies migrations first).
- Jest runs with `NODE_OPTIONS=--experimental-vm-modules` because NestJS 12 ships
  ESM-only packages.

## Current gaps

- No rent ledger, payments, expenses, maintenance, documents or announcements
  modules yet; `ManagerPermission` already reserves their names.
- `sweepLifecycle()` is exposed on the service but not scheduled — add a cron or
  queue worker to call it.
- `POST /users` is not available: accounts are created by self-registration or the
  first owner must be promoted manually via `PATCH /users/:id/role`.
- No rate-limit tuning per route (login/refresh share the global limit).
