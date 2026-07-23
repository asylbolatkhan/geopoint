import { describe, it, expect } from 'vitest';
import { monthKey, prevMonthKey } from '../src/points.js';

describe('monthKey (Asia/Almaty, UTC+5)', () => {
  it('formats as YYYY-MM', () => {
    expect(monthKey(new Date('2026-07-22T10:00:00Z'))).toBe('2026-07');
  });
  it('rolls over at the Almaty month boundary, not UTC', () => {
    // 31 Dec 19:30 UTC = 1 Jan 00:30 Almaty
    expect(monthKey(new Date('2025-12-31T19:30:00Z'))).toBe('2026-01');
    expect(monthKey(new Date('2025-12-31T18:30:00Z'))).toBe('2025-12');
  });
});

describe('prevMonthKey', () => {
  it('returns the previous month within the same year', () => {
    expect(prevMonthKey('2026-07')).toBe('2026-06');
  });
  it('rolls back across a year boundary', () => {
    expect(prevMonthKey('2026-01')).toBe('2025-12');
  });
  it('pads single-digit months', () => {
    expect(prevMonthKey('2026-10')).toBe('2026-09');
  });
});
