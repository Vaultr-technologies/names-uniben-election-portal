**New in v5:** Shared read-only situation room and close-only provisional results publication. See [SITUATION-ROOM.md](SITUATION-ROOM.md).

# NAMES UNIBEN Electoral Portal — AWS integration project

Developed by Vaultr Technologies Ltd. · NAMES / UNIBEN 2026–2027

## Included

- Existing React + Vite frontend with NAMES and UNIBEN crests.
- Public homepage → verified login → student dashboard → eligible departmental ballot → review → confirmation.
- `aws/`: deployable AWS SAM API (Lambda, API Gateway HTTP API, DynamoDB, Secrets Manager integration, Amazon SES email OTP).
- Institutional Google OAuth **server-side code flow** for 200–500 level students, with backend verification of `hd=eng.uniben.edu` and an exact approved email-to-student mapping.
- Email OTP for 100-level students **only if** their approved registration number is linked to an independently verified email.
- Voter record and anonymous ballot stored in separate tables; no ballot ID or receipt ID stored in the voter record.
- Atomic one-voter/one-ballot transaction and backend-enforced departmental VP rules.
- Controlled voter import, approved candidate import, signed-off election activation, and operator-only reconciliation scripts.

## What is NOT included or established

This is a working **implementation starter**, not a certified production election service. No real students or candidates have been imported; no live AWS resources were created. The Google OAuth flow, SES delivery, infrastructure stack, Lambda runtime integration, and production load/security behaviour have **not** been exercised end-to-end. No independent election audit has been completed. Do not use it for a real election until all launch gates pass.

There is no public results or admin write endpoint. Operators must use audited, approved AWS access to run the read-only summary script. A separately authenticated monitoring application could be added afterward.

This is NOT end-to-end verifiable voting and AWS-account administrators retain powerful access. Operational reviews, independent supervision and committee-controlled evidence remain necessary.

## Deployment outline

**1. Run the checks locally**

```bash
npm install
npm test
npm run build
cd aws
npm install
npm test
npm run lint:syntax
```

**2. Set up AWS prerequisites**

- Use a non-root deployment identity and an approved project/account/region. Set an AWS Budget and alerts.
- Install AWS CLI v2 and AWS SAM CLI. Run `aws sts get-caller-identity` before deploying.
- Create a Google Cloud **Web** OAuth client (scope `openid email profile`) and a Secrets Manager secret JSON: `{"clientId":"...","clientSecret":"..."}`. Only authorised institutional accounts that match the ELECO register will be eligible. Google Workspace admin policies can still block access.
- Generate a random pepper locally (`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`) and store a separate Secrets Manager JSON secret `{"pepper":"<your random value>"}`.
- Verify an Amazon SES sender identity; request and confirm SES production access (the default sandbox can send only to verified recipients). Do not rely on email login until delivery to ordinary student addresses has passed testing.
- Choose the production frontend HTTPS address before finalising Google OAuth redirect and AWS API CORS parameters.

**3. Deploy in an isolated AWS development/staging environment**

```bash
cd aws
sam build
sam deploy --guided
```

Use stack name such as `names-election-staging`, select a region (e.g., `eu-west-1`), enable IAM changes, and supply these parameters:

| SAM parameter | Example / meaning |
|---|---|
| `FrontendOrigin` | `https://main.EXAMPLE.amplifyapp.com` (no trailing slash) |
| `FrontendUrl` | `https://main.EXAMPLE.amplifyapp.com/` (including trailing slash) |
| `GoogleOAuthSecretArn` | Google client secret ARN |
| `OtpPepperSecretArn` | OTP pepper secret ARN |
| `SesFromEmail` | Verified sending email address |
| `SesIdentityArn` | Exact Amazon SES sending identity ARN |

Copy the CloudFormation output `ApiUrl`. Add `<ApiUrl>/auth/google/callback` as an *Authorized redirect URI* in your Google Cloud OAuth client.

**4. Import a signed-off register and approved candidates**

Use the sample column header at `aws/templates/voters-header-only.csv`. Create a local, non-committed `approved-voters.csv` from the authoritative register. Level 100 rows need registration numbers; other levels use matric numbers. Institutional email addresses must be mapped by an authoritative source; DO NOT derive them from first/last names. For approved 100-level rows `emailBindingVerified=true` requires independent ELECO verification of the association between student identity and email. A Google Form submission by itself does not establish this.

```powershell
# PowerShell examples, from aws/ folder; use stack output table names:
$env:VOTERS_TABLE="<VotersTableName>"
node scripts/import-voters.mjs --file .\approved-voters.csv
# Only AFTER ELECO independently signs off:
node scripts/import-voters.mjs --file .\approved-voters.csv --apply --eleco-approved
```

Generate a **blank** configuration worksheet, then enter the actual approved candidates and dates:

```bash
node scripts/generate-config.mjs
# Edit approved-election-draft.json with real candidate IDs/names and exact UTC voting times.
```

The election contains 9 general offices and 3 department-restricted VP contests. The importer rejects empty/placeholder candidate lists. See `aws/scripts/import-election.mjs` and `set-status.mjs` for the approval-gated flow. Import only as `draft`; status changes require a recorded ELECO sign-off.

**5. Connect the production frontend**

Deploy the Vite application to AWS Amplify (or an equivalent controlled HTTPS static host) using the same GitHub repo, with build command `npm run build`, artifact directory `dist`, and environment:

```env
VITE_DEMO_MODE=false
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
```

Build-time env variables are public, so NEVER put AWS keys, OAuth secrets, registration exports, tokens, or student data in them. For a preview, the existing GitHub Pages workflow intentionally sets `VITE_DEMO_MODE=true` and must stay separate from production. Connect the API to the exact production origin configured for CORS. If the actual frontend URL changes, update the AWS stack and Google OAuth client.

**6. Run a supervised test election**

Use a separate AWS stack and an entirely separate voter/candidate test dataset. Test Google login, SES deliverability, invalid and missing voters, every department's VP ballot, duplicate parallel submissions, timeout recovery, close/open transitions, results reconciliation, authorization checks, cloud logs, and load tests. Never import mock ballots into production.

**7. Final launch gates**

- Written ELECO/H.O.D. approval of voter register, candidate list, voting schedule, data processing agreement, and production changes.
- Verified real identity binding for both 200–500 and 100 level; approved recovery procedure for inaccessible accounts.
- Successful full browser-to-AWS integration, independent security testing and load testing.
- Independent audit/reconciliation plan, segregated AWS credentials, backups and incident response procedure, monitored cloud costs.
- Agreed fallback if these conditions are not met. If a critical gate fails, do not use the system for real ballots.

## Safety details

- No matric-number-only login is permitted. A matric/UB/B1 number only identifies a record, never authenticates its owner.
- The API reads department from the approved voter record, not browser input.
- OTP challenge records are short-lived with limited attempts; the API also uses request throttling. A dedicated WAF/risk review is still recommended.
- A valid vote updates the registered voter's `hasVoted` flag and writes an unlinked ballot in one DynamoDB transaction.
- A lost response can be checked using `GET /voter/vote-status`; the status response deliberately does not expose the ballot's unique receipt ID to avoid linking votes back to student identities.
- Exact voter account-to-ballot unlinkability **cannot be guaranteed** against an operator with full access to app memory, server logs and AWS infrastructure. Do not describe this as a cryptographically anonymous or end-to-end verifiable election.

For endpoint details, see `aws/README.md`.
