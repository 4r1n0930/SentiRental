# Running the Backend & Using Swagger

## One-time setup (already done on this machine)

```bash
cd backend
npm install          # deps
npm run prisma:generate   # generate Prisma client into src/generated/prisma
npm run db:up         # start Postgres 16 in Docker (user senti / pass senti / db senti_rental)
npm run test:db:prepare   # apply prisma migrations
```

## Running the API

```bash
npm run start:dev    # watch mode, code reloads (recommended for development)
# or
npm run build && npm run start:prod   # production build
```

The API listens on `PORT` (3000 by default). If port 3000 is taken (e.g. VS Code
Electron grabs it), run on another port:

```bash
PORT=3005 npm run start:prod
```

Then point clients at `http://localhost:<PORT>`. For the mobile app, set its
`API_URL` to your machine's LAN IP (not `localhost`) when using a real device.

## Health checks

```bash
curl http://localhost:3000/health        | jq   # liveness  -> { status: "ok", ... }
curl http://localhost:3000/health/ready  | jq   # readiness + DB -> { status: "ok", checks: { database: { status: "up" } } }
```

`/health/ready` returning `"status": "ok"` and `database.status == "up"` means the
API is correctly talking to Postgres. Use `/health` as the Render health-check path.

## Smoke test (verifies the whole flow)

```bash
npm run smoke                    # against http://localhost:3000
API=http://localhost:3005 npm run smoke   # against another port
```

It exercises: health → register OWNER → verify → login → owner-only reads/writes →
refresh rotation (+ reuse rejection) → 401 without a token → role gate (TENANT
blocked from owner routes) → Swagger. It needs `DEV_EXPOSE_TOKENS` to return the
verification token, so the script flips that flag on, restarts the server, runs,
then restores it. **Never run it against production.**

## Swagger UI — how to use it

With the server running and `SWAGGER_ENABLED=true` (default):

- **Interactive UI:** http://localhost:3000/api/v1/docs
- **Raw OpenAPI spec:** http://localhost:3000/api/v1/docs-json

### Authenticating (bearer token)

Most endpoints need an access token. The UI has an **Authorize** button (top right):

1. First get a token by calling **POST `/api/v1/auth/login`** (it is `@Public`).
   Use the credentials of a verified account.
   You need a verified account first:
   - **POST `/api/v1/auth/register`** (`@Public`) with
     `{"email","password","firstName","lastName","role":"OWNER"}`.
     Set `role` to `OWNER` to create an owner.
   - With `DEV_EXPOSE_TOKENS=true`, the response includes `devVerificationToken`.
     Send it to **POST `/api/v1/auth/verify-email`** with `{"token": "..."}`.
     (With `DEV_EXPOSE_TOKENS=false`, click the verification link that was emailed
     to your inbox; `FRONTEND_URL=sentirental://` makes it open the mobile app.)
2. Copy the `accessToken` from the login response.
3. Click **Authorize**, paste the token, click Authorize.
4. Now you can call any protected route; the token is applied automatically.

### Exploring endpoints

Endpoints are grouped by tag: `auth`, `users`, `tenants`, `properties`, `rooms`,
`agreements`, `managers`/`manager-assignments`, `buildings`/`floors`, `amenities`,
`audit-logs`, `health`. Each shows the HTTP method, required role, and a body
schema.

- **Try it out** → fill the body → **Execute**. Responses show the status and JSON.
- The `Authorize` token applies to every protected call.
- Public routes (`auth`, `health`) work without a token.

### Useful first calls to understand the system

1. `POST /auth/register` (role OWNER) → `POST /auth/verify-email` → `POST /auth/login`.
2. `GET /users/me` — confirms your identity/role.
3. `POST /properties` — create your first property (OWNER only).
4. `POST /properties/{propertyId}/buildings` → `POST /buildings/{buildingId}/floors`
   → `POST /rooms` — build your property structure.
5. `GET /managers/permissions` — see the 11 available manager permissions.
6. `POST /properties/{propertyId}/managers` — assign a manager + permissions.
7. `POST /agreements` → `POST /agreements/{id}/activate` — the core rental flow.
8. `GET /audit-logs` — see what changed.

### Notes

- **Role gates:** OWNER-only routes return `403` ("Requires one of the roles: OWNER")
  for TENANT/PROPERTY_MANAGER tokens. Make sure your token belongs to an OWNER.
- **Token rotation:** `POST /auth/refresh` returns a NEW access + refresh token.
  Reusing the old refresh token revokes the whole session family (`401`).
- **Validation:** unknown/extra fields are rejected (`forbidNonWhitelisted`), and
  bodies are validated against the shown schema — so a `400` usually means a
  missing/extra/invalid field.
- **Rate limits:** login 10/min, refresh 30/min, forgot-password 5/min (see
  `src/config.ts` on the client side for the mirror).

## Environment variables (`.env`)

Loaded and validated at boot by `src/config/app-config.ts`; the process refuses to
start on invalid config and prints the exact problems.

**Gotchas to be aware of:**
- `JWT_SECRET` and `TOKEN_PEPPER` must each be ≥ 32 characters.
- **Never put `#` in `JWT_SECRET`/`TOKEN_PEPPER`** — dotenv treats `#` as the start
  of a comment and silently truncates the value, which will fail the 32-char check.
- `DEV_EXPOSE_TOKENS` must be `false` when `NODE_ENV=production` (the app refuses to
  boot otherwise — it returns raw auth tokens in responses).
- `MAIL_ENABLED` + `SMTP_*`: for Gmail use host `smtp.gmail.com`, port `465`,
  `SMTP_SECURE=true`, and a 16-char Google **App Password** (not your account
  password) with 2-Step Verification enabled. `MAIL_FROM` must be a real,
  authorised address.
- `FRONTEND_URL=sentirental://` makes verification/reset email links deep-link into
  the mobile app.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Boot fails "TOKEN_PEPPER must be at least 32 characters" | The value contains `#` or is too short. Use ≥ 32 chars, no `#`. |
| `EADDRINUSE 0.0.0.0:3000` | Something else owns port 3000 (e.g. VS Code). Run with `PORT=3005`. |
| `/health/ready` → `degraded`, `database: down` | Postgres not running or migrations not applied. `npm run db:up` then `npm run test:db:prepare`. |
| 401 on protected route | Token missing/expired → re-login. 403 → role gate (token isn't OWNER). |
| Login says "Verify your email" | Account is `PENDING_VERIFICATION`. Consume the token or the emailed link. |
| No `devVerificationToken` in register response | `DEV_EXPOSE_TOKENS=false`. Enable it (development only) to complete the flow in Swagger. |