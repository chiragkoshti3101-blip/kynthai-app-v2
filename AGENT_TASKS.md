# Non-payment completion backlog

Payments/Stripe changes explicitly excluded by user.

- [x] Resolve global TypeScript errors without hiding them.
- [x] Pass official production build, full ESLint and regression suite (see release verification; dependency audit separate).
- [x] Atomic free-tier usage counters; verify AI quota persistence and concurrent limit.
- [ ] Authenticated medication CRUD, reminders, journal, family/invites ownership tests.
- [ ] SOS visibility, authorization and atomic persistence; notifications and delivery checks.
- [ ] Prescriptions, complaints, encrypted documents route-level verification.
- [ ] Doctor/lab sharing and video authorization verification.
- [ ] Security review: role escalation, session expiry/revocation, blocked users, MFA, rate limits.
- [ ] Verify runtime providers, report external/device blockers precisely.
- [ ] Commit verified non-payment repairs, assess deployment separately with release evidence.

See docs/2026-11-16-release-verification.md for current evidence and remaining release/device/provider gaps. Automated tests are not proof of full production UI journeys.
