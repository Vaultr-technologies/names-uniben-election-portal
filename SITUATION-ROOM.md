# NAMES UNIBEN — Shared Election Situation Room

## What has been built

A single **public, read-only** situation-room page for the H.O.D., ELECO, observers and campaign agents. **No individual observer accounts are required.** The page is integrated with the existing React portal, using the same NAMES and UNIBEN logos.

**Preview link after pushing to GitHub Pages** (fictitious demo data only):

`https://vaultr-technologies.github.io/names-uniben-election-portal/#situation-room`

**Production link:** the real AWS Amplify frontend URL with `#situation-room` appended. The exact hostname will be assigned when the Amplify app is deployed.

The view has four phases:

1. **Upcoming** — shows approved eligible voter count (once frozen); no candidate tallies.
2. **Voting open** — shows overall accepted-ballot count and turnout; no candidate tallies.
3. **Closed / reconciling** — hides candidate totals while a scheduled AWS job verifies the counts.
4. **Published** — shows the **provisional** results of all nine general offices plus each department's VP race. Observers can filter contests and download aggregate totals as CSV.

A mismatch instead displays **Review required** and prevents automatic results publication. These are **provisional results** pending ELECO certification, *not* cryptographically or independently verified election outcomes.

## AWS changes

Updated `aws/template.yaml` provisions:

- Existing API Lambda and DynamoDB tables (from v4).
- A separate **PublishedResultsTable** with PITR enabled.
- A **ProvisionalResultsPublisher** Lambda that runs once per minute via EventBridge.
- `GET /public/situation` on the existing API Gateway.

The publisher:

- Waits until the election closes and for **90 seconds of settling time** after the scheduled closing instant.
- Reads all approved voter status records, anonymous ballots and sharded accepted-ballot counters.
- Verifies registered count, accepted vote count, ballot count, candidate/position validity, approved configuration version and per-department VP totals.
- Conditionally creates exactly one snapshot (`id=RESULTS`) if all consistency checks pass.
- Writes a review-required marker (`id=PUBLICATION_STATE`) if consistency checks fail; automated publication stops until the discrepancy is reviewed.

This process typically publishes roughly **2–3 minutes after the scheduled closing time**, depending on AWS scheduling, traffic, and processing. It cannot promise publication at the precise second voting closes. AWS administrators retain infrastructure control; these consistency checks cannot establish end-to-end ballot correctness.

The public endpoint does **not** return full voter records, voter identity, ballots, email addresses, individual choices, or candidate totals while voting is open.

## Deployment and election setup order

1. **Stage first:** deploy the updated SAM template in the selected **`eu-west-2` (London)** region after reviewing the CloudFormation changes and permissions. Confirm it creates one scheduled publisher and one published-results table. Deploy the stack *before* test ballots are submitted so the new atomic counters cover every ballot.
2. Continue v4's Google OAuth, SES, domain/CORS, and approved-record authentication setup. Production is not ready until these are independently tested.
3. Import the approved **draft** election configuration and validated ELECO voter register using the existing CLI scripts. Do not commit student data to GitHub.
4. **Freeze the authorised voter register count** before opening the election:

   ```bash
   # From aws/; set CONFIG_TABLE and VOTERS_TABLE to the real stack outputs.
   node scripts/finalize-register.mjs --approved-by "ELECO representative"   # dry run
   node scripts/finalize-register.mjs --approved-by "ELECO representative" --apply
   ```

   The freeze writes `eligibleCount` and `departmentEligibleCounts` to the draft election configuration. If late arrivals must be added after freezing, **stop and formally reapprove the register before opening**; do not silently alter the eligible electorate.

5. Open voting via the existing `set-status.mjs` only after written ELECO approval. It now refuses to open if the register has not been frozen.
6. Run an entire **staging mock election**. Confirm that the situation room hides candidate totals while voting is open and releases *provisional* totals only after reconciling the test ballots. Stress test the read-only endpoint alongside ballot submissions.
7. Record and approve exact election times in **UTC**. `eu-west-2` is the AWS location, not the Nigerian time zone. Nigeria is UTC+1. The client displays publication times in Africa/Lagos.
8. Review provisional results independently, preserve an approved copy and let ELECO certify or dispute them. Do not call these figures official results before certification.

> **Important:** If you already conducted test ballots with the original v4 code, do not reuse that database as production: those submissions did not contain the sharded turnout counters. Start the election against a fresh and separate environment.

## Public API schema (example, types only)

```json
{
  "schemaVersion": 1,
  "election": { "id": "ELECTION", "title": "...", "startsAt": "...", "endsAt": "..." },
  "status": "open",
  "stage": "open",
  "eligibleVoters": 0,
  "acceptedBallots": 0,
  "turnoutPercent": 0.0,
  "positions": null,
  "publishedAt": null,
  "resultStatus": null
}
```

Possible `stage`: `setup`, `upcoming`, `open`, `reconciling`, `review_required`, `published`.

Once published, `positions` is an array with each position's `{id,title,scope,department,totalVotes,candidates:[{id,name,votes}]}`. The public API returns **aggregated counts only**.

## Security / governance limits

- No individual observer accounts means the URL is publicly shareable and the data returned by the API is public. Anyone can view turnout and published provisional totals.
- No candidate tallies during voting. Even authorised campaign agents are prevented from getting totals through this endpoint until closure.
- Do not publish per-student turnout logs or individual ballot references in the situation room.
- The public counts and reconciliation are not a substitute for an independent election audit. An AWS root/account administrator could potentially interfere with production data or code.
- ELECO should appoint an independent reviewer, establish documented incident procedures and retain independently controlled copies of its accepted register count, configuration and final certified results.
- If the discrepancy marker is set, **do not manually delete or override it without written ELECO direction and an independent investigation**.
- Review scheduled publisher costs, rate limiting and logs. Disable the once-per-minute publication schedule after the election is safely archived.
- A successful local syntax check does not mean the full AWS stack has been deployed or passed end-to-end tests. No AWS resources have been created by this package.

## Frontend demo

The GitHub Pages workflow always sets `VITE_DEMO_MODE=true`, intentionally showing fictitious data with **Before / During / Counting / After** stage controls. To run locally:

```bash
npm install
npm run dev
npm test
npm run build
```

For the AWS-connected site, deploy a separate Amplify frontend with `VITE_DEMO_MODE=false` and `VITE_API_BASE_URL` set to the deployed API Gateway endpoint. Never share AWS secrets through Vite environment variables.
