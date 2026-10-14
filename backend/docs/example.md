# SentiRental API — Example Calls

Reference for all **69 endpoints**. Every request body below is taken from the
validation DTOs in `src/modules/**/dto/*.dto.ts`, so field names, required-ness
and formats match what the server actually accepts.

Responses are marked:

- **Real** — captured from a live server during a full owner lifecycle run.
- **Example** — representative shape, written from the DTO/response type.

---

## Table of contents

1. [Quickstart — get a token](#1-quickstart--get-a-token)
2. [Common reference](#2-common-reference)
3. [health (2)](#3-health)
4. [auth (10)](#4-auth)
5. [users (10)](#5-users)
6. [properties (6)](#6-properties)
7. [structures (8)](#7-structures-buildings--floors)
8. [rooms (7)](#8-rooms)
9. [amenities (4)](#9-amenities)
10. [tenants (7)](#10-tenants)
11. [agreements (7)](#11-agreements)
12. [manager-access (7)](#12-manager-access)
13. [audit (1)](#13-audit)
14. [Known issues](#14-known-issues)

---

## 1. Quickstart — get a token

The whole API is behind a bearer token except `auth` and `health`.

```bash
BASE=http://localhost:3000/api/v1     # note: health is NOT under /api/v1
```

### 1.1 Register an OWNER

`role` is optional and defaults to `TENANT`. **You must send `"role": "OWNER"` to
get an owner account** — the mobile app's register form does not do this yet.

```bash
curl -X POST "$BASE/auth/register" \
  -H 'content-type: application/json' \
  -d '{
    "email": "owner@example.com",
    "password": "Str0ng!Passw0rd",
    "firstName": "Arin",
    "lastName": "Gupta",
    "role": "OWNER"
  }'
```

**Real — 201**

```json
{
  "id": "14917a38-27ce-4afb-abea-d0f2a57e20ad",
  "email": "owner@example.com",
  "firstName": "Arin",
  "lastName": "Gupta",
  "phone": null,
  "role": "OWNER",
  "status": "PENDING_VERIFICATION",
  "emailVerified": false,
  "tenantId": null,
  "createdAt": "2026-10-12T08:27:15.342Z",
  "devVerificationToken": "WVT-CrAczwKzw28C…"
}
```

`devVerificationToken` is only present when the server runs with
`DEV_EXPOSE_TOKENS=true` (development only). In production, click the link in the
verification email instead.

### 1.2 Verify the email — otherwise login is refused

```bash
curl -X POST "$BASE/auth/verify-email" \
  -H 'content-type: application/json' \
  -d '{ "token": "<devVerificationToken>" }'
```

**Real — 200** `{ "message": "Email verified, your account is now active" }`

### 1.3 Log in

```bash
curl -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{ "email": "owner@example.com", "password": "Str0ng!Passw0rd" }'
```

**Real — 200** (token truncated)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNDkxN2EzOC…",
  "refreshToken": "LaxcQAEMhY1lJY-W6qT3_dhPJrF_dUjuqAaLBCd5rGg3f1…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresAt": "2026-11-11T08:27:20.284Z",
  "user": {
    "id": "14917a38-27ce-4afb-abea-d0f2a57e20ad",
    "email": "owner@example.com",
    "role": "OWNER",
    "status": "ACTIVE",
    "authVersion": 1,
    "tenantId": null
  }
}
```

### 1.4 Use the token

Every protected call needs one header:

```
authorization: Bearer eyJhbGciOiJIUzI1NiIs...
content-type: application/json      # only when sending a body
```

In Swagger UI, paste the `accessToken` into **Authorize** (top right) and it is
applied to every request for the session.

---

## 2. Common reference

### Headers

| Header | When |
| --- | --- |
| `authorization: Bearer <accessToken>` | every route except `auth/*` and `health/*` |
| `content-type: application/json` | any request with a body |
| `accept: application/json` | optional |

### Enums

| Enum | Values |
| --- | --- |
| `UserRole` | `OWNER`, `PROPERTY_MANAGER`, `TENANT` |
| `UserStatus` | `PENDING_VERIFICATION`, `PENDING_ACTIVATION`, `ACTIVE`, `SUSPENDED`, `DISABLED` |
| `PropertyType` | `APARTMENT`, `HOUSE`, `BUILDING`, `TOWNHOUSE`, `COMMERCIAL`, `OTHER` |
| `PropertyStatus` | `ACTIVE`, `ARCHIVED` |
| `RoomType` | `PRIVATE`, `SHARED`, `MASTER`, `DORMITORY`, `STUDIO`, `OTHER` |
| `RoomOperationalStatus` | `ACTIVE`, `MAINTENANCE`, `INACTIVE` |
| `TenantStatus` | `APPLICANT`, `ACTIVE`, `NOTICE_PERIOD`, `MOVED_OUT`, `ARCHIVED` |
| `KycStatus` | `NOT_SUBMITTED`, `PENDING`, `VERIFIED`, `REJECTED`, `EXPIRED` |
| `AgreementStatus` | `DRAFT`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `TERMINATED` |
| `ManagerPermission` | `MANAGE_ROOMS`, `MANAGE_TENANTS`, `MANAGE_AGREEMENTS`, `MANAGE_RENT`, `VIEW_PAYMENTS`, `MANAGE_MAINTENANCE`, `MANAGE_INVENTORY`, `MANAGE_EXPENSES`, `MANAGE_DOCUMENTS`, `CREATE_ANNOUNCEMENTS`, `VIEW_ANALYTICS` |

Only the first four `ManagerPermission` values are implemented today; the other
seven are reserved by the schema with no backend consumer.

### Pagination

Query params on list endpoints: `page` (≥1, default 1), `perPage` (1–100, default
20), `sortOrder` (`asc` | `desc`, default `desc`).

Most list endpoints return an envelope, but **not all of them** — the
`buildings` and `sessions` endpoints return a bare JSON array instead:

```json
{ "items": [ … ], "meta": { "page": 1, "perPage": 20, "total": 42, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false } }
```

### Errors

```json
{ "statusCode": 400, "error": "BAD_REQUEST", "message": "…" }
```

`message` is a string for single problems and an array for validation failures.

**Real — 400 (malformed email)**

```json
{ "statusCode": 400, "error": "BAD_REQUEST", "message": ["email must be an email"] }
```

**Real — 400 (unknown field)**

```json
{ "statusCode": 400, "error": "BAD_REQUEST", "message": ["property bogus should not exist"] }
```

> Unknown body fields are **rejected**, not ignored (`forbidNonWhitelisted`), so a
> typo is a 400 rather than a silently dropped value.

### Field formats

| Field type | Format | Example |
| --- | --- | --- |
| ids (`{id}`) | UUID | `c891a27f-dbc3-4c76-8e9e-06d6838465de` |
| `currency` | ISO-4217 | `INR`, `USD` |
| `countryCode` | ISO-3166-1 alpha-2 | `IN` |
| `timeZone` | IANA | `Asia/Kolkata` |
| dates | ISO-8601 date or datetime | `2026-11-01` |
| money | JSON number or numeric string (coerced) | `18000` — see [note](#money-is-coerced-from-strings) |

---

## 3. health

**These two are NOT under `/api/v1`** — they are excluded from the global prefix.

### GET /health — liveness (public)

No headers, no body.

**Real — 200**

```json
{
  "status": "ok",
  "service": "senti-rental-api",
  "environment": "development",
  "uptimeSeconds": 65,
  "timestamp": "2026-10-12T05:48:58.474Z"
}
```

### GET /health/ready — readiness + database (public)

**Real — 200**

```json
{ "status": "ok", "checks": { "database": { "status": "up", "latencyMs": 38 } } }
```

`status: "degraded"` means the server is up but Postgres is unreachable.

---

## 4. auth

### POST /auth/register (public)

```json
{
  "email": "owner@example.com",
  "password": "Str0ng!Passw0rd",
  "firstName": "Arin",
  "lastName": "Gupta",
  "phone": "+919812345678",
  "role": "OWNER"
}
```

- `password` — ≥10 chars, **must** have lower + upper + digit + special.
- `role` — optional, defaults to `TENANT`. A `TENANT` gets a linked `Tenant` row;
  other roles do not.
- Returns **201**. See [1.1](#11-register-an-owner) for a real response.

### POST /auth/login (public) — 10/min

```json
{ "email": "owner@example.com", "password": "Str0ng!Passw0rd" }
```

See [1.3](#13-log-in) for the real response. Fails with **403** (not 401) if the
account is `PENDING_VERIFICATION`, `PENDING_ACTIVATION`, `SUSPENDED` or `DISABLED`.

### POST /auth/refresh (public) — 30/min

```json
{ "refreshToken": "LaxcQAEMhY1lJY-W6qT3_dhPJrF_dUjuqAaLBCd5rGg3f1…" }
```

Returns a **new** access + refresh token pair.

> ⚠️ **Rotation is one-shot.** The refresh token you send is invalidated
> immediately. Sending it a second time is treated as a stolen token and revokes
> the entire session family:
>
> **Real — 401** `{"statusCode":401,"error":"UNAUTHORIZED","message":"Refresh token reuse detected, session revoked"}`

### POST /auth/logout

Authenticated. `refreshToken` is optional.

```json
{ "refreshToken": "LaxcQAEMhY1lJY-W6qT3_dhPJrF_dUjuqAaLBCd5rGg3f1…" }
```

Omit `refreshToken` to revoke **every** session for the user.

**Returns 204 No Content** with an empty body.

### POST /auth/verify-email (public)

```json
{ "token": "WVT-CrAczwKzw28C…" }
```

**Real — 200** `{ "message": "Email verified, your account is now active" }`

### POST /auth/resend-verification (public)

```json
{ "email": "owner@example.com" }
```

Always 200, never reveals whether the account exists.

**Real — 200** `{ "message": "If the account needs verification, a link has been sent" }`

### POST /auth/forgot-password (public) — 5/min

```json
{ "email": "owner@example.com" }
```

**Real — 200**

```json
{
  "message": "If the account exists, a reset link has been sent",
  "devToken": "CiwO6eMuKOI3VNZp7DiPGbVnfvhd5XnueO9y8A5fjmMGrxea4VXUyJ4Si9jZXIOj"
}
```

### POST /auth/reset-password (public) — 10/min

```json
{ "token": "CiwO6eMuKOI3VNZp7DiP…", "newPassword": "N3w!Str0ngPass" }
```

Revokes all sessions on success.

### GET /auth/google/start (public) — 20/min

Query: `redirectUri` (required).

```
GET /api/v1/auth/google/start?redirectUri=sentirental%3A%2F%2Fauth%2Fgoogle%2Fcallback
```

**Real — 200**

```json
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=1005115971149-….apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A5173&response_type=code&scope=openid+email+profile&state=jhU_LettFS7Xx…&code_challenge=eyFuFKsYq2…&code_challenge_method=S256"
}
```

Note the `redirect_uri` comes from the **`GOOGLE_CALLBACK_URL` env var**, not from
the `redirectUri` query param — the param is only validated and stored against the
flow. So `GOOGLE_CALLBACK_URL` must equal the redirect URI registered in Google
Cloud Console, and for the mobile app that must be `sentirental://auth/google/callback`.
Flows expire after 10 minutes.

### POST /auth/google/exchange (public) — 20/min

```json
{ "code": "4/0AeanS0c…", "state": "jhU_LettFS7Xx…" }
```

Returns the same shape as `login`. `state` must match the value from
`google/start`.

---

## 5. users

### GET /users/me

**Real — 200**

```json
{
  "id": "14917a38-27ce-4afb-abea-d0f2a57e20ad",
  "email": "owner@example.com",
  "firstName": "Arin",
  "lastName": "Gupta",
  "phone": null,
  "role": "OWNER",
  "status": "ACTIVE",
  "emailVerifiedAt": "2026-10-12T08:27:20.117Z",
  "lastLoginAt": "2026-10-12T08:27:20.278Z",
  "createdAt": "2026-10-12T08:27:15.342Z",
  "updatedAt": "2026-10-12T08:27:20.279Z",
  "tenant": null
}
```

### PATCH /users/me

```json
{ "firstName": "Arin", "lastName": "Gupta", "phone": "+919812345678" }
```

### POST /users/me/email

```json
{ "email": "new@example.com" }
```

> ⚠️ **`password` is NOT part of this body.** The DTO (`ChangeEmailDto`) only
> accepts `email`, and unknown fields are rejected — sending `password` returns
> **400** `["property password should not exist"]`.

The account drops to `PENDING_VERIFICATION` until the new address is confirmed,
and the confirmation link is emailed.

**Real — 200**

```json
{
  "id": "fcd84611-42f9-450c-ad73-0c32915e2a7e",
  "email": "new@example.com",
  "firstName": "Arin",
  "role": "OWNER",
  "status": "PENDING_VERIFICATION",
  "emailVerifiedAt": null
}
```

### POST /users/me/password

```json
{ "currentPassword": "Str0ng!Passw0rd", "newPassword": "N3w!Str0ngPass" }
```

Revokes **all** sessions, including the one making the request — so the caller
must log in again immediately.

### GET /users/me/sessions

Returns a **bare array** (not an envelope).

**Real — 200** (abridged)

```json
[
  {
    "id": "239f8dc4-bfc1-4b59-8e8e-cfb5989f79a1",
    "familyId": "79de57f7-0e94-44aa-aefe-f079af048833",
    "createdAt": "2026-10-12T08:51:48.221Z",
    "expiresAt": "2026-11-11T08:51:48.221Z",
    "usedAt": null,
    "revokedAt": null,
    "revocationReason": null,
    "ipAddress": "127.0.0.1",
    "userAgent": "curl/8.22.0",
    "active": true
  },
  {
    "id": "88d59641-e584-432a-8cb7-ba9183f6e593",
    "familyId": "638f3165-6097-4e24-8111-0e5d7dd87a29",
    "usedAt": "2026-10-12T08:27:32.163Z",
    "revokedAt": "2026-10-12T08:27:32.163Z",
    "revocationReason": "ROTATED",
    "active": false
  }
]
```

Entries sharing a `familyId` are rotations of one login; `ROTATED` marks a
superseded token.

### DELETE /users/me/sessions/{sessionId}

No body. Returns **204**.

### GET /users — OWNER only

Query: `search`, `role`, `status`, plus pagination.

```
GET /api/v1/users?page=1&perPage=20&role=PROPERTY_MANAGER&search=arya
```

**Real — 200**

```json
{
  "items": [ { "id": "…", "email": "…", "role": "OWNER", "status": "ACTIVE", … } ],
  "meta": { "page": 1, "perPage": 5, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

### GET /users/{id} — OWNER only

### PATCH /users/{id}/status — OWNER only

```json
{ "status": "SUSPENDED" }
```

Suspending signs the user out of every session.

### PATCH /users/{id}/role — OWNER only

```json
{ "role": "PROPERTY_MANAGER" }
```

This is how you promote your first manager — and, in a fresh database, how you
would bootstrap a second owner (there is no `POST /users`).

---

## 6. properties

### POST /properties — OWNER only

```json
{
  "name": "Sunrise Apartments",
  "code": "SUN-01",
  "type": "APARTMENT",
  "addressLine1": "12 MG Road",
  "addressLine2": "Tower B",
  "city": "Bengaluru",
  "state": "KA",
  "postalCode": "560001",
  "countryCode": "IN",
  "timeZone": "Asia/Kolkata",
  "currency": "INR"
}
```

Required: `name` (2–200), `code` (2–50), `type`, `addressLine1` (≤255), `city`,
`state`, `postalCode`. `code` is unique per owner.

**Real — 201**

```json
{
  "id": "c891a27f-dbc3-4c76-8e9e-06d6838465de",
  "ownerId": "14917a38-…",
  "createdById": "14917a38-…",
  "code": "SUN-01",
  "name": "Sunrise Apartments",
  "type": "APARTMENT",
  "status": "ACTIVE",
  "addressLine1": "12 MG Road",
  "city": "Bengaluru",
  "state": "KA",
  "postalCode": "560001",
  "countryCode": "IN",
  "timeZone": "Asia/Kolkata",
  "currency": "INR",
  "buildings": [],
  "managerAssignments": [],
  "owner": { "id": "14917a38-…", "firstName": "Arin", "lastName": "Gupta", "email": "owner@example.com" }
}
```

### GET /properties

Query: `search`, `status`, `type`, `city`, plus pagination. Scoped — owners see
their own, managers see assigned properties.

**Real — 200** `{ "items": [ { …property… } ], "meta": { "page": 1, "perPage": 20, "total": 1, … } }`

### GET /properties/{id}

**Real — 200** — same shape as create, now with populated `buildings[]` and
`managerAssignments[]`.

### PATCH /properties/{id}

```json
{ "name": "Sunrise Residences", "status": "ARCHIVED" }
```

### DELETE /properties/{id} — OWNER only

Soft-archives the property. No body, returns the property.

### GET /properties/{id}/dashboard

**Real — 200**

```json
{
  "propertyId": "c891a27f-dbc3-4c76-8e9e-06d6838465de",
  "roomCount": 1,
  "occupiedRoomCount": 1,
  "occupancyRate": 100,
  "agreementsByStatus": { "ACTIVE": 1 }
}
```

---

## 7. structures (buildings + floors)

### GET /properties/{propertyId}/buildings

Returns a **bare array**, each building embedding its floors.

**Real — 200**

```json
[
  {
    "id": "57d133f4-b6f3-4092-92f5-f74de4a9b666",
    "propertyId": "c891a27f-dbc3-4c76-8e9e-06d6838465de",
    "code": "BLK-A",
    "name": "Block A",
    "floors": [
      { "id": "9e1dc9da-a0fc-4644-b698-f5a11f5ee097", "code": "G", "name": "Ground", "level": 0, "_count": { "rooms": 1 } }
    ]
  }
]
```

### POST /properties/{propertyId}/buildings

```json
{ "name": "Block A", "code": "BLK-A" }
```

**Real — 201**

```json
{ "id": "57d133f4-b6f3-4092-92f5-f74de4a9b666", "propertyId": "c891a27f-…", "code": "BLK-A", "name": "Block A", "floors": [] }
```

### GET /buildings/{id}

**Real — 200** — building with its `floors[]`.

### PATCH /buildings/{id}

```json
{ "name": "Block A (renovated)" }
```

### DELETE /buildings/{id}

Soft-archive. No body.

### POST /buildings/{id}/floors

```json
{ "name": "Ground", "code": "G", "level": 0 }
```

- `code` is **required** (1–50 chars), `name` required (1–120), `level` optional (-10…n).

> ⚠️ The mobile app's `structuresApi.createFloor` wrapper sends only
> `{ name, level }` — it omits `code`, so the built-in "Add floor" button returns
> **400**.

**Real — 201** `{ "id": "9e1dc9da-a0fc-4644-b698-f5a11f5ee097", "code": "G", "name": "Ground", "level": 0 }`

### PATCH /floors/{id}

```json
{ "name": "First", "level": 1 }
```

### DELETE /floors/{id}

Soft-archive. Returns **204** with an empty body.

---

## 8. rooms

### GET /rooms

Query: `floorId`, `operationalStatus`, `type`, `search`, plus pagination.

> 🐛 **Currently returns 500** — see [Known issues](#14-known-issues).

### GET /rooms/{id}

Room detail including `amenities[]` and the latest agreement.

**Example**

```json
{
  "id": "fae0a6cf-969f-4039-9447-91d60167ec3a",
  "floorId": "9e1dc9da-…",
  "number": "101",
  "type": "PRIVATE",
  "capacity": 2,
  "baseRentAmount": "18000",
  "currency": "INR",
  "operationalStatus": "ACTIVE",
  "floor": { "id": "9e1dc9da-…", "code": "G", "name": "Ground", "building": { "id": "57d133f4-…", "name": "Block A", "propertyId": "c891a27f-…" } },
  "amenities": [],
  "agreements": []
}
```

Money fields come back as **strings** (`"18000"`) because they are stored as
numeric/decimal in Postgres.

### POST /rooms

```json
{
  "floorId": "9e1dc9da-a0fc-4644-b698-f5a11f5ee097",
  "number": "101",
  "type": "PRIVATE",
  "capacity": 2,
  "baseRentAmount": 18000,
  "currency": "INR",
  "amenityIds": []
}
```

`floorId` must be a UUID; `capacity` ≥1; `baseRentAmount` a number with ≤2 decimals.

**Real — 201**

```json
{
  "id": "fae0a6cf-969f-4039-9447-91d60167ec3a",
  "floorId": "9e1dc9da-…",
  "number": "101",
  "type": "PRIVATE",
  "capacity": 2,
  "baseRentAmount": "18000",
  "currency": "INR",
  "operationalStatus": "ACTIVE",
  "amenities": [],
  "agreements": []
}
```

### PATCH /rooms/{id}

```json
{ "number": "101A", "type": "MASTER", "capacity": 3, "baseRentAmount": 22000, "operationalStatus": "INACTIVE" }
```

### PUT /rooms/{id}/status

```json
{ "status": "MAINTENANCE" }
```

**Real — 200** — returns the room with `operationalStatus: "MAINTENANCE"`.

### PUT /rooms/{id}/amenities

```json
{ "amenityIds": ["38c7f96d-1758-491b-92fd-b04392b8d49f"] }
```

> ⚠️ **Replaces** the whole set. Send every amenity id the room should keep, not
> just additions. Removing an id detaches that amenity.
>
> Requires `MANAGE_ROOMS` **and** `MANAGE_INVENTORY` for a manager. Owners bypass.
>
> 🐛 **Currently returns 500** — see [Known issues](#14-known-issues).

### DELETE /rooms/{id}

Soft-archive; refused while an agreement is active.

---

## 9. amenities

### GET /amenities

Query: `category`, `isActive`, plus pagination.

**Real — 200**

```json
{
  "items": [ { "id": "38c7f96d-…", "code": "ac", "name": "Air Conditioning", "category": "COMFORT", "isActive": true, "_count": { "rooms": 1 } } ],
  "meta": { "page": 1, "perPage": 50, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

### GET /amenities/{id}

**Real — 200**

```json
{ "id": "38c7f96d-…", "code": "ac", "name": "Air Conditioning", "category": "COMFORT", "isActive": true, "_count": { "rooms": 1 } }
```

### POST /amenities — OWNER only

```json
{ "code": "AC", "name": "Air Conditioning", "category": "COMFORT" }
```

- `code` required (2–60) and stored **lower-cased**, `name` required (2–120).
- `code` is `@unique` **globally**, not per owner — amenities are a shared catalog.
  A duplicate returns **409** `Unique constraint failed: …`.

> ⚠️ The mobile app's `amenitiesApi.create` sends `{ name, category, description }`
> — it omits `code` and sends a `description` field the DTO does not accept, so it
> returns **400**.

### PATCH /amenities/{id} — OWNER only

```json
{ "name": "Air Conditioning", "category": "COMFORT", "isActive": false }
```

> There is **no DELETE**. Retire an amenity by setting `isActive: false`.

---

## 10. tenants

A `TENANT` role user always has exactly one linked `Tenant` profile; owners and
managers do not.

### GET /tenants/me

Requires the `TENANT` role.

**Real — 200**

```json
{
  "id": "74866bb7-b7e2-47dc-944e-06052ba14c73",
  "userId": "dbf6de56-4e49-472f-8799-2b30e0748590",
  "status": "ACTIVE",
  "phone": "+919812345678",
  "city": "Bengaluru",
  "countryCode": "IN",
  "kycStatus": "VERIFIED",
  "kycReference": "Aadhaar-XXXX-1234",
  "kycVerifiedAt": "2026-10-12T08:51:48.594Z",
  "emergencyContactName": "Asha Sharma",
  "emergencyContactPhone": "+919876543210",
  "user": { "id": "dbf6de56-…", "email": "tenant@example.com", "firstName": "Dev", "lastName": "Sharma", "status": "ACTIVE" }
}
```

### PATCH /tenants/me

```json
{ "phone": "+919812345678", "city": "Bengaluru", "addressLine1": "45 Nehru St", "postalCode": "560001" }
```

Accepts `phone`, `alternatePhone`, `addressLine1`, `addressLine2`, `city`, `state`,
`postalCode`, `countryCode`, `emergencyContactName`, `emergencyContactPhone`
(E.164), `emergencyContactRelation`.

### GET /tenants — OWNER / PROPERTY_MANAGER

Query: `search`, `status`, plus pagination. Managers are scoped to their
properties.

**Real — 200** `{ "items": [ { …tenant, with nested user… } ], "meta": { "page": 1, "perPage": 50, "total": 4, … } }`

### GET /tenants/{id} — OWNER / PROPERTY_MANAGER

**Real — 200** — single tenant with nested `user`.

### PATCH /tenants/{id} — OWNER / PROPERTY_MANAGER

```json
{ "city": "Bengaluru", "emergencyContactName": "Asha Sharma", "emergencyContactPhone": "+919876543210" }
```

**Real — 200** — the update is echoed back.

### PATCH /tenants/{id}/status — OWNER / PROPERTY_MANAGER

```json
{ "status": "ACTIVE" }
```

### PATCH /tenants/{id}/kyc — OWNER / PROPERTY_MANAGER

```json
{ "kycStatus": "VERIFIED", "kycReference": "Aadhaar-XXXX-1234" }
```

**Real — 200** — `kycVerifiedAt` is stamped automatically on `VERIFIED`.

---

## 11. agreements

### POST /agreements — needs `MANAGE_AGREEMENTS`

```json
{
  "roomId": "fae0a6cf-969f-4039-9447-91d60167ec3a",
  "startDate": "2026-11-01",
  "endDate": "2027-10-31",
  "monthlyRentAmount": 18000,
  "securityDepositAmount": 36000,
  "currency": "INR",
  "noticePeriodDays": 60,
  "tenants": [
    { "tenantId": "74866bb7-b7e2-47dc-944e-06052ba14c73", "isPrimary": true, "startDate": "2026-11-01", "endDate": "2027-10-31" }
  ]
}
```

Rules:

- **`tenants` must always be present** — send `"tenants": []` for a draft with no
  tenants yet. Omitting the key entirely returns **500**
  (`Cannot read properties of undefined (reading 'length')`). See
  [Known issues](#14-known-issues).
- If the array is non-empty it must contain **exactly one** entry with
  `"isPrimary": true`, otherwise **400** `Exactly one tenant must be flagged as primary`.
- The room must not already have an overlapping agreement → **409**.
- Always created as `DRAFT`.

**Real — 201** (abridged)

```json
{
  "id": "333ab689-578a-49a2-9b42-719721b525b0",
  "roomId": "fae0a6cf-…",
  "status": "DRAFT",
  "startDate": "2026-11-01T00:00:00.000Z",
  "endDate": "2027-10-31T00:00:00.000Z",
  "monthlyRentAmount": "18000",
  "securityDepositAmount": "36000",
  "currency": "INR",
  "noticePeriodDays": 60,
  "activatedAt": null,
  "room": { "id": "fae0a6cf-…", "number": "101", "floor": { "code": "G", "building": { "name": "Block A" } } },
  "tenants": [ { "tenantId": "74866bb7-…", "isPrimary": true, "tenant": { "status": "APPLICANT", "user": { "firstName": "Dev", "lastName": "Sharma", "email": "tenant@example.com" } } } ],
  "createdBy": { "id": "14917a38-…", "firstName": "Arin", "email": "owner@example.com" }
}
```

### GET /agreements

Query: `status`, `roomId`, `propertyId`, `tenantId`, `endingBefore`, plus pagination.

> 🐛 **Currently returns 500** for OWNER/PROPERTY_MANAGER — see [Known issues](#14-known-issues).

### GET /agreements/{id}

Returns the same shape as create.

### PATCH /agreements/{id}

```json
{ "monthlyRentAmount": 19500, "securityDepositAmount": 39000, "noticePeriodDays": 90, "endDate": "2028-10-31" }
```

### POST /agreements/{id}/activate

```json
{}
```

Body is optional (you may send `{"startDate": "2026-11-01"}`). Transitions
`DRAFT` → `ACTIVE` and flips the linked tenants to `ACTIVE`.

**Real — 200** — returns the agreement with `status: "ACTIVE"`, `activatedAt`
stamped, and tenants moved to `ACTIVE`.

### POST /agreements/{id}/terminate

```json
{ "reason": "Tenant relocating", "terminatedAt": "2027-01-15" }
```

`reason` required (3–500). Tenants move to `NOTICE_PERIOD`.

### POST /agreements/{id}/renew

```json
{ "endDate": "2028-10-31", "monthlyRentAmount": 19500, "securityDepositAmount": 39000 }
```

Accepts `MANAGE_AGREEMENTS` **or** `MANAGE_RENT`.

---

## 12. manager-access

### GET /managers/permissions

**Real — 200**

```json
{
  "permissions": [
    "MANAGE_ROOMS", "MANAGE_TENANTS", "MANAGE_AGREEMENTS", "MANAGE_RENT",
    "VIEW_PAYMENTS", "MANAGE_MAINTENANCE", "MANAGE_INVENTORY", "MANAGE_EXPENSES",
    "MANAGE_DOCUMENTS", "CREATE_ANNOUNCEMENTS", "VIEW_ANALYTICS"
  ]
}
```

### GET /managers/me

Requires the `PROPERTY_MANAGER` role. Returns the caller's property assignments
and resolved permissions.

```json
{ "properties": [ { "propertyId": "c891a27f-…", "permissions": ["MANAGE_ROOMS"] } ] }
```

### GET /properties/{propertyId}/managers

Returns a **bare array** of assignments.

**Real — 200** `[]` (empty when none assigned)

```json
[ { "id": "…", "managerUserId": "…", "managerEmail": "manager@example.com", "permissions": ["MANAGE_ROOMS"], "startDate": "…", "endDate": null, "revokedAt": null } ]
```

### POST /properties/{propertyId}/managers — OWNER only

```json
{
  "managerUserId": "37a03f7a-f699-4b2b-a32f-d498e7f50017",
  "permissions": ["MANAGE_ROOMS", "MANAGE_TENANTS", "MANAGE_AGREEMENTS"],
  "startDate": "2026-01-01",
  "endDate": null
}
```

`managerUserId` must be a UUID and the target user must hold the
`PROPERTY_MANAGER` role — promote them first with
[`PATCH /users/{id}/role`](#patch-usersidrole--owner-only). Max 20 permissions.
An assignment is only visible to the manager once `startDate` has arrived and
`endDate` has not passed.

### POST /properties/{propertyId}/managers/bulk — OWNER only

```json
{
  "assignments": [
    { "managerUserId": "37a03f7a-…", "permissions": ["MANAGE_ROOMS"], "startDate": "2026-01-01" },
    { "managerUserId": "1cd4e9a7-…", "permissions": ["MANAGE_TENANTS"], "startDate": "2026-01-01" }
  ]
}
```

Max 50 entries, processed serially.

### PATCH /manager-assignments/{id}/permissions — OWNER only

```json
{ "permissions": ["MANAGE_ROOMS", "MANAGE_TENANTS", "MANAGE_AGREEMENTS", "MANAGE_RENT"] }
```

> ⚠️ **Replaces the entire set.** Send every permission the manager should keep.
> Sending a shorter list silently revokes the omitted ones.

### DELETE /manager-assignments/{id} — OWNER only

Revokes an assignment. No body.

---

## 13. audit

### GET /audit-logs — OWNER / PROPERTY_MANAGER

Query: `action`, `resourceType`, `resourceId`, `actorUserId`, `from`, `to`, plus pagination.

**Real — 200** (abridged)

```json
{
  "items": [
    {
      "id": "14287610-…",
      "actorUserId": "14917a38-…",
      "action": "agreement.activated",
      "resourceType": "rental_agreement",
      "resourceId": "333ab689-…",
      "metadata": {},
      "occurredAt": "2026-10-12T08:27:31.917Z",
      "actor": { "email": "owner@example.com", "firstName": "Arin", "lastName": "Gupta" }
    },
    {
      "action": "agreement.created",
      "resourceType": "rental_agreement",
      "metadata": {
        "roomId": "fae0a6cf-…", "startDate": "2026-11-01", "endDate": "2027-10-31",
        "monthlyRentAmount": 18000, "securityDepositAmount": 36000,
        "currency": "INR", "noticePeriodDays": 60,
        "tenants": [ { "tenantId": "74866bb7-…", "isPrimary": true, "startDate": "2026-11-01", "endDate": "2027-10-31" } ]
      }
    }
  ],
  "meta": { "page": 1, "perPage": 10, "total": 5, … }
}
```

Common `resourceType` values: `rental_agreement`, `room`, `property`, `tenant`,
`user`. Managers only see entries within their assigned properties.

---

## Money is coerced from strings

The global `ValidationPipe` runs with `transform: true` and
`enableImplicitConversion: true`, so numeric fields accept `"1500"` as well as
`1500` — despite `@IsNumber()` rejecting strings on its own.

```bash
# both succeed — real, verified
curl -X POST $BASE/rooms ... -d '{ ..., "baseRentAmount": 1500}'
curl -X POST $BASE/rooms ... -d '{ ..., "baseRentAmount": "1500"}'
```

Responses always serialise money as a **string** (`"1500"`) because the columns
are numeric/decimal. Clients must parse before doing arithmetic.

---

## 14. Known issues

Found while producing this document by executing every documented request body
against a live server. All of these are backend bugs, not usage errors.

### 🐛 `POST /api/v1/agreements` → 500 when `tenants` is omitted

`agreements.service.ts` reads `dto.tenants.length` unconditionally:

```
TypeError: Cannot read properties of undefined (reading 'length')
```

Omitting `tenants` → **500**. Sending `"tenants": []` works correctly (201).
Either mark the field `@IsOptional()` with a default, or guard the length check.

### 🐛 `GET /api/v1/agreements` → 500 for OWNER and PROPERTY_MANAGER

`agreements.service.ts` (~line 165) nests the property scope directly under
`building`:

```ts
building: { is: asNestedWhere<Prisma.BuildingWhereInput>(propertyScope) }
```

`scopePropertiesForActor` returns a **`PropertyWhereInput`** such as
`{ ownerId: … }`, but the `Building` model has no `ownerId` column — ownership
lives on `Property`. Prisma rejects the unknown argument:

```
PrismaClientValidationError: Unknown argument `ownerId`.
```

It needs one more level of nesting:

```ts
building: { is: { property: { is: propertyScope } } }
```

This breaks the main Agreements screen for every non-tenant.

### 🐛 `GET /api/v1/rooms` → 500 (same root cause)

`rooms.service.ts:82` builds the same invalid nesting for `room.count()`. Same
one-line fix.

### 🐛 `PUT /api/v1/rooms/{id}/amenities` → 500

Returns `{"statusCode":500,...,"message":"Database error"}`. The call uses
`roomAmenity.createMany({ …, skipDuplicates: true })`; worth checking against the
`room_amenities` schema for a missing/renamed required column.

### Mobile app wrappers that do not match the DTOs

| Wrapper | Problem | Result |
| --- | --- | --- |
| `structuresApi.createFloor` | omits required `code` | 400 |
| `amenitiesApi.create` | omits required `code`, sends unsupported `description` | 400 |

### Google OAuth `redirect_uri`

`GET /auth/google/start?redirectUri=…` ignores the query param when building the
Google URL — it always uses the `GOOGLE_CALLBACK_URL` env var. The param is only
recorded on the flow for later validation. That value must match the redirect URI
registered in Google Cloud Console. For the mobile app it must be
`sentirental://auth/google/callback`.

---

## Appendix — full endpoint index (69)

| # | Method | Path | Module |
| --- | --- | --- | --- |
| 1 | GET | `/health` | health |
| 2 | GET | `/health/ready` | health |
| 3 | POST | `/auth/register` | auth |
| 4 | POST | `/auth/login` | auth |
| 5 | POST | `/auth/refresh` | auth |
| 6 | POST | `/auth/logout` | auth |
| 7 | POST | `/auth/verify-email` | auth |
| 8 | POST | `/auth/resend-verification` | auth |
| 9 | POST | `/auth/forgot-password` | auth |
| 10 | POST | `/auth/reset-password` | auth |
| 11 | GET | `/auth/google/start` | auth |
| 12 | POST | `/auth/google/exchange` | auth |
| 13 | GET | `/users/me` | users |
| 14 | PATCH | `/users/me` | users |
| 15 | POST | `/users/me/email` | users |
| 16 | POST | `/users/me/password` | users |
| 17 | GET | `/users/me/sessions` | users |
| 18 | DELETE | `/users/me/sessions/{sessionId}` | users |
| 19 | GET | `/users` | users |
| 20 | GET | `/users/{id}` | users |
| 21 | PATCH | `/users/{id}/status` | users |
| 22 | PATCH | `/users/{id}/role` | users |
| 23 | POST | `/properties` | properties |
| 24 | GET | `/properties` | properties |
| 25 | GET | `/properties/{id}` | properties |
| 26 | PATCH | `/properties/{id}` | properties |
| 27 | DELETE | `/properties/{id}` | properties |
| 28 | GET | `/properties/{id}/dashboard` | properties |
| 29 | GET | `/properties/{propertyId}/buildings` | structures |
| 30 | POST | `/properties/{propertyId}/buildings` | structures |
| 31 | GET | `/buildings/{id}` | structures |
| 32 | PATCH | `/buildings/{id}` | structures |
| 33 | DELETE | `/buildings/{id}` | structures |
| 34 | POST | `/buildings/{id}/floors` | structures |
| 35 | PATCH | `/floors/{id}` | structures |
| 36 | DELETE | `/floors/{id}` | structures |
| 37 | GET | `/rooms` | rooms |
| 38 | GET | `/rooms/{id}` | rooms |
| 39 | POST | `/rooms` | rooms |
| 40 | PATCH | `/rooms/{id}` | rooms |
| 41 | PUT | `/rooms/{id}/status` | rooms |
| 42 | PUT | `/rooms/{id}/amenities` | rooms |
| 43 | DELETE | `/rooms/{id}` | rooms |
| 44 | GET | `/amenities` | amenities |
| 45 | GET | `/amenities/{id}` | amenities |
| 46 | POST | `/amenities` | amenities |
| 47 | PATCH | `/amenities/{id}` | amenities |
| 48 | GET | `/tenants/me` | tenants |
| 49 | PATCH | `/tenants/me` | tenants |
| 50 | GET | `/tenants` | tenants |
| 51 | GET | `/tenants/{id}` | tenants |
| 52 | PATCH | `/tenants/{id}` | tenants |
| 53 | PATCH | `/tenants/{id}/status` | tenants |
| 54 | PATCH | `/tenants/{id}/kyc` | tenants |
| 55 | POST | `/agreements` | agreements |
| 56 | GET | `/agreements` | agreements |
| 57 | GET | `/agreements/{id}` | agreements |
| 58 | PATCH | `/agreements/{id}` | agreements |
| 59 | POST | `/agreements/{id}/activate` | agreements |
| 60 | POST | `/agreements/{id}/terminate` | agreements |
| 61 | POST | `/agreements/{id}/renew` | agreements |
| 62 | GET | `/properties/{propertyId}/managers` | manager-access |
| 63 | POST | `/properties/{propertyId}/managers` | manager-access |
| 64 | POST | `/properties/{propertyId}/managers/bulk` | manager-access |
| 65 | PATCH | `/manager-assignments/{id}/permissions` | manager-access |
| 66 | DELETE | `/manager-assignments/{id}` | manager-access |
| 67 | GET | `/managers/me` | manager-access |
| 68 | GET | `/managers/permissions` | manager-access |
| 69 | GET | `/audit-logs` | audit |