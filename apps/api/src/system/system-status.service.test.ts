import { afterEach, describe, expect, it } from 'vitest';

import { SystemStatusService } from './system-status.service';

describe('system status safety', () => {
  const previousVersion = process.env.APP_VERSION;
  const previousCommit = process.env.APP_COMMIT_SHA;

  afterEach(() => {
    process.env.APP_VERSION = previousVersion;
    process.env.APP_COMMIT_SHA = previousCommit;
  });

  it('does not return unsafe configured build values', async () => {
    process.env.APP_VERSION = 'secret\nvalue';
    process.env.APP_COMMIT_SHA = '/internal/path';
    const service = new SystemStatusService();
    // Exercise the private pure boundary without requiring a database fixture.
    expect(
      (
        service as unknown as { safeBuildValue(value?: string): string | null }
      ).safeBuildValue(process.env.APP_VERSION),
    ).toBeNull();
  });
});
