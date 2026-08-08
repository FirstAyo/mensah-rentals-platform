import { constants } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@mensah-rentals/database';
import { z } from 'zod';

const backupStatusFileSchema = z
  .object({
    backupConfigured: z.boolean(),
    checkedAt: z.string().datetime(),
    databaseCleanupSucceeded: z.boolean(),
    isolatedRestore: z.literal(true),
    mediaCleanupSucceeded: z.boolean(),
    result: z.enum(['PASSED', 'FAILED']),
    source: z.literal('GUARDED_TEST_DATABASE'),
  })
  .strict();

export interface BackupStatus {
  configured: boolean;
  lastBackupAt: string | null;
  lastVerificationAt: string | null;
  lastVerificationResult: 'PASSED' | 'FAILED' | 'UNKNOWN';
}

@Injectable()
export class SystemStatusService {
  private readonly logger = new Logger(SystemStatusService.name);
  async status() {
    const [database, media] = await Promise.all([
      this.databaseStatus(),
      this.mediaStatus(),
    ]);
    return {
      api: {
        commit: this.safeBuildValue(process.env.APP_COMMIT_SHA),
        status: 'HEALTHY' as const,
        uptimeSeconds: Math.floor(process.uptime()),
        version: this.safeBuildValue(process.env.APP_VERSION),
      },
      database,
      environment: this.environmentName(),
      generatedAt: new Date().toISOString(),
      integrations: {
        googleReviews: {
          configured:
            process.env.GOOGLE_REVIEWS_LIVE_ENABLED === 'true' &&
            Boolean(process.env.GOOGLE_PLACES_API_KEY) &&
            Boolean(process.env.GOOGLE_BUSINESS_PLACE_ID),
        },
      },
      media,
    };
  }

  async backupStatus(): Promise<BackupStatus> {
    const path =
      process.env.BACKUP_STATUS_FILE ?? '.local-backups/backup-status.json';
    for (const candidate of this.applicationFileCandidates(path)) {
      try {
        const contents = await readFile(candidate, 'utf8');
        if (Buffer.byteLength(contents, 'utf8') > 64 * 1024)
          return this.emptyBackupStatus(true);
        const parsed: unknown = JSON.parse(contents);
        const status = backupStatusFileSchema.safeParse(parsed);
        return status.success
          ? {
              configured: status.data.backupConfigured,
              lastBackupAt: null,
              lastVerificationAt: status.data.checkedAt,
              lastVerificationResult: status.data.result,
            }
          : this.emptyBackupStatus(true);
      } catch {
        // Try the next fixed monorepo application layout. Paths stay private.
      }
    }
    return this.emptyBackupStatus(true);
  }

  private async databaseStatus() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const rows = await prisma.$queryRaw<
        Array<{ applied: bigint; failed: bigint }>
      >`
        SELECT
          count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint applied,
          count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint failed
        FROM "_prisma_migrations"
      `;
      const expected = await this.expectedMigrationCount();
      const applied = Number(rows[0]?.applied ?? 0n);
      const failed = Number(rows[0]?.failed ?? 0n);
      return {
        migrations: {
          applied,
          expected,
          failed,
          upToDate:
            expected === null ? null : failed === 0 && applied === expected,
        },
        status: 'REACHABLE' as const,
      };
    } catch {
      this.logger.warn({ event: 'system_database_readiness_failed' });
      return {
        migrations: {
          applied: null,
          expected: null,
          failed: null,
          upToDate: null,
        },
        status: 'UNAVAILABLE' as const,
      };
    }
  }

  private async expectedMigrationCount() {
    const candidates = [
      resolve(process.cwd(), 'packages/database/prisma/migrations'),
      resolve(process.cwd(), '../../packages/database/prisma/migrations'),
    ];
    for (const directory of candidates) {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries.filter(
          (entry) =>
            entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name),
        ).length;
      } catch {
        // Try the next fixed application layout. Paths are never returned.
      }
    }
    return null;
  }

  private applicationFileCandidates(path: string) {
    if (isAbsolute(path)) return [resolve(path)];
    return [
      resolve(process.cwd(), path),
      resolve(process.cwd(), '../../', path),
    ];
  }

  private async mediaStatus() {
    const root = process.env.MEDIA_STORAGE_ROOT;
    if (!root) return { status: 'NOT_CONFIGURED' as const };
    try {
      await access(resolve(root), constants.R_OK | constants.W_OK);
      return { status: 'READ_WRITE' as const };
    } catch {
      this.logger.warn({ event: 'system_media_readiness_failed' });
      return { status: 'UNAVAILABLE' as const };
    }
  }

  private environmentName() {
    const value = process.env.NODE_ENV;
    return value === 'production' || value === 'test' || value === 'development'
      ? value
      : 'unknown';
  }

  private safeBuildValue(value: string | undefined) {
    const candidate = value?.trim();
    return candidate && /^[A-Za-z0-9._+-]{1,80}$/.test(candidate)
      ? candidate
      : null;
  }

  private emptyBackupStatus(configured: boolean): BackupStatus {
    return {
      configured,
      lastBackupAt: null,
      lastVerificationAt: null,
      lastVerificationResult: 'UNKNOWN',
    };
  }
}
