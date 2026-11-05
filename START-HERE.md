# Quick start — for Vaultr (you and Chinedu)

**What is ready today:** The React frontend is already wired to `src/lib/api.js`; the `aws/` folder adds the matching actual AWS API routes, database models, student authentication flows, ballot validation, and operator import/summary scripts. None of it uses synthetic voter credentials in non-demo mode.

**What we still require:** Actual approved student records, approved candidates, a real AWS deployment with Google OAuth and SES configured, and full system tests. There are no production credentials or fake live records in the files.

## The next five things to do

1. **On your laptop:** Extract this ZIP. Replace the files in the GitHub-connected repository but preserve `.git`. Run `npm install && npm test && npm run build` at project root. In `aws/`, run `npm install && npm test`.
2. **In AWS (Chinedu):** Use an authorised non-root AWS IAM deploy identity. Create the two Secrets Manager secrets (Google OAuth client JSON and OTP pepper), a verified SES sender, and approve SES production access. Set a small AWS Budget and project tags.
3. **In Google Cloud:** Create a Web OAuth client for the election site, and later register the exact AWS callback URL. Test sign-in using a consenting `@eng.uniben.edu` account. Do not assume Workspace third-party access is guaranteed.
4. **Deploy a separate AWS staging stack:** In `aws/`, run `sam build` then `sam deploy --guided`. The AWS stack output gives the API URL. Build the frontend with `VITE_DEMO_MODE=false` and `VITE_API_BASE_URL=<API URL>` on AWS Amplify. GitHub Pages stays demo-only.
5. **Prepare the approved data:** ELECO supplies the authoritative roster with actual institutional emails, checks UB/B1 number and personal-email bindings, and signs off the candidate list and election schedule. Import via the dry-run-then-approved scripts (see `README.md`). Use only test data in staging.

## Important: don't change the frontend to matric-number-only login

That would let anyone who knows a classmate's number attempt to vote as them. The integration is intentionally fail-closed: no approved email binding → no authentication. Email one-time codes require SES production approval and verified recipient mapping; Google login requires the correct identity-to-voter mapping.

## The go-live decision

Do NOT label this 'secure and production certified' from the unit tests. The current package has not run end-to-end on AWS, nor passed the Monday supervised pilot, independent security/integrity review, or measured load testing. If those cannot be met by Tuesday, recommend postponement or an alternate election process.
