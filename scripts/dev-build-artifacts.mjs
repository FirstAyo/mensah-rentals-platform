import { rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export async function clearNextBuildArtifacts({
  appNames = ['web', 'admin'],
  repositoryRoot,
}) {
  const appsRoot = resolve(repositoryRoot, 'apps');

  for (const appName of appNames) {
    if (!/^[a-z][a-z0-9-]*$/.test(appName))
      throw new Error(`Unsafe application name: ${appName}`);

    const appRoot = resolve(appsRoot, appName);
    const target = resolve(appRoot, '.next');
    if (dirname(target) !== appRoot || basename(target) !== '.next')
      throw new Error(`Refusing to clear an unsafe build path: ${target}`);

    await rm(target, { force: true, recursive: true });
  }
}

export async function assertDevelopmentTargetsAreFree({
  fetcher = fetch,
  targets,
}) {
  const occupied = [];
  for (const target of targets) {
    try {
      await fetcher(target, { signal: AbortSignal.timeout(1_000) });
      occupied.push(target);
    } catch {
      // A connection failure is the expected result before local startup.
    }
  }
  if (occupied.length > 0)
    throw new Error(
      `Local development is already running at ${occupied.join(', ')}. Stop those processes before running pnpm dev:safe.`,
    );
}
