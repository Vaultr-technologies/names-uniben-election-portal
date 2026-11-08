# NAMES UNIBEN — Local Election Backend Fallback

**DEVELOPMENT / SIMULATION ONLY — NOT READY FOR A REAL ELECTION**

A **working local API** that exercises eligibility, department-specific VP choices, one accepted ballot per demo voter, and a reproducible recount. It does **not** connect to Google OAuth, Amazon SES, or AWS. It uses a fake login endpoint solely to simulate a voter session. It has not been integrated against the current React frontend (its latest contract is not available here).

The local API is intentionally bound only to `127.0.0.1` and must never be exposed via Amplify, ngrok, a VPS, Lambda or API Gateway. Node `22.13+` is required for built-in SQLite. **Do not put real student data into the fixtures.**

## 1. Run locally (Windows PowerShell)

Install Node.js 22 or later. Extract this ZIP into its own folder (NOT over the existing frontend repo).

```powershell
cd names-election-local-fallback
node --version
npm test
npm run dev
```

No npm dependencies to install. The demo API listens on `http://127.0.0.1:8787`.

## 2. Test using another PowerShell window

```powershell
$login = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/dev/login' -ContentType 'application/json' -Body '{"voterId":"marine-demo-001"}'
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/ballot' -Headers $headers | ConvertTo-Json -Depth 10
$body = '{"selections":{"president":"president_a","secretary":"secretary_b","vp_marine":"marine_a"}}'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/votes' -ContentType 'application/json' -Headers $headers -Body $body
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/demo/results' -Headers $headers | ConvertTo-Json -Depth 10
```

Try posting the same vote twice; the second submission must fail with HTTP 409. Check that a Marine voter cannot select a Mechanical VP.

## Endpoints and response shapes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | None | Status, marks development-only |
| `POST /api/dev/login` | None, LOCAL ONLY | `{"voterId":"marine-demo-001"}` → demo bearer token |
| `GET /api/me` | Demo bearer | `{id,department,hasVoted}` |
| `GET /api/ballot` | Demo bearer | `{electionId,manifestSha256,status,department,hasVoted,positions}` |
| `POST /api/votes` | Demo bearer | `{"selections":{"president":"...", ...}}` → `{accepted,receiptId}` |
| `GET /api/demo/results` | Demo bearer, LOCAL ONLY | Recounts submitted fake ballots |

Available demo voters in `fixtures/voters.json`. Candidate data in `fixtures/manifest.json` are fictional. The local demo state persists at `.local/demo.sqlite`; stop the server, then delete that file if you need a reset.

## Recount

With the server stopped or running:

```powershell
npm run audit:demo
```

## For integrating with the actual React frontend

Do NOT overwrite the frontend or its existing `aws/` folder. On a separate Git branch, adapt your frontend data-fetching layer to this API contract for local simulation. The latest repo cannot currently be inspected, so **check the existing route paths and DTOs first**.

The current Vite dev server (`http://localhost:5173`) can make requests to `http://127.0.0.1:8787`; the demo API has explicit CORS permission for this local origin. `VITE_API_BASE_URL` may need adjustment based on how the existing app constructs API paths.

## Absolutely required before real voting

1. Confirm exact frontend/backend API contract and merge carefully with Chinedu's changes.
2. Remove/disable the fake login, test IDs, demo results route, and SQLite store from any deployed environment. Implement Google OAuth **server-side** with callback and verified tokens, and SES OTP for authorised 100-level voters.
3. Use independently verified, signed-off student register; validate claims and **assign department from the register**, not from the web form. Enforce one-vote per voter and state transitions server-side.
4. Use DynamoDB transactional conditional writes with durable storage, least-privilege IAM and protected backup/recovery procedures; see `src/aws/ballot-transaction.mjs` for a payload-building example only.
5. Obtain ELECO/HOD sign-off on offices, candidates, eligible voter lists, rules, ballot freeze and timings.
6. Protect ballot secrecy: this prototype does NOT prove anonymity. Separate identity from choices, review logs, timing correlation, admin access and any evidence exports.
7. Independent audit, load testing, abuse controls, failure drills and a full mock election BEFORE live voting. If those fail, postpone rather than use an unreviewed emergency backend.

**No live deployment or real vote collection is authorized or performed by this package.**
