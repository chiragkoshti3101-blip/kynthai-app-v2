# Persistence repair — local verification, NOT deployed

## Implemented
- Server credential only; no anonymous writes. Errors propagate instead of fake empty successes.
- Schema-derived model/table mapping, defaults, dates, encrypted writes/decrypted reads, narrow selection.
- Grouped filters, compound keys, relations/ownership predicates, pagination, exact counts.
- createMany, updateMany, deleteMany, conflict-aware upsert update/create branches.
- Medication GET uses the shared encrypted adapter and checks family ownership.
- Supabase auth profile synchronization uses the same encrypted adapter.
- Family invite email/token lookups use their deterministic hash columns.
- SOS and doctor prescribing use a service-role-only atomic PostgreSQL batch RPC.
- Document download authorizes then decrypts bytes rather than redirecting to ciphertext.
- Encrypted storage MIME allowed during bucket initialization; document pagination and journal dates validated.

## Verification
- Production Next build passed again after the resumed auth/storage changes.
- Latest full unit run: 256 passed, 1 failed. The failure is the existing API audit hardcoded route count (expects 155, repository has 154).
- 10 built local API GET endpoints reject unauthenticated requests with 401.
- Global TypeScript check still has 27 errors outside this change set; build config currently skips types.
- No authenticated live CRUD, AI response, recipient delivery, or storage roundtrip has been verified.

## Release blockers / unfinished work
1. Saved service-role key is `[SENSITIVE]`; saved secret key returns 401. Do not deploy until a valid server credential is provisioned.
2. Apply `supabase/migrations/20261116050000_atomic_clinical_writes.sql` via trusted migration tooling, verify RPC execute permissions (service_role only). RPC currently absent on live DB.
3. Verify live schema encrypted/hash columns and constraints match Prisma metadata. Backfill legacy family invite hashes before relying on encrypted lookup for existing invites.
4. Existing bucket needs `application/octet-stream` in its allowed MIME types; initialization does not modify existing buckets.
5. Remaining SQL bootstrap/raw query callers now explicitly fail rather than pretending success. Provision notification indexes/tables via migration, not runtime DDL.
6. Numeric update operators, groupBy, arbitrary nested writes, raw SQL and general transactions remain unsupported. Free-tier guard uses increment operators; payments still use general transactions. Add narrow atomic RPCs before claiming full application coverage.
7. Auth/me now shares getAuthUser authentication/revocation policy and uses the encrypted adapter. Supabase identity profile reads also use that adapter. Added three auth/me regression tests; full live authentication remains unverified.
8. AI provider key availability has not been validated against a real completion. Scheduled reminder dispatch and actual push/SMS delivery remain unverified.
9. Document upload now attempts storage cleanup on metadata failure; cleanup failures emit a PHI-safe error. High-level storage helpers now use the encrypted adapter and schema camelCase fields. Live storage roundtrip remains unverified.
10. Run authenticated two-user ownership tests across every requested module, test actual device push and decrypted upload/download, then deploy and repeat against production.

## Access limitation
Kortix session has no workspace grants for sessions/connectors discovery/secrets writes. Computer account is connected, but tool schema discovery is forbidden. Secret-request command is also forbidden. No Git push/deployment performed.

## Resumed verification (2026-11-16)
- Session log access was attempted and denied (`workspace.session.read`); resumed from this checkpoint and workspace logs.
- No deployment, migration, remote writes, or Git push performed.
- Full tests: 256 passed, 1 existing route-count audit failure (154 modules vs hardcoded minimum 155).
- Typecheck still reports the same 27 errors outside the modified files; production build passes with repository's existing type-skip setting.

## Supabase access recheck and bucket repair
- User confirmed Supabase is connected. Rechecked connector list, accounts, and schema: denied (`forbidden`, `connector_not_assigned`). Runtime config assigns co-founder only `computer`, with no Kortix permissions. Did not attempt to bypass or self-grant access.
- Bucket initialization now checks list failures, updates existing restrictive MIME lists to accept encrypted bytes, and makes existing public medical-document buckets private. Live execution still blocked by connector access.
- Four bucket regression tests added. Latest focused verification: 28 tests passed across storage, auth/me, adapter, document download. No new typecheck errors in changed files; existing global errors remain.
- Required access handoff: assign existing Supabase connector to co-founder and permit connector discovery/calls. Existing Supabase sign-in should not be repeated.

## Live verification after credential intake (2026-11-16)
- Selected workspace Supabase account `Supabase`; project `rmyepzyhhainzngufzrw`.
- Secret synced and validated as a project-matching service-role JWT. Initial REST 403 was PostgreSQL privileges, not invalid authentication.
- Applied atomic_clinical_writes and server_role_public_access migrations. Verified RPC denies anon/authenticated execute; service_role allowed. Server role now has public schema usage and CRUD; browser grants unchanged.
- Live synthetic test passed: encrypted medication create/read/update, cross-user filtered query returns null, ciphertext-at-rest assertion, journal roundtrip, successful clinical batch, failed batch rolls back prior insert, private medical-documents bucket initialized, encrypted storage upload/download/decryption, cleanup.
- Fixed scalar @map handling (newsletter created_at) in adapter/generator; newsletter create/read/sort verified live. Prior missing-column warning was metadata mapping, not schema drift.
- Focused run including live probe: 29 passed. Full suite: 260 passed, 1 pre-existing hardcoded route-count failure, 1 skipped opt-in live probe.
- Latest build attempt timed out after 240 seconds during compilation following pnpm dependency reconciliation. Do not claim this final revision build passed. Earlier build succeeded before mapping change. Global typecheck still has existing errors.
- No application deployment or Git push. Remaining atomic usage-counter/payment transactions and complete authenticated route/device tests remain outstanding.
