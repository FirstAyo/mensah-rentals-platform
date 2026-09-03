import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertSafeArtifactName,
  compareMediaFiles,
  formatTimestamp,
  loadOperatorEnvironment,
  parseOperatorArguments,
  repositoryRoot,
  runProcess,
  scanMedia,
  sha256File,
  validateArchiveEntries,
  validateArchiveEntryTypes,
  writeJsonAtomic,
} from './database-operator-tooling.mjs';

const require = createRequire(
  resolve(repositoryRoot, 'packages/database/package.json'),
);
const { PrismaClient } = require('@prisma/client');

export const TRANSFER_FORMAT = 1;
export const CONTENT_MODELS = Object.freeze([
  'category',
  'product',
  'productImage',
  'productSpecification',
  'homepageMedia',
  'homepageSite',
  'homepageRevision',
  'homepageFeaturedCategory',
  'homepageFeaturedProduct',
  'homepageMediaPlacement',
  'publicPage',
  'publicPageRevision',
  'publicPageMediaPlacement',
  'categoryCover',
  'platformFeatureSetting',
]);

export const FORBIDDEN_TRANSFER_KEYS = new Set([
  'actorUserId',
  'assignedById',
  'capabilityHash',
  'createdByUserId',
  'operationId',
  'passwordHash',
  'payloadHash',
  'publishedByUserId',
  'sessionToken',
  'tokenHash',
  'updatedByUserId',
]);

const DATE_KEYS = new Set([
  'createdAt',
  'deletedAt',
  'publishedAt',
  'updatedAt',
]);

function environmentDatabaseUrl(environment) {
  const raw = environment.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required.');
  return raw;
}

export function assertDevelopmentExportEnvironment(environment) {
  const url = new URL(environmentDatabaseUrl(environment));
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase()))
    throw new Error('Public-content export is restricted to local PostgreSQL.');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || /_test$/i.test(database))
    throw new Error(
      'Export requires the local development database, not test.',
    );
}

export function assertStagingImportEnvironment(environment) {
  if (
    environment.NODE_ENV !== 'production' ||
    environment.PLATFORM_ENVIRONMENT !== 'STAGING' ||
    environment.CONTENT_IMPORT_CONFIRM_ENVIRONMENT !== 'STAGING'
  ) {
    throw new Error(
      'Import requires NODE_ENV=production and explicit STAGING confirmation.',
    );
  }
}

export function stripKeys(value) {
  if (Array.isArray(value)) return value.map(stripKeys);
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_TRANSFER_KEYS.has(key))
        .map(([key, nested]) => [key, stripKeys(nested)]),
    );
  }
  return value;
}

export function filterTransferContent(rawContent) {
  const content = Object.fromEntries(
    CONTENT_MODELS.map((model) => [model, [...(rawContent[model] ?? [])]]),
  );
  content.category = content.category.filter((row) => row.deletedAt == null);
  const categoryIds = new Set(content.category.map((row) => row.id));
  content.product = content.product.filter(
    (row) => row.deletedAt == null && categoryIds.has(row.categoryId),
  );
  const productIds = new Set(content.product.map((row) => row.id));
  content.productImage = content.productImage.filter((row) =>
    productIds.has(row.productId),
  );
  content.productSpecification = content.productSpecification.filter((row) =>
    productIds.has(row.productId),
  );
  const productImageIds = new Set(content.productImage.map((row) => row.id));
  content.homepageFeaturedCategory = content.homepageFeaturedCategory
    .filter((row) => categoryIds.has(row.categoryId))
    .map((row) => ({
      ...row,
      coverProductImageId:
        row.coverProductImageId && productImageIds.has(row.coverProductImageId)
          ? row.coverProductImageId
          : null,
    }));
  content.homepageFeaturedProduct = content.homepageFeaturedProduct.filter(
    (row) => productIds.has(row.productId),
  );
  content.homepageMediaPlacement = content.homepageMediaPlacement.filter(
    (row) =>
      row.productImageId == null || productImageIds.has(row.productImageId),
  );
  content.publicPageMediaPlacement = content.publicPageMediaPlacement.filter(
    (row) =>
      row.productImageId == null || productImageIds.has(row.productImageId),
  );
  content.categoryCover = content.categoryCover
    .filter((row) => categoryIds.has(row.categoryId))
    .map((row) => ({
      ...row,
      productImageId:
        row.productImageId && productImageIds.has(row.productImageId)
          ? row.productImageId
          : null,
    }));
  return content;
}

function localMediaRelativePath(url) {
  if (typeof url !== 'string') throw new Error('Media URL must be a string.');
  if (!url.startsWith('/media/')) return null;
  const relativePath = url.slice('/media/'.length);
  validateArchiveEntries([relativePath]);
  if (!relativePath || relativePath.includes('\\'))
    throw new Error('A local media URL contains an unsafe path.');
  return relativePath;
}

export function collectLocalMediaPaths(content) {
  return [
    ...content.productImage.map((row) => row.url),
    ...content.homepageMedia.map((row) => row.url),
  ]
    .map(localMediaRelativePath)
    .filter(Boolean)
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort((left, right) => left.localeCompare(right));
}

export function assertNoForbiddenKeys(value, path = 'content') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_TRANSFER_KEYS.has(key))
      throw new Error(`Forbidden transfer field at ${path}.${key}.`);
    assertNoForbiddenKeys(nested, `${path}.${key}`);
  }
}

function reviveRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      DATE_KEYS.has(key) && value ? new Date(value) : value,
    ]),
  );
}

export function transferCounts(content) {
  return Object.fromEntries(
    CONTENT_MODELS.map((model) => [model, content[model]?.length ?? 0]),
  );
}

export function assertExactContentModels(content) {
  const actual = Object.keys(content).sort();
  const expected = [...CONTENT_MODELS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Transfer content model allowlist does not match.');
}

async function readContent(prisma) {
  const content = {};
  for (const model of CONTENT_MODELS) {
    content[model] = await prisma[model].findMany();
  }
  const sanitized = stripKeys(filterTransferContent(content));
  assertNoForbiddenKeys(sanitized);
  return sanitized;
}

async function createMediaArchive(mediaRoot, archivePath, relativePaths) {
  if (!existsSync(mediaRoot)) mkdirSync(mediaRoot, { recursive: true });
  const listPath = `${archivePath}.files`;
  writeFileSync(listPath, relativePaths.join('\n'), { encoding: 'utf8' });
  try {
    await runProcess('tar', [
      '-czf',
      archivePath,
      '-C',
      mediaRoot,
      '-T',
      listPath,
    ]);
  } finally {
    unlinkSync(listPath);
  }
}

async function exportContent(environment, outputRoot) {
  assertDevelopmentExportEnvironment(environment);
  const root = resolve(repositoryRoot, outputRoot || '.local-transfers');
  mkdirSync(root, { recursive: true });
  const setDirectory = resolve(root, `${formatTimestamp()}-public-content`);
  mkdirSync(setDirectory, { recursive: false });
  const contentPath = resolve(setDirectory, 'content.json');
  const mediaPath = resolve(setDirectory, 'media.tar.gz');
  const manifestPath = resolve(setDirectory, 'manifest.json');
  const mediaRoot = resolve(
    repositoryRoot,
    environment.MEDIA_STORAGE_ROOT || 'storage/media',
  );
  const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
  try {
    const content = await readContent(prisma);
    writeJsonAtomic(contentPath, content);
    const mediaPaths = collectLocalMediaPaths(content);
    const mediaByPath = new Map(
      scanMedia(mediaRoot).map((file) => [file.relativePath, file]),
    );
    const mediaFiles = mediaPaths.map((path) => {
      const file = mediaByPath.get(path);
      if (!file) throw new Error(`Referenced media file is missing: ${path}`);
      return file;
    });
    await createMediaArchive(mediaRoot, mediaPath, mediaPaths);
    const mediaAfterByPath = new Map(
      scanMedia(mediaRoot).map((file) => [file.relativePath, file]),
    );
    const mediaAfter = mediaPaths.map((path) => mediaAfterByPath.get(path));
    if (JSON.stringify(mediaFiles) !== JSON.stringify(mediaAfter))
      throw new Error('Media changed while the transfer was being created.');
    const manifest = {
      formatVersion: TRANSFER_FORMAT,
      kind: 'PUBLIC_CONTENT_ONLY',
      createdAt: new Date().toISOString(),
      content: {
        filename: basename(contentPath),
        sha256: sha256File(contentPath),
        counts: transferCounts(content),
      },
      media: {
        filename: basename(mediaPath),
        sha256: sha256File(mediaPath),
        fileCount: mediaFiles.length,
        files: mediaFiles,
      },
      exclusions: [
        'users-and-authentication',
        'customers-and-contact-enquiries',
        'carts-and-rental-workflows',
        'inventory-and-reservations',
        'reports-audit-and-operational-history',
      ],
    };
    writeJsonAtomic(manifestPath, manifest);
    return { manifest, setDirectory };
  } catch (error) {
    rmSync(setDirectory, { force: true, recursive: true });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function inspectBundle(bundlePath) {
  const directory = resolve(bundlePath);
  const manifestPath = resolve(directory, 'manifest.json');
  if (!existsSync(manifestPath))
    throw new Error('Transfer manifest not found.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    manifest.formatVersion !== TRANSFER_FORMAT ||
    manifest.kind !== 'PUBLIC_CONTENT_ONLY'
  )
    throw new Error('Unsupported transfer bundle.');
  assertSafeArtifactName(manifest.content.filename, 'content filename');
  assertSafeArtifactName(manifest.media.filename, 'media filename');
  const contentPath = resolve(directory, manifest.content.filename);
  const mediaPath = resolve(directory, manifest.media.filename);
  if (!existsSync(contentPath) || !existsSync(mediaPath))
    throw new Error('Transfer artifact is missing.');
  if (
    sha256File(contentPath) !== manifest.content.sha256 ||
    sha256File(mediaPath) !== manifest.media.sha256
  )
    throw new Error('Transfer artifact hash mismatch.');
  const content = JSON.parse(readFileSync(contentPath, 'utf8'));
  assertExactContentModels(content);
  assertNoForbiddenKeys(content);
  if (
    JSON.stringify(transferCounts(content)) !==
    JSON.stringify(manifest.content.counts)
  )
    throw new Error('Transfer content counts do not match the manifest.');
  const entries = (
    await runProcess('tar', ['-tzf', mediaPath], { capture: true })
  )
    .split(/\r?\n/)
    .filter(Boolean);
  validateArchiveEntries(entries);
  const verbose = (
    await runProcess('tar', ['-tvzf', mediaPath], { capture: true })
  )
    .split(/\r?\n/)
    .filter(Boolean);
  validateArchiveEntryTypes(verbose);
  return { content, directory, manifest, mediaPath };
}

async function ensureEmptyTarget(tx) {
  const checked = CONTENT_MODELS.filter(
    (model) => model !== 'platformFeatureSetting',
  );
  const counts = await Promise.all(checked.map((model) => tx[model].count()));
  const occupied = checked.filter((_, index) => counts[index] !== 0);
  if (occupied.length)
    throw new Error(
      `Target public-content tables are not empty: ${occupied.join(', ')}.`,
    );
}

async function importContent(environment, bundlePath) {
  assertStagingImportEnvironment(environment);
  const { content, manifest } = await inspectBundle(bundlePath);
  const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
  try {
    const actor = await prisma.user.findUnique({
      where: {
        email: environment.CONTENT_IMPORT_ACTOR_EMAIL?.trim().toLowerCase(),
      },
      include: { roles: { include: { role: true } } },
    });
    if (
      !actor ||
      actor.status !== 'ACTIVE' ||
      !actor.roles.some((assignment) => assignment.role.name === 'SUPER_ADMIN')
    )
      throw new Error('Import actor must be an active staging SUPER_ADMIN.');

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${2_026_090_203})`;
        await ensureEmptyTarget(tx);
        for (const model of [
          'category',
          'product',
          'productImage',
          'productSpecification',
        ]) {
          if (content[model].length)
            await tx[model].createMany({ data: content[model].map(reviveRow) });
        }
        if (content.homepageMedia.length)
          await tx.homepageMedia.createMany({
            data: content.homepageMedia.map((row) => ({
              ...reviveRow(row),
              createdByUserId: actor.id,
            })),
          });
        if (content.homepageSite.length)
          await tx.homepageSite.createMany({
            data: content.homepageSite.map((row) => ({
              ...reviveRow(row),
              draftRevisionId: null,
              publishedRevisionId: null,
            })),
          });
        for (const row of [...content.homepageRevision].sort(
          (left, right) => left.version - right.version,
        )) {
          await tx.homepageRevision.create({
            data: {
              ...reviveRow(row),
              basedOnRevisionId: null,
              restoredFromRevisionId: null,
              operationId: null,
              payloadHash: null,
              createdByUserId: actor.id,
              publishedByUserId: row.publishedAt ? actor.id : null,
            },
          });
        }
        for (const model of [
          'homepageFeaturedCategory',
          'homepageFeaturedProduct',
          'homepageMediaPlacement',
        ]) {
          if (content[model].length)
            await tx[model].createMany({ data: content[model].map(reviveRow) });
        }
        for (const row of content.homepageSite)
          await tx.homepageSite.update({
            where: { id: row.id },
            data: {
              draftRevisionId: row.draftRevisionId,
              publishedRevisionId: row.publishedRevisionId,
            },
          });

        if (content.publicPage.length)
          await tx.publicPage.createMany({
            data: content.publicPage.map((row) => ({
              ...reviveRow(row),
              draftRevisionId: null,
              publishedRevisionId: null,
            })),
          });
        for (const row of [...content.publicPageRevision].sort(
          (left, right) => left.version - right.version,
        )) {
          await tx.publicPageRevision.create({
            data: {
              ...reviveRow(row),
              basedOnRevisionId: null,
              restoredFromRevisionId: null,
              operationId: null,
              payloadHash: null,
              createdByUserId: null,
              publishedByUserId: null,
            },
          });
        }
        if (content.publicPageMediaPlacement.length)
          await tx.publicPageMediaPlacement.createMany({
            data: content.publicPageMediaPlacement.map(reviveRow),
          });
        for (const row of content.publicPage)
          await tx.publicPage.update({
            where: { id: row.id },
            data: {
              draftRevisionId: row.draftRevisionId,
              publishedRevisionId: row.publishedRevisionId,
            },
          });
        if (content.categoryCover.length)
          await tx.categoryCover.createMany({
            data: content.categoryCover.map((row) => ({
              ...reviveRow(row),
              updatedByUserId: actor.id,
            })),
          });
        for (const row of content.platformFeatureSetting)
          await tx.platformFeatureSetting.upsert({
            where: { key: row.key },
            create: { ...reviveRow(row), updatedByUserId: null },
            update: {
              state: row.state,
              version: row.version,
              updatedByUserId: null,
            },
          });
      },
      { isolationLevel: 'Serializable', timeout: 120_000 },
    );
    const imported = await readContent(prisma);
    const counts = transferCounts(imported);
    if (JSON.stringify(counts) !== JSON.stringify(manifest.content.counts))
      throw new Error('Post-import public-content counts do not match.');
    return { counts, media: manifest.media };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseOperatorArguments(process.argv.slice(2));
  const mode = options.mode;
  const environment = loadOperatorEnvironment();
  if (mode === 'export') {
    const result = await exportContent(environment, options.output);
    console.log(`Public-content transfer created: ${result.setDirectory}`);
    console.log(JSON.stringify(result.manifest.content.counts));
    console.log(`Media files packaged: ${result.manifest.media.fileCount}`);
    return;
  }
  if (!options.bundle) throw new Error('--bundle is required.');
  if (mode === 'inspect') {
    const result = await inspectBundle(options.bundle);
    console.log('Public-content transfer inspection passed.');
    console.log(JSON.stringify(result.manifest.content.counts));
    console.log(
      `Media files verified in archive: ${result.manifest.media.fileCount}`,
    );
    return;
  }
  if (mode === 'verify-media') {
    const result = await inspectBundle(options.bundle);
    if (!options['media-root']) throw new Error('--media-root is required.');
    const actual = scanMedia(resolve(options['media-root']));
    const failures = compareMediaFiles(result.manifest.media.files, actual);
    if (failures.length) throw new Error(failures.slice(0, 5).join('; '));
    console.log(
      `Media verification passed: ${actual.length} file(s), with exact paths, sizes, and SHA-256 hashes.`,
    );
    return;
  }
  if (mode === 'import') {
    const result = await importContent(environment, options.bundle);
    console.log('STAGING public-content database import passed.');
    console.log(JSON.stringify(result.counts));
    console.log(`Expected media files: ${result.media.fileCount}`);
    return;
  }
  throw new Error('Mode must be export, inspect, or import.');
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain)
  main().catch((error) => {
    console.error(
      `Public-content transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    process.exitCode = 1;
  });
