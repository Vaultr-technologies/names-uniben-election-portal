# NAMES UNIBEN Electoral Portal — Frontend v2

**Vaultr Technologies · React + Vite · Public homepage → authentication → verified dashboard → eligible ballot → review → server-confirmed receipt.**

This package updates the original NAMES UNIBEN frontend and retains both supplied university/association logos and the Vaultr copyright credit.

## Run locally

```bash
npm install
cp .env.example .env.local
# For a synthetic local UI walkthrough, set VITE_DEMO_MODE=true in .env.local
npm run dev
```

To build:

```bash
npm run build
```

## Two deliberately separate modes

### GitHub Pages approval / supervised UI demonstration

The supplied `.github/workflows/deploy.yml` explicitly builds with `VITE_DEMO_MODE=true`.

- Shows a permanent **DEMONSTRATION ONLY** banner.
- Four synthetic profiles (Marine 300L, Mechanical 400L, Mechatronics 200L, Marine 100L).
- Allows a full walkthrough including **department-specific VP candidate selection**.
- Uses a synthetic, in-memory ballot (cleared on reload); submits **no real votes** and does not contact a real voter register.
- All candidate names are clearly marked as demonstration data.

This is safe for committee approval and Monday's UI rehearsal, **not** for Tuesday's actual election. Do not put the voter register, credentials, or real votes in the GitHub Pages repository.

### AWS production UI

Build with:

```bash
VITE_DEMO_MODE=false VITE_API_BASE_URL=https://<your-api-host> npm run build
```

Windows PowerShell:

```powershell
$env:VITE_DEMO_MODE="false"
$env:VITE_API_BASE_URL="https://YOUR-API-HOST"
npm run build
```

The backend must be implemented and independently tested first. With `VITE_DEMO_MODE=false` and no API configured, the public landing page loads but voting is **disabled**. There is **no insecure client-side authentication fallback**. Vite embeds `VITE_*` environment values in public JavaScript, so never put secrets in them.

The GitHub Pages workflow deliberately stays in demo mode even after AWS production is ready. Use a distinct AWS Amplify production site/build configuration.

## Backend contract for Chinedu / AWS Lambda + API Gateway

JSON over HTTPS. Responses for authenticated endpoints must use short-lived `accessToken` bearer tokens verified by the backend. This frontend keeps the token **in memory only** (no localStorage, sessionStorage, or URL token). A page refresh requires a new login; this is intentional for the first version. API Gateway CORS must explicitly permit the production web origin and `Authorization` / `Content-Type` headers.

### Public API

`GET /election`
```json
{
  "id": "election-2026",
  "title": "NAMES UNIBEN Elections 2026",
  "status": "open",
  "startsAt": "2026-11-10T08:00:00+01:00",
  "endsAt": "2026-11-10T17:00:00+01:00"
}
```
`status`: `upcoming`, `open`, or `closed`. The **backend** must enforce election time boundaries; frontend state is only a presentation aid.

### 200–500 level institutional Google sign-in

- `GET /auth/google/start` begins backend-owned OAuth2/OIDC flow using validated state and PKCE as appropriate.
- Google callback handled **by the backend**, where Google issuer, signature, audience, expiry, `email_verified`, workspace `hd`, and stable Google `sub` must be verified.
- Independently map the verified university account to **one approved student ID**; never infer identity from first/last name or a freely typed matric number.
- Backend redirects to the allowlisted frontend URL with `?login_code=<short-lived-single-use-code>`. **Never redirect with an access token or student details in the URL.**
- `POST /auth/google/exchange` body `{ "code":"..." }` returns `{ "accessToken":"...", "voter": {...} }`. Expire and atomically consume the short-lived code, bind it to the initiating auth flow.

### 100 level verified email OTP

`POST /auth/email/request`
```json
{"identifier":"UB-EXAMPLE-001","identifierType":"registration"}
```
Response:
```json
{"challengeId":"opaque-id","deliveryHint":"Code sent to your approved email"}
```
The backend must use an **independently verified voter-to-email association**; it must NOT send to an arbitrary email entered during authentication. Implement short OTP expiration, retry limits, rate limiting, delivery access checks, generic errors to prevent account enumeration, and prevent takeover through an unverified signup form.

`POST /auth/email/verify`
```json
{"challengeId":"opaque-id","code":"123456"}
```
Returns `{ "accessToken":"...", "voter": {...} }` after server-side identity and eligibility checks. Avoid exposing OTP values in logs.

### Private voter info / ballot

`GET /voter/me`, bearer required.
```json
{"id":"internal-voter-id","fullName":"Approved Student","department":"Marine Engineering","level":300,"identifier":"ENG-EXAMPLE","hasVoted":false}
```

`GET /voter/ballot`, bearer required.
```json
{
 "election":{"id":"election-2026","title":"NAMES UNIBEN Elections 2026"},
 "voter":{"id":"internal-voter-id","department":"Marine Engineering"},
 "positions":[
  {"id":"president","title":"President","scope":"general","candidates":[{"id":"candidate-a","name":"Candidate A","department":"Marine Engineering"}]},
  {"id":"marine-vp","title":"Vice President — Marine Engineering","scope":"department","department":"Marine Engineering","candidates":[{"id":"candidate-b","name":"Candidate B","department":"Marine Engineering"}]}
 ]
}
```
**The server, not the browser, must determine departmental eligibility.** The server must also reject submitted candidate IDs not belonging to the authenticated student's permitted contests. All approved candidates and offices must come from ELECO's signed-off records, not synthetic fixtures.

### Ballot submission

`POST /vote`, bearer required.
```json
{
 "idempotencyKey":"random-uuid",
 "selections":[{"positionId":"president","candidateId":"candidate-a"},{"positionId":"marine-vp","candidateId":"candidate-b"}]
}
```
Successful response:
```json
{"status":"accepted","receiptId":"opaque-non-identifying-reference","submittedAt":"2026-11-10T10:00:00+01:00"}
```

Server requirements:
- Authenticate approved student, enforce election window, eligible positions, and one accepted ballot **atomically** (DynamoDB transaction/conditional write) including concurrent and replayed attempts.
- Protect ballot secrecy: avoid storing direct student-ID → selected-candidate records; review linkability through timestamps, request identifiers, audit records and logs.
- Treat idempotency keys correctly, returning an identical receipt for a replayed identical request, and rejecting changed payloads with the same key.
- Use independently retained election evidence and an independent reconciliation procedure; neither DynamoDB nor AWS alone proves that voters' selections were faithfully recorded.
- Don't log passwords, tokens, OTPs, or selection contents.

`GET /voter/vote-status`, bearer required:
```json
{"status":"accepted","receiptId":"opaque-reference"}
```
or `{ "status":"not_submitted" }`. Uncertain states require investigation rather than blindly retrying a ballot.

`POST /auth/logout`, bearer required, invalidates the session server-side.

### Important known gaps / launch blockers

This is **a production-oriented frontend, NOT a complete certified election system.** Before any real votes:
- Get written ELECO approval of the authentic student register, departmental affiliations, candidate list, opening/closing times, and credential issuance.
- Ensure 100-level identity-to-email mapping is independently trustworthy. Name + UB number + self-submitted email does not establish voter identity.
- Test Google Workspace access, authoritative institutional email mapping, session expiration and recovery procedures.
- Conduct a supervised full mock election and load test, assess duplicate/impersonation attacks, security failures, secrecy, network interruptions, reconciliation and incident response; use an independent reviewer.
- Do **not** claim end-to-end cryptographic verifiability. This frontend implements no such cryptography.
- Get a paper-voting or postponement contingency approved if the controls cannot be demonstrated before the scheduled election.

## Deployment

The existing GitHub Pages workflow should show the **demo** at:
`https://vaultr-technologies.github.io/names-uniben-election-portal/`

The AWS Amplify production build must set `VITE_DEMO_MODE=false`, `VITE_API_BASE_URL=<actual API URL>`, use build command `npm run build`, and publish `dist`.

**Vaultr Technologies Ltd.**
