'use client';

import { CircleCheck, CircleX, RefreshCw, ServerCog } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  parseBackupStatus,
  parseSystemStatus,
  type BackupStatusResponse,
  type SystemStatusResponse,
} from '@/lib/system-status-types';

function StatusValue({ value }: { value: string }) {
  const healthy = [
    'ok',
    'healthy',
    'ready',
    'available',
    'writable',
    'read_write',
    'reachable',
    'passed',
  ].includes(value.toLowerCase());
  const Icon = healthy ? CircleCheck : CircleX;
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <Icon
        aria-hidden="true"
        className={
          healthy ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-destructive'
        }
      />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

export function SystemStatus({ canViewBackup }: { canViewBackup: boolean }) {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [backup, setBackup] = useState<BackupStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [statusResponse, backupResponse] = await Promise.all([
          fetch('/api/system/status', { cache: 'no-store', signal }),
          canViewBackup
            ? fetch('/api/system/backup-status', { cache: 'no-store', signal })
            : Promise.resolve(null),
        ]);
        if (!statusResponse.ok)
          throw new Error('System status could not be loaded.');
        const parsedStatus = parseSystemStatus(await statusResponse.json());
        if (!parsedStatus)
          throw new Error('System status returned an unsafe response.');
        let parsedBackup: BackupStatusResponse | null = null;
        if (backupResponse) {
          if (!backupResponse.ok)
            throw new Error('Backup status could not be loaded.');
          parsedBackup = parseBackupStatus(await backupResponse.json());
          if (!parsedBackup)
            throw new Error('Backup status returned an unsafe response.');
        }
        setStatus(parsedStatus);
        setBackup(parsedBackup);
      } catch (value) {
        if (value instanceof DOMException && value.name === 'AbortError')
          return;
        setStatus(null);
        setBackup(null);
        setError(
          value instanceof Error
            ? value.message
            : 'System status could not be loaded.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [canViewBackup],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Internal diagnostics
          </p>
          <h1 className="mt-2 text-3xl font-bold">System status</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Safe operational readiness information. Credentials, connection
            strings, storage paths and backup files are never displayed.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 font-semibold disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Refresh
        </button>
      </header>
      {error ? (
        <div className="rounded-xl border bg-card p-4" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div
          aria-live="polite"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role="status"
        >
          {[0, 1, 2].map((value) => (
            <div
              className="h-36 animate-pulse rounded-xl bg-muted"
              key={value}
            />
          ))}
          <span className="sr-only">Loading system status</span>
        </div>
      ) : null}
      {status ? (
        <>
          <p className="text-sm text-muted-foreground">
            Last checked {new Date(status.generatedAt).toLocaleString()}
          </p>
          <section
            aria-label="System services"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <StatusCard
              label="API"
              value={<StatusValue value={status.api.status} />}
              detail={`Uptime ${Math.floor(status.api.uptimeSeconds / 60).toLocaleString()} minutes`}
            />
            <StatusCard
              label="Database"
              value={<StatusValue value={status.database.status} />}
              detail={
                status.database.migrations.upToDate
                  ? `${status.database.migrations.applied} migrations applied; schema current`
                  : 'Database schema requires operator attention'
              }
            />
            <StatusCard
              label="Media storage"
              value={<StatusValue value={status.media.status} />}
              detail="Read/write readiness only; storage paths are private"
            />
            <StatusCard
              label="Environment"
              value={
                <span className="font-semibold">{status.environment}</span>
              }
              detail="Bounded environment name"
            />
            <StatusCard
              label="Google Reviews"
              value={
                <span className="font-semibold">
                  {status.integrations.googleReviews.configured
                    ? 'Configured'
                    : 'Not configured'}
                </span>
              }
              detail="No API key or review content is exposed"
            />
            <StatusCard
              label="Application"
              value={
                <span className="font-semibold">
                  {status.api.version ?? 'Version not configured'}
                </span>
              }
              detail={
                status.api.commit
                  ? `Commit ${status.api.commit}`
                  : 'Commit identifier not configured'
              }
            />
          </section>
          {canViewBackup ? (
            <section aria-labelledby="backup-status-heading">
              <h2 className="text-2xl font-semibold" id="backup-status-heading">
                Backup verification
              </h2>
              {backup ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusCard
                    label="Backup system"
                    value={
                      <span className="font-semibold">
                        {backup.configured ? 'Configured' : 'Not configured'}
                      </span>
                    }
                    detail="Execution remains operator-controlled"
                  />
                  <StatusCard
                    label="Last backup"
                    value={
                      <span className="font-semibold">
                        {when(backup.lastBackupAt)}
                      </span>
                    }
                    detail="No backup file is downloadable here"
                  />
                  <StatusCard
                    label="Last verification"
                    value={
                      <span className="font-semibold">
                        {when(backup.lastVerificationAt)}
                      </span>
                    }
                    detail="Isolated restore verification"
                  />
                  <StatusCard
                    label="Verification result"
                    value={
                      <span className="font-semibold">
                        {backup.lastVerificationResult}
                      </span>
                    }
                    detail="See operator logs for technical detail"
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{label}</h2>
        <ServerCog aria-hidden="true" className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-4">{value}</div>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}
