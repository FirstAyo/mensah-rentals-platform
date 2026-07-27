import { HttpException } from '@nestjs/common';

interface Counter {
  count: number;
  resetsAt: number;
}

const MAX_COUNTERS = 20_000;

export class BoundedRateLimitStore {
  private readonly counters = new Map<string, Counter>();

  consume(
    key: string,
    limit: number,
    windowSeconds: number,
    message: string,
    now = Date.now(),
  ): void {
    const current = this.counters.get(key);
    if (!current || current.resetsAt <= now) {
      if (!current && this.counters.size >= MAX_COUNTERS) {
        for (const [storedKey, counter] of this.counters)
          if (counter.resetsAt <= now) this.counters.delete(storedKey);
      }
      if (!current && this.counters.size >= MAX_COUNTERS)
        this.tooManyRequests(message);
      this.counters.set(key, {
        count: 1,
        resetsAt: now + windowSeconds * 1000,
      });
      return;
    }
    current.count += 1;
    if (current.count > limit) this.tooManyRequests(message);
  }

  private tooManyRequests(message: string): never {
    throw new HttpException({ message }, 429);
  }
}
