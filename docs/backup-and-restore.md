# PostgreSQL and media backup/restore runbook

## Phase 19.2 coverage

The PostgreSQL dump preserves `CustomerWorkflowSetting`, Gallery projects/revisions/media references/Homepage selections, Cart enquiries/item snapshots, and outbound email/attempt history. The backup summary explicitly records Gallery-project/revision and Cart-enquiry/item/outbound-email counts; the database integrity catalogue checks Gallery heads and missing enquiry lines. Gallery image bytes remain in the managed-media volume, so a PostgreSQL dump without the matching media archive is incomplete. Restores must verify both database summaries and exact media hashes.

Cart enquiries and outbox rows are operational/customer data and must not be copied through the public-content transfer. Preserve them only in secured environment backups with the same confidentiality as contact details and rental records. A restored `SENT` marker is historical delivery state; restoring it must not trigger a duplicate send. Real production email/provider secrets do not belong in backup manifests.

Phase 18 backup tooling is operator-only. The admin application shows verification metadata but cannot start a backup, restore, reveal a path, or download an artifact.

## Prerequisites on Windows

Install Node.js 22+, pnpm 10, Git, and Docker Desktop. Start Docker Desktop and wait until its engine says it is running. Copy `.env.example` to the ignored `.env` and keep the development and `_test` database URLs distinct.

```powershell
cd "C:\path\to\mensah-rentals-platform"
docker compose up -d postgres postgres-test
docker compose ps
pnpm db:status
```

Both PostgreSQL containers should be `Up`/healthy and Prisma should report 48 migrations up to date.

## Backup set and safety

`pnpm db:backup` creates a development set; `pnpm db:backup:test` creates a guarded-test set. Each ignored `.local-backups/<timestamp>-<source>/` set contains:

- `database.dump`: PostgreSQL custom-format dump.
- `media.tar.gz`: media archive.
- `manifest.json`: format/source class, created time, migrations, bounded table counts, inventory summaries, media count, bytes, and SHA-256 hashes.

The manifest never contains credentials or connection strings. Media scanning rejects source symlinks. Restore verification rejects absolute/traversal paths, symlink/hardlink/special archive entries, unexpected artifacts, and hash/count mismatches.

## Create and verify

```powershell
pnpm db:integrity
pnpm db:backup
pnpm db:backup:test
pnpm db:restore:test
```

The restore command accepts guarded-test backup material only. It creates a random isolated `_verify_...` database on `postgres-test`, restores the schema/data, runs the current integrity catalogue, compares counts/inventory summaries, extracts media to an owned temporary directory, compares every hash, and removes both isolated resources in `finally` cleanup. Success says `Restore verification passed`, the migration/media counts, and that isolated resources were removed.

The System Status `Last verification` value represents the latest guarded-test restore verification. It is not an operational production-backup timestamp. `Last backup` remains `Not recorded` until deployment automation writes an independent operational backup record.

## Failure handling

- Docker connection failure: open Docker Desktop and rerun `docker compose up -d postgres postgres-test`.
- Integrity failure: do not back up/restore as authoritative; inspect the named failed invariant. Never manually edit history to silence it.
- Hash/count mismatch: quarantine the backup set and create a fresh backup after investigating source storage.
- Cleanup failure: use the logged isolated database name or temporary path to inspect and remove only that exact guarded resource; never remove a broad directory/database.
- Missing `pg_dump`, `pg_restore`, or `tar`: use the Docker services and Windows tar included by the documented commands; verify Docker Desktop installation/PATH.

## Production recovery direction

Production restore is deliberately not automated in the web UI. Stop writes, preserve the damaged database/media, select an encrypted off-host backup, verify it in isolation, restore into fresh database/media targets, compare manifests, run integrity checks, obtain human approval, then switch traffic. Record operator, backup identity, times, results, and rollback decision outside the restored database.

VPS operations should schedule backups, encrypt them before off-host transfer, keep multiple retention tiers, restrict keys to operators, alert on missed jobs/verification age, and regularly perform isolated restores. Redis is not involved. Never treat an unverified dump as a successful backup.

The staging-first VPS deployment intentionally uses separate named PostgreSQL and media volumes for staging and production. Volume separation is not a backup. Before production promotion, the operator must implement and prove scheduled encrypted off-VPS database and media retention plus isolated restore verification; this remains an explicit production blocker in [the deployment runbook](deployment.md).
