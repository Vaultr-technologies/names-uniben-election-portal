# NAMES Election AWS API — implementation guide

## API contract (front-end already integrated)

| Method | Path | Required authentication | Result |
|---|---|---|---|
| GET | `/election` | Public | Election status/title/dates |
| GET | `/auth/google/start` | Public | Redirect to Google OAuth |
| GET | `/auth/google/callback` | Google callback | Redirect with 90-second one-use login code |
| POST | `/auth/google/exchange` | `{code}` | `{accessToken,voter}` |
| POST | `/auth/email/request` | `{identifier,identifierType:'registration'}` | Generic `{challengeId,...}` |
| POST | `/auth/email/verify` | `{challengeId,code}` | `{accessToken,voter}` |
| GET | `/voter/me` | Bearer | Verified voter profile, excluding email |
| GET | `/voter/ballot` | Bearer | All and only eligible positions/candidates |
| POST | `/vote` | Bearer, `{selections:[{positionId,candidateId}],idempotencyKey}` | `{status:'accepted',receiptId}` or error |
| GET | `/voter/vote-status` | Bearer | `accepted` or `not_submitted`; no identifying receipt linkage |
| POST | `/auth/logout` | Bearer | Revokes server session |

`idempotencyKey` is accepted for compatibility with the existing frontend; exactly-one acceptance comes from the conditional DynamoDB transaction. On a timed-out submission the client must check `/voter/vote-status`; do not assume a timeout means no vote was accepted.

## Voter item schema (DynamoDB VotersTable)

`{id:'MATRIC#...', fullName, department, level, identifier, identifierType, eligibility:'approved'|'pending', hasVoted:false, institutionalEmail?,'approvedPersonalEmail'?,emailBindingVerified?}`.

The institutional email is indexed. A google `sub` may be bound on the initial verified login. 100-level email verification depends on previously approved and independently confirmed email-to-student mapping.

## Election configuration schema

`{id:'ELECTION',title,subtitle,status:'draft'|'open'|'closed',version:1,startsAt:'ISO UTC',endsAt:'ISO UTC',positions:[{id,title,scope:'general'|'department',department?,candidates:[{id,name,department?,tagline?,photoUrl?}]}]}`.

Generate the blank positions with `node scripts/generate-config.mjs`. The canonical title list is in `src/rules.mjs`. An eligible voter gets nine general offices plus the VP office for their verified department. The ballot backend accepts only exact approved position/candidate IDs.

## Important operational constraints

- AWS SAM CLI, AWS CLI and AWS credentials are required to deploy. This package does not contain AWS credentials and has not been deployed.
- The API gateway has an initial 60 requests/s, burst 120 throttle; change only after load testing.
- CORS must match the frontend origin exactly, including HTTPS but excluding path/trailing slash.
- Do not import real student records into test deployments, public repos, issue trackers or chat transcripts.
- Amazon SES must have a verified identity and production sending approval before 100-level email verification can work for general recipients.
- This prototype does not implement a complete production administrative UI, WAF, audit evidence export or end-to-end cryptographic verification. Those are separate required go-live reviews, not automatic AWS features.
