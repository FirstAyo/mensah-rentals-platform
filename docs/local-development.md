# Local Development on Windows

These instructions assume no prior monorepo, pnpm, Docker, or Prisma
experience. Run commands in **PowerShell** from the repository root unless a
step says otherwise.

## 1. Required software

Install:

1. **Git for Windows** from https://git-scm.com/download/win
2. **Node.js 22 LTS** from https://nodejs.org/
3. **Docker Desktop** from https://www.docker.com/products/docker-desktop/

During Docker Desktop installation, enable WSL 2 and Linux containers when
prompted. Restart Windows if the installer requests it. Open a new PowerShell
window after installing software so PATH changes are visible.

Visual Studio Code is optional.

## 2. Check Node.js

```powershell
node --version
```

Success shows `v22.x.x` or a newer compatible LTS version. If PowerShell says
`node` is not recognized, install Node.js or restart PowerShell.

Check Corepack:

```powershell
corepack --version
```

If Corepack is not available:

```powershell
npm install --global corepack
```

You may need to open PowerShell as Administrator for that one global install.
Return to a normal PowerShell window afterward.

If Corepack reports `Cannot find matching keyid`, its bundled signing keys are
out of date. Update Corepack, open a new PowerShell window, and retry:

```powershell
npm install --global corepack@latest
corepack enable
corepack prepare pnpm@10.15.1 --activate
```

## 3. Enable and check pnpm

This project pins pnpm 10.15.1.

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm --version
```

Success shows `10.15.1`. If `corepack enable` reports a permission error, open
PowerShell as Administrator, run only `corepack enable`, close that window, and
retry the remaining commands in a normal PowerShell window.

## 4. Check Git

```powershell
git --version
```

Success shows a Git version. If the repository has not been downloaded yet,
clone it and enter its directory before continuing.

## 5. Install dependencies

From the directory containing `package.json`:

```powershell
pnpm install
```

Success ends without an error and creates `node_modules` plus `pnpm-lock.yaml`.
Use pnpm for this repository; do not mix npm or Yarn lockfiles into it.

## 6. Open Docker Desktop

Start **Docker Desktop** from the Windows Start menu. Wait until it reports that
the Docker engine is running. Confirm both commands work:

```powershell
docker --version
docker compose version
```

Docker Desktop must be running each time local PostgreSQL is used.

## 7. Create the local environment file

Copy the safe example:

```powershell
Copy-Item .env.example .env
```

The provided values are development-only. `.env` is ignored by Git. Never
commit real passwords, tokens, or production configuration. If `.env` already
exists, do not overwrite it without first checking whether you need its local
values.

## 8. Start PostgreSQL

```powershell
docker compose up -d postgres
```

The first run downloads the PostgreSQL image. Success creates the service and
returns to the prompt. Data is retained in the Compose-managed named volume.

Redis is intentionally not part of Phase 1. It will be introduced only for a
specific cache, queue, distributed lock, or session use case.

## 9. Check PostgreSQL

```powershell
docker compose ps
```

The `postgres` service should show `running` and then `healthy`. It may display
`starting` for several seconds.

To ask PostgreSQL directly:

```powershell
docker compose exec postgres pg_isready -U mensah_dev -d mensah_rentals_dev
```

Success says the server is `accepting connections`.

## 10. Run Prisma setup

Validate the intentionally minimal schema, generate the client, and apply any
committed migrations:

```powershell
pnpm db:validate
pnpm db:generate
pnpm db:migrate
```

Phase 1 has no business models and no committed migrations to apply. Validation
should report a valid schema and generation should report that Prisma Client
was generated. `db:migrate` is already the forward-only command to use when
later phases commit migrations.

When a later development phase intentionally adds a schema migration, use:

```powershell
pnpm db:migrate:dev -- --name descriptive_migration_name
```

Do not manually edit a production database schema.

## 11. Start all applications

```powershell
pnpm dev
```

Keep this PowerShell window open. Turborepo starts:

- Customer website: http://localhost:3000
- Admin dashboard: http://localhost:3001
- API: http://localhost:4000

Use a second PowerShell window for test commands or smoke checks.

## 12. Start applications individually

Use one command per PowerShell window:

```powershell
pnpm dev:web
```

```powershell
pnpm dev:admin
```

```powershell
pnpm dev:api
```

These root commands intentionally use Turborepo so required shared packages are
built first, including on a clean checkout. The API requires `.env` and running
PostgreSQL for its database-readiness endpoint.

## 13. Stop applications

Click the PowerShell window running an application and press `Ctrl+C`. If asked
to terminate the batch job, type `Y` and press Enter. Stopping applications does
not stop PostgreSQL.

## 14. Stop Docker services

Preserve local database data and stop the container:

```powershell
docker compose down
```

Do not add `-v` unless you intentionally want to erase local database data.

## 15. Restart local development

After Docker Desktop is running:

```powershell
docker compose up -d postgres
docker compose ps
pnpm db:migrate
pnpm dev
```

Dependencies only need another `pnpm install` when package manifests or the
lockfile change.

## 16. Safely reset the local database

> Warning: this permanently deletes all data in this repository's **local
> development** PostgreSQL volume. Never run these commands against staging or
> production. Stop the applications first and confirm PowerShell is in this
> repository root.

```powershell
docker compose down -v
docker compose up -d postgres
docker compose ps
pnpm db:migrate
```

The volume name is scoped by Docker Compose to this project. `down -v` removes
it; the next `up` creates a clean volume.

`pnpm db:reset` is also destructive and intended only for deliberate local
development use. Prefer the explicit Docker reset sequence above when a full
local reset is required.

## 17. Troubleshooting Windows issues

### A command is not recognized

Close and reopen PowerShell after installation. Confirm the tool is installed
and on PATH. Run `node --version`, `pnpm --version`, `git --version`, and
`docker --version` separately to identify the missing tool.

### Docker cannot connect to the engine

Open Docker Desktop and wait for it to finish starting. Confirm it is using
Linux containers and WSL 2. In Docker Desktop settings, verify WSL integration
is enabled for your distribution.

### A port is already in use

Check the relevant port:

```powershell
Get-NetTCPConnection -LocalPort 3000
Get-NetTCPConnection -LocalPort 3001
Get-NetTCPConnection -LocalPort 4000
Get-NetTCPConnection -LocalPort 5432
```

Stop the conflicting application or Windows PostgreSQL service. If PostgreSQL
must use another host port, update both `POSTGRES_PORT` and the port in
`DATABASE_URL` inside `.env` so they match.

### PostgreSQL remains unhealthy

```powershell
docker compose logs postgres
```

Check `.env`, port conflicts, and available disk space. A password change does
not update an already initialized volume; reset the local volume only if losing
local development data is acceptable.

### Prisma cannot find DATABASE_URL

Confirm `.env` exists in the repository root:

```powershell
Test-Path .env
```

If it returns `False`, run `Copy-Item .env.example .env`. Run Prisma commands
through the documented root `pnpm db:*` scripts so the root file is loaded
explicitly.

### PowerShell execution policy blocks a command

Prefer the signed Node.js/Corepack installation and a normal PowerShell window.
Ask your system administrator before changing a managed execution policy. Do not
disable security controls globally merely to run the project.

### Line-ending warnings

Git may mention LF/CRLF conversion on Windows. This is normally harmless. Do
not run bulk line-ending rewrites unless the team intentionally adopts a new
repository policy.
