# Non-payment repair verification — 2026-11-16

## Scope and release boundary
Payment/Stripe/checkout source is unchanged. These repairs are not yet verified on the production deployment. Do not equate a passing code suite with delivered notifications or successful clinical end-to-end UI journeys.

## Verified
- Full regression suite: 336 passed, 1 skipped (337 total). The skipped case is the opt-in authenticated HTTP test, run separately below.
- Authenticated HTTP synthetic fixture test: passed against a local Next server and the configured live Supabase database. Covers medication CRUD and cross-user denial, reminder generation/status, journal updates, family/SOS reads/writes, complaints, encrypted document upload/download, CSRF. Fixtures cleaned up.
- Live persistence probe: passed, including encryption at rest, storage roundtrip, transactional rollback, atomic counters and concurrent AI quota (five reservations accepted from nine requests).
- Full ESLint: exit 0.
- Full TypeScript with incremental disabled: exit 0; build-time type suppression removed.
- Official production build: `NODE_OPTIONS=--max-old-space-size=1280 pnpm run build` passed. Uses webpack and a single in-process build worker. Larger heap budgets caused OS kills in this sandbox; 1024 MB exhausted V8 heap. Build still emits middleware/Sentry deprecation and dependency warnings.

## Repairs
- Restored schema-backed encrypted PostgREST model adapter, mapped columns, relation queries, grouped summaries and server-role access; unsupported raw SQL no longer masquerades as success.
- Atomic clinical writes, family owner membership, notification storage, usage and shared AI quota migrations.
- Requested non-payment route repairs for medications, reminders, journal, family/invites, SOS, prescriptions, complaints and documents.
- Ownership/consent/verified-provider checks, role-escalation prevention, session expiry and revocation, request throttling and video-room authorization.
- Revocation now invalidates local tokens issued before its cutoff, without locking fresh logins out for seven days. Unsupported targeted scopes remain explicit failures, not fake success.
- Redis signaling accepts SDK-deserialized objects as well as serialized strings; development fallback expires; production requires shared Redis.
- Distributed rate-limit policies now honor caller limits/windows and separate routes rather than using a hardcoded universal policy.
- Patient identity document constants moved to a browser-safe module to prevent Node cryptography entering client bundles.
- Browser notification prompting/diagnostic repairs; not proof of actual device receipt.

## External or unverified blockers
- Synthetic AI provider availability request to configured Cline endpoint returned HTTP 402 and no completion. Provider billing/credits must be resolved (or another working provider configured) before live AI chat can be called working. No billing changes made.
- Upstash management connector currently returns HTTP 401. This is distinct from runtime Redis REST credentials; distributed production behavior requires those runtime credentials to be verified on the actual deployment.
- Vercel connectors have no connected account. No deployment made in this repair pass. Production SOS visibility remains unverified; source contains the patient More-hub/SOS action and caretaker SOS view.
- Real push/FCM/APNs, SMS/email, background reminder delivery and two-device video/audio have not been delivery-tested. No real emergency notifications sent.
- Prescription issuing and doctor/lab/video checks have automated authorization coverage, not a completed clinical UI walkthrough.
- No supported user-capacity figure without a representative load test against the target deployment.

## Release requirement
Review and merge the repair branch, verify deployment configuration and build, then run production smoke/UI/device tests before calling every requested item complete.
