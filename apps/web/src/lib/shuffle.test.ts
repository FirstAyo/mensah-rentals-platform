import { describe, expect, it } from 'vitest';
import { shuffled } from './shuffle';

describe('shuffled', () => {
  it('is stable for one seed and varies between seeds without mutating input', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffled(source, 123)).toEqual(shuffled(source, 123));
    expect(shuffled(source, 123)).not.toEqual(shuffled(source, 456));
    expect(source).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
