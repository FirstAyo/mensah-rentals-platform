import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  assertSafeArtifactName,
  compareMediaFiles,
  createOwnedTemporaryDirectory,
  createRestoreDatabaseName,
  isPathInside,
  loadOperatorEnvironment,
  parseOperatorArguments,
  repositoryRoot,
  resolveDatabaseContext,
  runProcess,
  safeFailureMessage,
  scanMedia,
  sha256FileStream,
  validateArchiveEntries,
  validateArchiveEntryTypes,
  valuesMatch,
  writeJsonAtomic,
} from './database-operator-tooling.mjs';
import { createBackup, readDatabaseSummary } from './db-backup.mjs';
import { runIntegrityChecks } from './db-integrity.mjs';

function readManifest(setDirectory) {
  const manifestPath = resolve(setDirectory, 'manifest.json');
  if (!isPathInside(setDirectory, manifestPath) || !existsSync(manifestPath)) {
    throw new Error('The backup manifest was not found.');
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('The backup manifest is invalid.');
  }
  if (manifest.formatVersion !== 1 || manifest.sourceKind !== 'test') {
    throw new Error(
      'Restore verification accepts only format-version 1 guarded test backups.',
    );
  }
  return { manifest, manifestPath };
}

async function createDatabase(context, databaseName) {
  await runProcess(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      context.service,
      'createdb',
      '--username',
      context.username,
      '--template=template0',
      '--encoding=UTF8',
      databaseName,
    ],
    { environment: context.environment },
  );
}

async function dropDatabase(context, databaseName) {
  await runProcess(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      context.service,
      'dropdb',
      '--username',
      context.username,
      '--if-exists',
      '--force',
      databaseName,
    ],
    { environment: context.environment },
  );
}

async function restoreDatabase(context, databaseName, dumpPath) {
  await runProcess(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      context.service,
      'pg_restore',
      '--username',
      context.username,
      '--dbname',
      databaseName,
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
    ],
    { environment: context.environment, inputFile: dumpPath },
  );
}

async function listArchiveEntries(archivePath) {
  const verboseOutput = await runProcess('tar', ['-tvzf', archivePath], {
    capture: true,
  });
  validateArchiveEntryTypes(verboseOutput.split(/\r?\n/));
  const output = await runProcess('tar', ['-tzf', archivePath], {
    capture: true,
  });
  const entries = output.split(/\r?\n/).filter(Boolean);
  validateArchiveEntries(entries);
  return entries;
}

async function extractMedia(archivePath, targetDirectory) {
  await listArchiveEntries(archivePath);
  await runProcess('tar', ['-xzf', archivePath, '-C', targetDirectory]);
}

function resolveStatusPath(environment) {
  return resolve(
    repositoryRoot,
    environment.BACKUP_STATUS_FILE || '.local-backups/backup-status.json',
  );
}

async function verifyArtifacts(setDirectory, manifest, extractionDirectory) {
  const dumpFilename = assertSafeArtifactName(
    manifest.database?.dumpFilename,
    'database dump filename',
  );
  const archiveFilename = assertSafeArtifactName(
    manifest.media?.archiveFilename,
    'media archive filename',
  );
  const dumpPath = resolve(setDirectory, dumpFilename);
  const archivePath = resolve(setDirectory, archiveFilename);
  if (
    !isPathInside(setDirectory, dumpPath) ||
    !isPathInside(setDirectory, archivePath) ||
    !existsSync(dumpPath) ||
    !existsSync(archivePath)
  ) {
    throw new Error('A required backup artifact is missing.');
  }
  if ((await sha256FileStream(dumpPath)) !== manifest.database.sha256) {
    throw new Error('The database dump hash does not match its manifest.');
  }
  if ((await sha256FileStream(archivePath)) !== manifest.media.sha256) {
    throw new Error('The media archive hash does not match its manifest.');
  }
  await extractMedia(archivePath, extractionDirectory);
  const mediaFailures = compareMediaFiles(
    manifest.media.files,
    scanMedia(extractionDirectory),
  );
  if (mediaFailures.length > 0) {
    throw new Error(mediaFailures.slice(0, 5).join('; '));
  }
  return { archivePath, dumpPath, mediaFileCount: manifest.media.files.length };
}

export async function verifyRestore({
  backupRoot,
  environment = loadOperatorEnvironment(),
  existingBackup,
} = {}) {
  const context = resolveDatabaseContext(environment, 'test');
  let backup;
  if (existingBackup) {
    const setDirectory = resolve(repositoryRoot, existingBackup);
    const loaded = readManifest(setDirectory);
    backup = { ...loaded, setDirectory };
  } else {
    backup = await createBackup({
      backupRoot,
      environment,
      sourceKind: 'test',
    });
  }

  const { manifest, manifestPath, setDirectory } = backup;
  const restoreDatabaseName = createRestoreDatabaseName(context.databaseName);
  const extractionDirectory = createOwnedTemporaryDirectory(
    'mensah-media-restore-',
  );
  let databaseCreated = false;
  let databaseCleanupSucceeded = false;
  let mediaCleanupSucceeded = false;
  let verificationError;

  try {
    const artifacts = await verifyArtifacts(
      setDirectory,
      manifest,
      extractionDirectory,
    );
    await createDatabase(context, restoreDatabaseName);
    databaseCreated = true;
    await restoreDatabase(context, restoreDatabaseName, artifacts.dumpPath);
    const restoredSummary = await readDatabaseSummary(
      context,
      restoreDatabaseName,
    );
    if (!valuesMatch(manifest.database.summary, restoredSummary)) {
      throw new Error(
        'Restored schema, counts, representatives, or inventory totals do not match the backup manifest.',
      );
    }
    const integrity = await runIntegrityChecks(context, restoreDatabaseName);
    if (!integrity.passed) {
      throw new Error(
        `The restored database failed integrity checks: ${integrity.failures
          .map((failure) => failure.check)
          .join(', ')}.`,
      );
    }

    manifest.verification = {
      checkedAt: new Date().toISOString(),
      databaseCleanup: 'PENDING',
      integrityCheckCount: integrity.checks.length,
      inventoryPhysicalTotal: manifest.database.summary.inventoryPhysicalTotal,
      mediaFileCount: artifacts.mediaFileCount,
      migrationCount: manifest.database.summary.migrationCount,
      status: 'PASSED',
    };
  } catch (error) {
    verificationError = error;
  } finally {
    if (databaseCreated) {
      try {
        await dropDatabase(context, restoreDatabaseName);
        databaseCleanupSucceeded = true;
      } catch (cleanupError) {
        verificationError ??= cleanupError;
      }
    } else {
      databaseCleanupSucceeded = true;
    }
    try {
      if (!isPathInside(tmpdir(), extractionDirectory)) {
        verificationError ??= new Error(
          'Temporary media extraction path escaped the OS temp root.',
        );
      } else {
        rmSync(extractionDirectory, { force: true, recursive: true });
        mediaCleanupSucceeded = true;
      }
    } catch (cleanupError) {
      verificationError ??= cleanupError;
    }

    const checkedAt = new Date().toISOString();
    const passed =
      !verificationError && databaseCleanupSucceeded && mediaCleanupSucceeded;
    manifest.verification = {
      ...(manifest.verification || {}),
      checkedAt,
      databaseCleanup: databaseCleanupSucceeded ? 'PASSED' : 'FAILED',
      mediaCleanup: mediaCleanupSucceeded ? 'PASSED' : 'FAILED',
      status: passed ? 'PASSED' : 'FAILED',
    };
    writeJsonAtomic(manifestPath, manifest);
    writeJsonAtomic(resolveStatusPath(environment), {
      backupConfigured: true,
      checkedAt,
      databaseCleanupSucceeded,
      isolatedRestore: true,
      mediaCleanupSucceeded,
      result: passed ? 'PASSED' : 'FAILED',
      source: 'GUARDED_TEST_DATABASE',
    });
  }

  if (verificationError) throw verificationError;
  return {
    databaseCleanupSucceeded,
    manifest,
    mediaCleanupSucceeded,
    setDirectory,
  };
}

async function main() {
  const options = parseOperatorArguments(process.argv.slice(2));
  for (const key of Object.keys(options)) {
    if (!['backup', 'output'].includes(key)) {
      throw new Error(`Unsupported restore option: --${key}`);
    }
  }
  const result = await verifyRestore({
    backupRoot: options.output,
    existingBackup: options.backup,
  });
  console.log(`Restore verification passed: ${result.setDirectory}`);
  console.log(
    `Restored ${result.manifest.database.summary.migrationCount} migration(s), verified ${result.manifest.media.fileCount} media file(s), and removed isolated resources.`,
  );
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(`Restore verification failed: ${safeFailureMessage(error)}`);
    process.exitCode = 1;
  });
}
