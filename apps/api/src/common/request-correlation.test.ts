import { describe, expect, it } from 'vitest';

import { selectRequestId } from './request-correlation';

describe('request correlation IDs', () => {
  it('uses a bounded safe upstream identifier only when explicitly trusted', () => {
    expect(selectRequestId('edge:abc-123', true)).toBe('edge:abc-123');
    expect(selectRequestId('edge:abc-123', false)).not.toBe('edge:abc-123');
  });

  it.each(['', ' leading', 'line\nbreak', 'x'.repeat(129)])(
    'replaces unsafe input %j',
    (value) => {
      expect(selectRequestId(value, true)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );

  it('does not accept ambiguous repeated headers', () => {
    expect(selectRequestId(['one', 'two'], true)).not.toBe('one');
  });
});
