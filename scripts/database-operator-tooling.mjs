import { createHash, randomBytes } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  assertSafeTestDatabase,
  parseEnvironmentFile,
} from './test-database.mjs';

export const repositoryRoot = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DATABASE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export function loadOperatorEnvironment(root = repositoryRoot) {
  let fileValues = {};
  const environmentPath = resolve(root, '.env');
  if (existsSync(environmentPath)) {
    fileValues = parseEnvironmentFile(readFileSync(environmentPath, 'utf8'));
  }
  return { ...fileValues, ...process.env };
}

export function parseOperatorArguments(argv) {
  const result = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      throw new Error(`Unsupported positional argument: ${argument}`);
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator === -1 ? undefined : separator);
    const value = separator === -1 ? 'true' : argument.slice(separator + 1);
    if (!key || Object.hasOwn(result, key)) {
      throw new Error(`Invalid or duplicate option: --${key}`);
    }
    result[key] = value;
  }
  return result;
}

export function resolveDatabaseContext(environment, sourceKind) {
  if (!['development', 'test'].includes(sourceKind)) {
    throw new Error('Database source must be development or test.');
  }

  const rawUrl =
    sourceKind === 'test'
      ? environment.TEST_DATABASE_URL
      : environment.DATABASE_URL;
  if (!rawUrl) {
    throw new Error(
      `${sourceKind === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} is required.`,
    );
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('The selected database URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Operator tooling requires PostgreSQL.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(
      'Docker operator tooling is restricted to local loopback PostgreSQL.',
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  if (!DATABASE_NAME_PATTERN.test(databaseName) || !username) {
    throw new Error('The selected database name or username is unsafe.');
  }

  if (sourceKind === 'development' && /_test$/i.test(databaseName)) {
    throw new Error(
      'A database ending in _test requires the explicit --source=test guard.',
    );
  }

  if (sourceKind === 'test') {
    assertSafeTestDatabase(environment);
  }

  return {
    databaseName,
    environment,
    service: sourceKind === 'test' ? 'postgres-test' : 'postgres',
    sourceKind,
    username,
  };
}

export function createRestoreDatabaseName(sourceDatabaseName, nonce) {
  if (!DATABASE_NAME_PATTERN.test(sourceDatabaseName)) {
    throw new Error('Unsafe restore source database name.');
  }
  const safeNonce = (nonce ?? randomBytes(6).toString('hex')).replace(
    /[^a-zA-Z0-9]/g,
    '',
  );
  const stem = sourceDatabaseName.replace(/_test$/i, '').slice(0, 35);
  const candidate = `${stem}_restore_${safeNonce}_test`;
  if (!DATABASE_NAME_PATTERN.test(candidate) || candidate.length > 63) {
    throw new Error('Could not create a safe isolated restore database name.');
  }
  return candidate;
}

export function isPathInside(parent, candidate) {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== '..' &&
      !isAbsolute(pathFromParent))
  );
}

export function assertSafeArtifactName(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value !== basename(value) ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(`Unsafe ${label}.`);
  }
  return value;
}

export function formatTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  const contents = readFileSync(filePath);
  hash.update(contents);
  return hash.digest('hex');
}

export async function sha256FileStream(filePath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', rejectPromise);
    input.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

function toPortableRelativePath(value) {
  return value.split(sep).join('/');
}

export function scanMedia(mediaRoot) {
  const resolvedRoot = resolve(mediaRoot);
  if (!existsSync(resolvedRoot)) return [];
  if (!statSync(resolvedRoot).isDirectory()) {
    throw new Error('MEDIA_STORAGE_ROOT must be a directory.');
  }

  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (!isPathInside(resolvedRoot, absolutePath)) {
        throw new Error('A media path escaped MEDIA_STORAGE_ROOT.');
      }
      const details = lstatSync(absolutePath);
      if (details.isSymbolicLink()) {
        throw new Error('Symbolic links are not allowed in media backups.');
      }
      if (details.isDirectory()) {
        walk(absolutePath);
      } else if (details.isFile()) {
        files.push({
          relativePath: toPortableRelativePath(
            relative(resolvedRoot, absolutePath),
          ),
          sha256: sha256File(absolutePath),
          size: details.size,
        });
      }
    }
  };
  walk(resolvedRoot);
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export function validateArchiveEntries(entries) {
  for (const rawEntry of entries) {
    const entry = rawEntry.trim().replace(/\\/g, '/');
    if (!entry || entry === '.' || entry === './') continue;
    const normalized = entry.replace(/^\.\//, '');
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.split('/').includes('..')
    ) {
      throw new Error('The media archive contains an unsafe path.');
    }
  }
}

export function validateArchiveEntryTypes(verboseEntries) {
  for (const line of verboseEntries) {
    if (!line.trim()) continue;
    const type = line.trimStart()[0];
    if (type !== '-' && type !== 'd')
      throw new Error(
        'The media archive contains a link or unsupported special entry.',
      );
  }
}

export function compareMediaFiles(expected, actual) {
  const expectedByPath = new Map(
    expected.map((file) => [file.relativePath, file]),
  );
  const actualByPath = new Map(actual.map((file) => [file.relativePath, file]));
  const failures = [];
  for (const [path, expectedFile] of expectedByPath) {
    const actualFile = actualByPath.get(path);
    if (!actualFile) {
      failures.push(`Missing media file: ${path}`);
    } else if (
      actualFile.size !== expectedFile.size ||
      actualFile.sha256 !== expectedFile.sha256
    ) {
      failures.push(`Media hash or size mismatch: ${path}`);
    }
  }
  for (const path of actualByPath.keys()) {
    if (!expectedByPath.has(path))
      failures.push(`Unexpected media file: ${path}`);
  }
  return failures;
}

export function writeJsonAtomic(filePath, value) {
  const resolvedPath = resolve(filePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  renameSync(temporaryPath, resolvedPath);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

export function valuesMatch(left, right) {
  return (
    JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
  );
}

export function evaluateIntegrityResults(rows) {
  const failures = rows.filter((row) => Number(row.failures) > 0);
  return {
    checks: rows.map((row) => ({
      check: String(row.check),
      failures: Number(row.failures),
    })),
    failures,
    passed: failures.length === 0,
  };
}

export function removeOwnedTemporaryPath(path, parent) {
  if (!isPathInside(parent, path) || resolve(path) === resolve(parent)) {
    throw new Error(
      'Refusing to remove a path outside the owned temporary root.',
    );
  }
  rmSync(path, { force: true, recursive: true });
}

export function createOwnedTemporaryDirectory(prefix = 'mensah-operator-') {
  return mkdtempSync(resolve(tmpdir(), prefix));
}

export async function runProcess(
  executable,
  argumentsList,
  {
    capture = false,
    cwd = repositoryRoot,
    environment = process.env,
    inputFile,
    outputFile,
  } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argumentsList, {
      cwd,
      env: environment,
      shell: false,
      stdio: [inputFile ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let outputStream;
    let childClosed = false;
    let childExitCode;
    let outputFinished = !outputFile;
    let settled = false;

    const finish = () => {
      if (settled || !childClosed || !outputFinished) return;
      settled = true;
      if (childExitCode !== 0) {
        rejectPromise(
          new Error(
            `${executable} failed with exit code ${childExitCode ?? 'unknown'}. ${stderr.toString('utf8').trim().slice(0, 800)}`,
          ),
        );
        return;
      }
      resolvePromise(stdout.toString('utf8'));
    };

    if (inputFile) {
      const input = createReadStream(inputFile);
      input.on('error', rejectPromise);
      input.pipe(child.stdin);
    }
    if (outputFile) {
      outputStream = createWriteStream(outputFile, { flags: 'wx' });
      outputStream.on('error', rejectPromise);
      outputStream.on('finish', () => {
        outputFinished = true;
        finish();
      });
      child.stdout.pipe(outputStream);
    } else if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > MAX_CAPTURE_BYTES) child.kill();
      });
    } else {
      child.stdout.resume();
    }
    child.stderr.on('data', (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > MAX_CAPTURE_BYTES) child.kill();
    });
    child.on('error', (error) => {
      settled = true;
      rejectPromise(error);
    });
    child.on('close', (code) => {
      childClosed = true;
      childExitCode = code;
      finish();
    });
  });
}

export async function runDockerPsql(context, sql, databaseName) {
  const selectedDatabase = databaseName ?? context.databaseName;
  if (!DATABASE_NAME_PATTERN.test(selectedDatabase)) {
    throw new Error('Unsafe database name for PostgreSQL query.');
  }
  return (
    await runProcess(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        context.service,
        'psql',
        '--no-psqlrc',
        '--quiet',
        '--tuples-only',
        '--no-align',
        '--username',
        context.username,
        '--dbname',
        selectedDatabase,
        '--command',
        sql,
      ],
      { capture: true, environment: context.environment },
    )
  ).trim();
}

export async function readApplicationCommit(environment) {
  if (environment.APP_VERSION?.trim()) return environment.APP_VERSION.trim();
  try {
    return (
      await runProcess(
        'git',
        [
          '-c',
          `safe.directory=${repositoryRoot.replace(/\\/g, '/')}`,
          'rev-parse',
          'HEAD',
        ],
        { capture: true, environment },
      )
    ).trim();
  } catch {
    return 'unknown';
  }
}

export function safeFailureMessage(error) {
  if (!(error instanceof Error)) return 'Operator command failed.';
  return error.message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[redacted]');
}
