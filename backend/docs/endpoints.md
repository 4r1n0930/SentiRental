# SentiRental API — Endpoints

Reference for every route exposed by the backend. Grouped by module in the same order as
[ARCHITECTURE.md](./ARCHITECTURE.md).

- **Base path:** `/api/v1` for all modules except `health`.
- **Exception:** `health` is excluded from the global prefix in `src/main.ts`, so its routes
  are served at `/health` and `/health/ready`.
- **Auth:** all routes require `Authorization: Bearer <access token>` unless noted as public.
- **Swagger:** interactive reference at `/api/v1/docs` when `SWAGGER_ENABLED=true`.
- **Total:** 69 endpoints across 11 modules.

Roles: `OWNER`, `PROPERTY_MANAGER`, `TENANT`. Paths marked **public** need no token.

---

## auth — 10 endpoints

_Source: `src/modules/auth/auth.controller.ts`_

| Method | Path                               | Summary                                                                   |
| ------ | ---------------------------------- | ------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register`            | Create an account and send a verification email (public)                  |
| POST   | `/api/v1/auth/login`               | Exchange credentials for an access/refresh token pair (public, 10/min)    |
| POST   | `/api/v1/auth/refresh`             | Rotate a refresh token (reuse revokes the whole family) (public, 30/min)  |
| POST   | `/api/v1/auth/logout`              | Revoke the current session or every session                               |
| POST   | `/api/v1/auth/forgot-password`     | Request a password reset link (always returns 200) (public, 5/min)        |
| POST   | `/api/v1/auth/reset-password`      | Consume a reset token and revoke all sessions (public, 10/min)            |
| POST   | `/api/v1/auth/verify-email`        | Activate an account with an email verification token (public)             |
| POST   | `/api/v1/auth/resend-verification` | Resend the verification email when still pending (public)                 |
| GET    | `/api/v1/auth/google/start`        | Begin Google sign-in and receive the authorization URL (public, 20/min)   |
| POST   | `/api/v1/auth/google/exchange`     | Complete Google sign-in with an authorization code (public, 20/min)       |

> `google/start` is a `GET` that creates server-side state (the `OAuthFlow` row) — a pure
> read by convention would be a cache risk here.
>
> Per-route `@Throttle` limits override the global 100 req/min bucket on these routes only.
> The rate shown is the binding limit for that path.

---
## users — 10 endpoints

_Source: `src/modules/users/users.controller.ts`_

| Method | Path                                   | Summary                                            |
| ------ | -------------------------------------- | -------------------------------------------------- |
| GET    | `/api/v1/users/me`                     | Profile of the signed-in user                      |
| PATCH  | `/api/v1/users/me`                     | Update own profile                                 |
| POST   | `/api/v1/users/me/email`               | Request an email change (re-verification required) |
| POST   | `/api/v1/users/me/password`            | Change password and revoke all sessions            |
| GET    | `/api/v1/users/me/sessions`            | List refresh sessions of the signed-in user        |
| DELETE | `/api/v1/users/me/sessions/:sessionId` | Revoke one refresh session                         |
| GET    | `/api/v1/users`                        | Search users (`OWNER` only)                        |
| GET    | `/api/v1/users/:id`                    | Fetch any user by id (`OWNER` only)                |
| PATCH  | `/api/v1/users/:id/status`             | Suspend, disable or activate a user (`OWNER` only) |
| PATCH  | `/api/v1/users/:id/role`               | Change a user role (`OWNER` only)                  |

> There is no `POST /api/v1/users`. Accounts are created by self-registration, and the first
> owner must be promoted manually through `PATCH /api/v1/users/:id/role`.

---

## tenants — 7 endpoints

_Source: `src/modules/tenants/tenants.controller.ts`_

| Method | Path                         | Summary                                                                |
| ------ | ---------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/v1/tenants/me`         | Tenant profile of the signed-in account                                |
| PATCH  | `/api/v1/tenants/me`         | Update own contact and address details (`TENANT` only)                 |
| GET    | `/api/v1/tenants`            | Search tenant profiles (`OWNER`, `PROPERTY_MANAGER`)                   |
| GET    | `/api/v1/tenants/:id`        | Fetch a tenant profile by id (`OWNER`, `PROPERTY_MANAGER`)             |
| PATCH  | `/api/v1/tenants/:id`        | Update a tenant profile as staff (`OWNER`, `PROPERTY_MANAGER`)         |
| PATCH  | `/api/v1/tenants/:id/status` | Move a tenant through APPLICANT/ACTIVE/NOTICE_PERIOD/MOVED_OUT (staff) |
| PATCH  | `/api/v1/tenants/:id/kyc`    | Record a KYC decision (staff)                                          |

> Lifecycle transitions are guarded: `NOTICE_PERIOD → MOVED_OUT` is refused while the tenant
> still holds an active agreement.

---

## properties — 6 endpoints

_Source: `src/modules/properties/properties.controller.ts`_

| Method | Path                               | Summary                                                  |
| ------ | ---------------------------------- | -------------------------------------------------------- |
| POST   | `/api/v1/properties`               | Create a property (`OWNER` only)                         |
| GET    | `/api/v1/properties`               | List accessible properties (`OWNER`, `PROPERTY_MANAGER`) |
| GET    | `/api/v1/properties/:id`           | Property detail with buildings and manager assignments   |
| PATCH  | `/api/v1/properties/:id`           | Update a property (`OWNER`, `PROPERTY_MANAGER`)          |
| DELETE | `/api/v1/properties/:id`           | Archive a property (`OWNER` only)                        |
| GET    | `/api/v1/properties/:id/dashboard` | Occupancy and agreement counters for a property          |

> `GET /api/v1/properties` and `:id` are scoped to what the caller may see: an owner sees their
> own properties, a manager only those with an active assignment.

---

## structures — 8 endpoints

_Source: `src/modules/structures/structures.controller.ts`_

| Method | Path                                       | Summary                                        |
| ------ | ------------------------------------------ | ---------------------------------------------- |
| GET    | `/api/v1/properties/:propertyId/buildings` | List buildings of a property with their floors |
| POST   | `/api/v1/properties/:propertyId/buildings` | Add a building to a property                   |
| GET    | `/api/v1/buildings/:id`                    | Building detail                                |
| PATCH  | `/api/v1/buildings/:id`                    | Rename a building                              |
| DELETE | `/api/v1/buildings/:id`                    | Archive a building                             |
| POST   | `/api/v1/buildings/:id/floors`             | Add a floor to a building                      |
| PATCH  | `/api/v1/floors/:id`                       | Update a floor                                 |
| DELETE | `/api/v1/floors/:id`                       | Archive a floor (returns 204)                  |

> All 8 routes require `OWNER` or `PROPERTY_MANAGER`; mutations additionally need the
> `MANAGE_ROOMS` property permission.

---

## rooms — 7 endpoints

_Source: `src/modules/rooms/rooms.controller.ts`_

| Method | Path                          | Summary                                               |
| ------ | ----------------------------- | ----------------------------------------------------- |
| POST   | `/api/v1/rooms`               | Add a room to a floor                                 |
| GET    | `/api/v1/rooms`               | List rooms across properties the actor can see        |
| GET    | `/api/v1/rooms/:id`           | Room detail with amenities and latest agreement       |
| PATCH  | `/api/v1/rooms/:id`           | Update room details                                   |
| PUT    | `/api/v1/rooms/:id/status`    | Set ACTIVE / MAINTENANCE / INACTIVE                   |
| PUT    | `/api/v1/rooms/:id/amenities` | Replace the amenity set of a room                     |
| DELETE | `/api/v1/rooms/:id`           | Archive a room (blocked while an agreement is active) |

> All routes require `OWNER` or `PROPERTY_MANAGER`. `:id/status` and `:id/amenities` are the
> only `PUT` routes in the API — everything else mutates with `PATCH`. `DELETE` is a soft
> archive, never a hard delete.

---

## amenities — 4 endpoints

_Source: `src/modules/amenities/amenities.controller.ts`_

| Method | Path                    | Summary                                        |
| ------ | ----------------------- | ---------------------------------------------- |
| GET    | `/api/v1/amenities`     | List the amenity catalog                       |
| POST   | `/api/v1/amenities`     | Create an amenity (`OWNER` only)               |
| PATCH  | `/api/v1/amenities/:id` | Update or deactivate an amenity (`OWNER` only) |
| GET    | `/api/v1/amenities/:id` | Fetch a single amenity                         |

> No `DELETE` route. Amenities are retired by flipping the active flag through `PATCH`.

---

## agreements — 7 endpoints

_Source: `src/modules/agreements/agreements.controller.ts`_

| Method | Path                               | Summary                                                   |
| ------ | ---------------------------------- | --------------------------------------------------------- |
| POST   | `/api/v1/agreements`               | Draft a rental agreement for a room                       |
| GET    | `/api/v1/agreements`               | List agreements visible to the actor                      |
| GET    | `/api/v1/agreements/:id`           | Agreement detail with room and tenants                    |
| PATCH  | `/api/v1/agreements/:id`           | Edit rent, deposit, notice period or end date             |
| POST   | `/api/v1/agreements/:id/activate`  | Activate a DRAFT agreement and mark tenants ACTIVE        |
| POST   | `/api/v1/agreements/:id/terminate` | Terminate an agreement and move tenants to NOTICE_PERIOD  |
| POST   | `/api/v1/agreements/:id/renew`     | Extend an agreement end date (optionally re-pricing rent) |

> The two read routes are not role-gated at the controller; the service resolves per-actor
> scope instead (a tenant sees only agreements they are party to, and staff only ones on
> properties they own or are assigned to). All five mutations require `OWNER` or
> `PROPERTY_MANAGER` plus the `MANAGE_AGREEMENTS` property permission. `renew` additionally
> accepts `MANAGE_RENT` **as an alternative** — it is satisfied by *either* permission, not
> both, via `@RequireAnyPropertyPermission`. Draft creation rejects overlapping date ranges
> for the same room and requires exactly one primary tenant.

---

## manager-access — 7 endpoints

_Source: `src/modules/manager-access/manager-access.controller.ts`_

| Method | Path                                           | Summary                                                            |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/properties/:propertyId/managers`      | List active manager assignments of a property                      |
| POST   | `/api/v1/properties/:propertyId/managers`      | Assign a property manager with explicit permissions (`OWNER` only) |
| POST   | `/api/v1/properties/:propertyId/managers/bulk` | Assign several managers in one call (`OWNER` only)                 |
| PATCH  | `/api/v1/manager-assignments/:id/permissions`  | Replace the permission set of an assignment (`OWNER` only)         |
| DELETE | `/api/v1/manager-assignments/:id`              | Revoke a manager assignment (`OWNER` only)                         |
| GET    | `/api/v1/managers/me`                          | Properties and permissions granted to the signed-in manager        |
| GET    | `/api/v1/managers/permissions`                 | Permission catalog available for assignment                        |

> Spread across three path families because the controller declares no base prefix. Five of the
> seven routes are `OWNER` only — only the two `managers/...` reads are open to a manager.

---

## audit — 1 endpoint

_Source: `src/modules/audit/audit-logs.controller.ts`_

| Method | Path                 | Summary                                                                     |
| ------ | -------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/v1/audit-logs` | Search the audit trail within the actor scope (`OWNER`, `PROPERTY_MANAGER`) |

> Filterable by action, resource type, resource id, actor and date range. Results are limited to
> what the caller may see, so a manager cannot audit across properties they do not manage.

---

## health — 2 endpoints

_Source: `src/modules/health/health.controller.ts`_

| Method | Path            | Summary                                                    |
| ------ | --------------- | ---------------------------------------------------------- |
| GET    | `/health`       | Liveness probe (public)                                    |
| GET    | `/health/ready` | Readiness probe including the database connection (public) |

> Served outside `/api/v1` (excluded from the global prefix). `/health/ready` runs
> `SELECT 1` and reports `ok` or `degraded` with the database latency.

---

## Requirement matrix

The gate order for every non-public route is **throttle → authenticate → role → property
permission**. `—` means the layer does not apply.

| Method | Path | Auth | Role | Property permission |
| ------ | ---- | ---- | ---- | ------------------- |
| POST | `/auth/register` | public | — | — |
| POST | `/auth/login` | public | — | — |
| POST | `/auth/refresh` | public | — | — |
| POST | `/auth/logout` | bearer | any | — |
| POST | `/auth/forgot-password` | public | — | — |
| POST | `/auth/reset-password` | public | — | — |
| POST | `/auth/verify-email` | public | — | — |
| POST | `/auth/resend-verification` | public | — | — |
| GET | `/auth/google/start` | public | — | — |
| POST | `/auth/google/exchange` | public | — | — |
| GET | `/users/me` | bearer | any | — |
| PATCH | `/users/me` | bearer | any | — |
| POST | `/users/me/email` | bearer | any | — |
| POST | `/users/me/password` | bearer | any | — |
| GET | `/users/me/sessions` | bearer | any | — |
| DELETE | `/users/me/sessions/:sessionId` | bearer | any | — |
| GET | `/users` | bearer | OWNER | — |
| GET | `/users/:id` | bearer | OWNER | — |
| PATCH | `/users/:id/status` | bearer | OWNER | — |
| PATCH | `/users/:id/role` | bearer | OWNER | — |
| GET | `/tenants/me` | bearer | any | — |
| PATCH | `/tenants/me` | bearer | TENANT | — |
| GET | `/tenants` | bearer | OWNER, MANAGER | scope |
| GET | `/tenants/:id` | bearer | OWNER, MANAGER | scope |
| PATCH | `/tenants/:id` | bearer | OWNER, MANAGER | scope |
| PATCH | `/tenants/:id/status` | bearer | OWNER, MANAGER | scope |
| PATCH | `/tenants/:id/kyc` | bearer | OWNER, MANAGER | scope |
| POST | `/properties` | bearer | OWNER | — |
| GET | `/properties` | bearer | OWNER, MANAGER | scope |
| GET | `/properties/:id` | bearer | OWNER, MANAGER | scope |
| PATCH | `/properties/:id` | bearer | OWNER, MANAGER | owns/assigned |
| DELETE | `/properties/:id` | bearer | OWNER | owns |
| GET | `/properties/:id/dashboard` | bearer | OWNER, MANAGER | scope |
| GET | `/properties/:propertyId/buildings` | bearer | OWNER, MANAGER | assigned |
| POST | `/properties/:propertyId/buildings` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| GET | `/buildings/:id` | bearer | OWNER, MANAGER | assigned |
| PATCH | `/buildings/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| DELETE | `/buildings/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| POST | `/buildings/:id/floors` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| PATCH | `/floors/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| DELETE | `/floors/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| POST | `/rooms` | bearer | OWNER, MANAGER | scope |
| GET | `/rooms` | bearer | OWNER, MANAGER | scope |
| GET | `/rooms/:id` | bearer | OWNER, MANAGER | scope |
| PATCH | `/rooms/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| PUT | `/rooms/:id/status` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| PUT | `/rooms/:id/amenities` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` **+** `MANAGE_INVENTORY` |
| DELETE | `/rooms/:id` | bearer | OWNER, MANAGER | `MANAGE_ROOMS` |
| GET | `/amenities` | bearer | OWNER, MANAGER | — |
| POST | `/amenities` | bearer | OWNER | — |
| PATCH | `/amenities/:id` | bearer | OWNER | — |
| GET | `/amenities/:id` | bearer | OWNER, MANAGER | — |
| POST | `/agreements` | bearer | OWNER, MANAGER | `MANAGE_AGREEMENTS` (room from `body.roomId`) |
| GET | `/agreements` | bearer | any | service scope |
| GET | `/agreements/:id` | bearer | any | service scope |
| PATCH | `/agreements/:id` | bearer | OWNER, MANAGER | `MANAGE_AGREEMENTS` |
| POST | `/agreements/:id/activate` | bearer | OWNER, MANAGER | `MANAGE_AGREEMENTS` |
| POST | `/agreements/:id/terminate` | bearer | OWNER, MANAGER | `MANAGE_AGREEMENTS` |
| POST | `/agreements/:id/renew` | bearer | OWNER, MANAGER | `MANAGE_AGREEMENTS` **or** `MANAGE_RENT` |
| GET | `/properties/:propertyId/managers` | bearer | OWNER, MANAGER | assigned |
| POST | `/properties/:propertyId/managers` | bearer | OWNER | owns |
| POST | `/properties/:propertyId/managers/bulk` | bearer | OWNER | owns |
| PATCH | `/manager-assignments/:id/permissions` | bearer | OWNER | owns |
| DELETE | `/manager-assignments/:id` | bearer | OWNER | owns |
| GET | `/managers/me` | bearer | MANAGER | — |
| GET | `/managers/permissions` | bearer | OWNER, MANAGER | — |
| GET | `/audit-logs` | bearer | OWNER, MANAGER | scope |
| GET | `/health` | public | — | — |
| GET | `/health/ready` | public | — | — |

Legend: **MANAGER** = `PROPERTY_MANAGER`. **scope** = the service filters the query to
properties the actor owns or holds an active assignment on. **assigned** = an active
assignment must exist on the resolved property.

## Cross-cutting requirements

Applied to every request, in this order:

1. **Rate limit** — 100 req/60 s per IP globally, overridden per route where noted above.
2. **Body** — 1 MB cap; `ValidationPipe` runs with `forbidNonWhitelisted`, so an unknown
   property is a 400 rather than being ignored.
3. **Authentication** — `Authorization: Bearer <token>` or an `access_token` cookie. The
   token must be of type `access`, the user must be `ACTIVE`, and the token's `ver` claim
   must equal the user's `authVersion`.
4. **Role** — `@Roles` is an allow-list; no decorator means no role check.
5. **Property permission** — resolves the owning property from the `:id` param, the declared
   body field, or `:propertyId`. Owners must own it; managers must hold an active assignment
   carrying the required permissions.

## Not yet implemented

No routes exist yet for the following; `ManagerPermission` already reserves their names.

- Payments / rent ledger
- Expenses
- Maintenance
- Documents
- Announcements
- Analytics (the `VIEW_ANALYTICS` permission has no consumer yet)

Also outstanding:

- `sweepLifecycle()` exists on the agreements service but is never scheduled, so
  `EXPIRING` / `EXPIRED` flags go stale until a caller is added.
- `GET /api/v1/auth/google/callback` does not exist, but `GOOGLE_CALLBACK_URL` defaults to
  it and Google redirects the browser there after sign-in. A client must currently capture
  the callback itself; for the Expo app, set `GOOGLE_CALLBACK_URL` to the app's scheme
  (`sentirental://auth/google/callback`) and register that same value in Google Cloud Console.
  A backend callback route remains the cleaner long-term fix.
- `redirectUri` on `POST /auth/google/exchange` is accepted and validated but no longer used
  as Google's `redirect_uri` — that is now always `GOOGLE_CALLBACK_URL`. The stored
  `OAuthFlow.redirectUri` remains available as the post-login destination.
- `DEV_EXPOSE_TOKENS=true` adds `devToken` to `forgot-password` and `resend-verification`, and
  `devVerificationToken` to `register`, so a mobile client can test those flows without a mail
  server. Setting it while `NODE_ENV=production` makes the API **refuse to boot** — the config
  schema rejects the combination rather than silently ignoring it.
