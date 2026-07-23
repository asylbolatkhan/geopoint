import { describe, it, expect } from 'vitest';
import { validAnswerValue, mergeAnswers } from '../src/soloProgress.js';

describe('validAnswerValue', () => {
  it('accepts null and integers 0..3', () => {
    expect(validAnswerValue(null)).toBe(true);
    expect(validAnswerValue(0)).toBe(true);
    expect(validAnswerValue(3)).toBe(true);
  });
  it('rejects out-of-range or non-integer values', () => {
    expect(validAnswerValue(-1)).toBe(false);
    expect(validAnswerValue(4)).toBe(false);
    expect(validAnswerValue(1.5)).toBe(false);
    expect(validAnswerValue('1')).toBe(false);
    expect(validAnswerValue(undefined)).toBe(false);
  });
});

describe('mergeAnswers', () => {
  it('stored value wins over a conflicting client value (anti-cheat)', () => {
    const progress = { 0: 2 };
    const result = mergeAnswers(3, progress, [1, 1, 1]);
    expect(result[0]).toBe(2);
  });

  it('stored null (timeout) stays null even when client sends an int', () => {
    const progress = { 0: null };
    const result = mergeAnswers(3, progress, [1, 1, 1]);
    expect(result[0]).toBeNull();
  });

  it('index missing in both progress and clientAnswers is null', () => {
    const result = mergeAnswers(3, {}, undefined);
    expect(result).toEqual([null, null, null]);
  });

  it('out-of-range/garbage client values become null', () => {
    const result = mergeAnswers(2, {}, [7, 'x']);
    expect(result).toEqual([null, null]);
  });

  it('garbage stored values become null', () => {
    const progress = { 0: 99, 1: 'bad' };
    const result = mergeAnswers(2, progress, [1, 1]);
    expect(result).toEqual([null, null]);
  });

  it('works when clientAnswers is undefined', () => {
    const progress = { 0: 1 };
    const result = mergeAnswers(2, progress, undefined);
    expect(result).toEqual([1, null]);
  });

  it('result length always equals total', () => {
    expect(mergeAnswers(5, {}, []).length).toBe(5);
    expect(mergeAnswers(0, {}, []).length).toBe(0);
  });
});
