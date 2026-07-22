import { describe, it, expect } from 'vitest';
import { seededShuffle } from '../src/random.js';

describe('seededShuffle', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42));
  });

  it('returns a permutation without mutating the input', () => {
    const copy = [...arr];
    const out = seededShuffle(arr, 7);
    expect(arr).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it('differs between seeds (for this input)', () => {
    expect(seededShuffle(arr, 1)).not.toEqual(seededShuffle(arr, 2));
  });
});
