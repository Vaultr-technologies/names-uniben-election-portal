# v6 Election Management — candidate drafts and 100-level intake

**Scope:** This v6 patch extends v5. It is NOT a production-ready election until the AWS stack is deployed, and candidate/voter import, security and load testing are completed. Use `eu-west-2` for all AWS resources.

## Who can view or edit?

- `#situation-room`: public, read-only. No ELECO accounts. Candidate totals hidden until the backend has closed/reconciled/published the result.
- `#admin`: sensitive. Cognito user pool + mandatory software-token MFA + invite-only accounts in the `ElectionManagers` group. The frontend cannot bypass the backend's API Gateway JWT validation and group check.
- `#admin` has two sections: Candidate drafts (editable) and 100-level intake (safe operating instructions, not a student-PII browser).
- The management API has no voter-table permissions and cannot change an active ballot.

## AWS deployment (Chinedu)

1. Review `aws/template.yaml` before deploying or updating `names-election-staging`. Existing V5 resources remain; v6 adds **AdminUserPool**, **AdminUserPoolClient**, **AdminUserPoolDomain**, **ElectionManagersGroup**, **AdminCandidatesFunction** and **AdminAuditTable**, plus two JWT-authorized routes on the existing HTTP API. Since v6 modifies IAM policies, review CloudFormation capabilities and changeset. Existing stack resources must be preserved; do not delete your live stack.
2. Install and test: `cd aws && npm install && npm test && npm run lint:syntax && sam validate --lint && sam build`.
3. Use `sam deploy --guided --region eu-west-2`, with your existing parameters and the additional `AdminDomainPrefix`, a **globally unique** prefix such as `vaultr-names-eleco-<random-suffix>`. Cognito user pool uses classic hosted UI, available with the selected Lite feature tier.
4. In the **Cognito User Pool** output, create individual management users using the console or an authorized AWS CLI identity. Add only approved users to the `ElectionManagers` group. Example (replace values with the returned pool ID and approved email):

   ```bash
   aws cognito-idp admin-create-user --region eu-west-2 --user-pool-id POOL_ID --username AUTHORISED_EMAIL --user-attributes Name=email,Value=AUTHORISED_EMAIL Name=email_verified,Value=true
   aws cognito-idp admin-add-user-to-group --region eu-west-2 --user-pool-id POOL_ID --username AUTHORISED_EMAIL --group-name ElectionManagers
   ```

   Do not use a shared ELECO password. Confirm the person controls their email before setting `email_verified` to true. Prefer AWS-managed verification when available. First sign-in requires MFA setup.
5. Configure these **public** Vite build-time variables in the real AWS frontend environment (never secrets):

   ```env
   VITE_DEMO_MODE=false
   VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.eu-west-2.amazonaws.com
   VITE_ADMIN_COGNITO_DOMAIN=https://YOUR_PREFIX.auth.eu-west-2.amazoncognito.com
   VITE_ADMIN_CLIENT_ID=YOUR_USER_POOL_CLIENT_ID
   VITE_ADMIN_REDIRECT_URI=https://vaultr-technologies.github.io/names-uniben-election-portal/
   ```

   **Important:** `VITE_ADMIN_REDIRECT_URI` MUST exactly match the SAM `FrontendUrl` configured as a Cognito callback URL. If your real application uses AWS Amplify instead of GitHub Pages, use the exact Amplify HTTPS frontend URL in both places. `FrontendOrigin` is scheme+host only (for GitHub Pages, `https://vaultr-technologies.github.io`), not a full path. The public preview should not be connected to a production admin or voting API.
6. Deploy the React frontend to a controlled staging site. Open `https://YOUR_SITE/#admin`. The Sign In button starts Cognito hosted login with PKCE. The candidate-list read/save functions require an access token belonging to the `ElectionManagers` group. The token stays in memory and is not persisted; refreshing the page requires signing in again.
7. Confirm unauthenticated and regular voter requests to `/admin/candidates` return 401/403; confirm one allowed manager can save and another can see the revision and audit entry. Confirm a stale revision returns 409. Verify saving never alters `ELECTION` or any `BallotsTable` item. Test all of this in staging before use.

## Candidate approval workflow

- The panel maintains `CANDIDATE_DRAFT` separately in `ElectionConfigTable`, with version increments and an audit event for every save. It has 9 general offices plus 3 department-specific VP contests. Each candidate needs a real name; photo and tagline optional. If an `ELECTION` config exists, the panel is permanently read-only for that election instance. Do not attempt to edit an already opened ballot.
- Save changes, then **Export for review** from the panel. The file contains NO student information. ELECO must independently verify candidate identities, departments, eligibility and the approved final names. Keep evidence of approval, the draft revision and SHA-256.
- The dashboard does not publish, approve or activate a slate automatically. To create an official election config, use the review process:

  ```bash
  cd aws
  node scripts/generate-config.mjs private/election-timing.json
  # Edit private/election-timing.json with ELECO-approved title, UTC dates and schedule.
  # Inspect the candidate draft's revision and sha256 in the exported review JSON.
  CONFIG_TABLE=ACTUAL_TABLE AWS_REGION=eu-west-2 npm run assemble:election -- --base private/election-timing.json --out private/approved-election.json --revision 1 --sha256 APPROVED_SHA256
  CONFIG_TABLE=ACTUAL_TABLE AWS_REGION=eu-west-2 npm run import:election -- --file private/approved-election.json
  # Apply ONLY after independent approval and review:
  CONFIG_TABLE=ACTUAL_TABLE AWS_REGION=eu-west-2 npm run import:election -- --file private/approved-election.json --apply --eleco-approved
  ```

- The `assemble-election` command verifies the draft still matches the approved checksum/revision and `validateElection` checks every office and candidate. The import script refuses to overwrite existing `ELECTION` data. **Take care with real imported election configurations and lock before opening votes.**

## 100-level Google Forms intake

**No 100-level student submissions were provided in this chat.** This package does not contain any real student details and does not auto-import Google Forms responses.

1. Export responses from the ELECO-controlled Google Form as CSV to a PRIVATE folder on an authorised machine (not public Drive links, GitHub, or screenshots in group chats).
2. Locally convert them into the correct backend schema:

   ```bash
   cd aws
   npm install
   npm run prepare:100l -- --file "C:/private/names-form-responses.csv" --out private/100l-pending.csv
   ```

   Required fields: `Full Name`, `UB/B1 Registration Number`, `Department`, `Email Address`, `Declaration`. The converter rejects invalid data and duplicates within that export. It creates `eligibility=pending`, `emailBindingVerified=false`, and `level=100`. **A submitted form is not proof of identity or ownership of an email address.**
3. ELECO cross-checks the records against official university lists, resolves duplicate/conflicting claims, and independently confirms control of the claimed email and person-to-record binding. Only after this can staff prepare an approved update (with `emailBindingVerified=true`) through the separate controlled approval process.
4. To add new pending records to a controlled environment, the existing `import:voters` script has an explicit dry-run/approval flow:

   ```bash
   VOTERS_TABLE=ACTUAL_TABLE AWS_REGION=eu-west-2 npm run import:voters -- --file private/100l-pending.csv
   # Only if ELECO authorises the pending intake import, and after reviewing records:
   VOTERS_TABLE=ACTUAL_TABLE AWS_REGION=eu-west-2 npm run import:voters -- --file private/100l-pending.csv --apply --eleco-approved
   ```

   These are **pending** records and cannot sign in to vote. The existing importer is append-only, so don't reimport the same snapshot; subsequent batches must contain only newly accepted entries or be reconciled in a separate controlled process. Existing approved records must never be reset to pending by a fresh form submission.

## Security and rollout notes

- Use individual administrator identities for auditable candidate changes; the observer page remains public without individual accounts.
- Do not collect passports, NIN, BVN, passwords, government IDs or other extra personal data in the Google Form.
- Avoid uploading voter CSVs to ChatGPT; if adapting headers is needed, share only the column names and fictitious example rows.
- Retain the Google Forms data and approved voter register under ELECO's authorised privacy/retention rules, and remove unnecessary copies.
- AWS SAM/frontend builds and Cognito sign-in were not executed end to end in this artifact environment; run the supplied tests on the staging stack. An independent security review and election integrity drill are required before going live.
