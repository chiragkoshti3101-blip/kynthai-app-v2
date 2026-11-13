# Field encryption backfill (non-destructive)

Kynthai stores sensitive columns in encrypted shadow fields (`*_enc`, plus optional `*_hash` for exact lookups). Legacy rows may still hold plaintext in the original columns until a controlled backfill runs.

## Runtime behavior (Batch 0–1)

- **Writes:** Prisma encryption middleware and `encryptSensitiveFields()` encrypt plaintext into `*_enc`, clear the plaintext column (empty string when the schema requires non-null), and never leave stale plaintext when only `*_enc` is supplied.
- **Reads:** Prefer `*_enc`; when `ENCRYPTION_TRANSITIONAL` is not `false`, fall back to legacy plaintext if `*_enc` is null.

## Backfill script (do not run in CI)

The reviewed, **non-destructive** backfill lives at `scripts/encrypt-existing-data.mjs`.

| Flag | Purpose |
|------|---------|
| *(default)* | Dry run — counts rows that need backfill, prints no PHI |
| `--apply` | Encrypt legacy plaintext into `*_enc` and clear plaintext in batches |
| `--verify` | Confirm `*_enc` decrypts and plaintext columns are empty |
| `--apply --verify` | Apply then verify in one run |

**Prerequisites:** database backup, `DATABASE_URL`, `ENCRYPTION_KEY` (same as production), maintenance window.

**Production cutover (after verify):** set `ENCRYPTION_TRANSITIONAL=false` so reads never fall back to plaintext.

This script does **not** drop columns or run destructive migrations. Dropping plaintext columns is a separate batch after legal/ops sign-off.
