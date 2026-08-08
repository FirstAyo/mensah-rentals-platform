# PostgreSQL and media backup/restore runbook

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

The restore command accepts guarded-test backup material only. It creates a random isolated `_verify_...` database on `postgres-test`, restores the schema/data, runs all 17 integrity checks, compares counts/inventory summaries, extracts media to an owned temporary directory, compares every hash, and removes both isolated resources in `finally` cleanup. Success says `Restore verification passed`, the migration/media counts, and that isolated resources were removed.

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
