import { describe, expect, it, vi } from 'vitest';

import { FeatureOperationCoordinator } from './feature-operation-coordinator';

describe('FeatureOperationCoordinator', () => {
  it('waits for an in-flight feature request before changing settings', async () => {
    const coordinator = new FeatureOperationCoordinator();
    const release = await coordinator.acquireRead();
    const write = vi.fn();
    const pending = coordinator.withWrite(async () => write());
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
    release();
    await pending;
    expect(write).toHaveBeenCalledOnce();
  });

  it('does not admit a new request while a setting change is waiting', async () => {
    const coordinator = new FeatureOperationCoordinator();
    const firstRelease = await coordinator.acquireRead();
    let finishWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    const write = coordinator.withWrite(() => writeStarted);
    const secondRead = coordinator.acquireRead();
    firstRelease();
    await Promise.resolve();
    let admitted = false;
    void secondRead.then(() => {
      admitted = true;
    });
    expect(admitted).toBe(false);
    finishWrite();
    await write;
    const secondRelease = await secondRead;
    secondRelease();
  });
});
