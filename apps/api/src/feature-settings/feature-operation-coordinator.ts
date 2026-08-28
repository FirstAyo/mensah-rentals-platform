import { Injectable } from '@nestjs/common';

type Release = () => void;

@Injectable()
export class FeatureOperationCoordinator {
  private readers = 0;
  private writer = false;
  private readonly readerQueue: Array<(release: Release) => void> = [];
  private readonly writerQueue: Array<() => void> = [];

  acquireRead(): Promise<Release> {
    if (!this.writer && this.writerQueue.length === 0) {
      this.readers += 1;
      return Promise.resolve(this.readRelease());
    }
    return new Promise((resolve) => this.readerQueue.push(resolve));
  }

  async withWrite<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await operation();
    } finally {
      this.writer = false;
      this.drain();
    }
  }

  private acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.writerQueue.push(resolve));
  }

  private readRelease(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.readers -= 1;
      this.drain();
    };
  }

  private drain() {
    if (this.writer || this.readers > 0) return;
    const writer = this.writerQueue.shift();
    if (writer) {
      this.writer = true;
      writer();
      return;
    }
    while (this.readerQueue.length) {
      const reader = this.readerQueue.shift();
      if (!reader) continue;
      this.readers += 1;
      reader(this.readRelease());
    }
  }
}
