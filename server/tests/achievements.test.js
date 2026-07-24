import { describe, it, expect } from 'vitest';
import { computeStreak, computeAchievements } from '../src/achievements.js';

describe('computeStreak', () => {
  it('returns {0,0} for an empty array', () => {
    expect(computeStreak([], '2026-07-22')).toEqual({ current: 0, best: 0 });
  });

  it('anchors current streak on today', () => {
    expect(computeStreak(['2026-07-20', '2026-07-21', '2026-07-22'], '2026-07-22')).toEqual({
      current: 3,
      best: 3,
    });
  });

  it('anchors current streak on yesterday', () => {
    expect(computeStreak(['2026-07-19', '2026-07-20', '2026-07-21'], '2026-07-22')).toEqual({
      current: 3,
      best: 3,
    });
  });

  it('current is 0 when the last active day is older than yesterday, but best survives', () => {
    expect(computeStreak(['2026-07-18', '2026-07-19'], '2026-07-22')).toEqual({ current: 0, best: 2 });
  });

  it('handles a gap: best keeps the longest run, current only the run touching today', () => {
    const keys = [
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
    ];
    expect(computeStreak(keys, '2026-07-17')).toEqual({ current: 4, best: 4 });
  });

  it('best can come from an earlier run while current is broken', () => {
    const keys = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-10'];
    expect(computeStreak(keys, '2026-07-15')).toEqual({ current: 0, best: 4 });
  });

  it('crosses the month/year boundary via day numbers, not local Date parsing', () => {
    expect(computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01')).toEqual({
      current: 3,
      best: 3,
    });
  });

  it('ignores keys in the future relative to todayKey', () => {
    expect(computeStreak(['2026-07-22', '2026-07-23'], '2026-07-22')).toEqual({ current: 1, best: 1 });
  });

  it('tolerates unsorted/duplicate input', () => {
    expect(computeStreak(['2026-07-22', '2026-07-20', '2026-07-21', '2026-07-21'], '2026-07-22')).toEqual({
      current: 3,
      best: 3,
    });
  });
});

describe('computeAchievements', () => {
  const base = { wins: 0, soloCompleted: 0, hasPerfectGame: false, bestStreak: 0, totalPoints: 0 };

  it('returns exactly 7 badges in the fixed order', () => {
    const result = computeAchievements(base);
    expect(result.map((b) => b.key)).toEqual([
      'firstWin',
      'wins10',
      'solo50',
      'perfect',
      'streak3',
      'streak7',
      'points500',
    ]);
    expect(result).toHaveLength(7);
    expect(result.every((b) => typeof b.unlocked === 'boolean')).toBe(true);
  });

  it('firstWin unlocks at wins=1, not at 0', () => {
    expect(computeAchievements({ ...base, wins: 0 }).find((b) => b.key === 'firstWin').unlocked).toBe(false);
    expect(computeAchievements({ ...base, wins: 1 }).find((b) => b.key === 'firstWin').unlocked).toBe(true);
  });

  it('wins10 unlocks at wins=10, not at 9', () => {
    expect(computeAchievements({ ...base, wins: 9 }).find((b) => b.key === 'wins10').unlocked).toBe(false);
    expect(computeAchievements({ ...base, wins: 10 }).find((b) => b.key === 'wins10').unlocked).toBe(true);
  });

  it('solo50 unlocks at soloCompleted=50, not at 49', () => {
    expect(computeAchievements({ ...base, soloCompleted: 49 }).find((b) => b.key === 'solo50').unlocked).toBe(
      false
    );
    expect(computeAchievements({ ...base, soloCompleted: 50 }).find((b) => b.key === 'solo50').unlocked).toBe(
      true
    );
  });

  it('perfect reflects hasPerfectGame', () => {
    expect(computeAchievements({ ...base, hasPerfectGame: false }).find((b) => b.key === 'perfect').unlocked).toBe(
      false
    );
    expect(computeAchievements({ ...base, hasPerfectGame: true }).find((b) => b.key === 'perfect').unlocked).toBe(
      true
    );
  });

  it('streak3 unlocks at bestStreak=3, not at 2', () => {
    expect(computeAchievements({ ...base, bestStreak: 2 }).find((b) => b.key === 'streak3').unlocked).toBe(false);
    expect(computeAchievements({ ...base, bestStreak: 3 }).find((b) => b.key === 'streak3').unlocked).toBe(true);
  });

  it('streak7 unlocks at bestStreak=7, not at 6', () => {
    expect(computeAchievements({ ...base, bestStreak: 6 }).find((b) => b.key === 'streak7').unlocked).toBe(false);
    expect(computeAchievements({ ...base, bestStreak: 7 }).find((b) => b.key === 'streak7').unlocked).toBe(true);
  });

  it('points500 unlocks at totalPoints=500, not at 499', () => {
    expect(computeAchievements({ ...base, totalPoints: 499 }).find((b) => b.key === 'points500').unlocked).toBe(
      false
    );
    expect(computeAchievements({ ...base, totalPoints: 500 }).find((b) => b.key === 'points500').unlocked).toBe(
      true
    );
  });

  it('streak badges key off bestStreak so they stay unlocked regardless of current streak', () => {
    const result = computeAchievements({ ...base, bestStreak: 7 });
    expect(result.find((b) => b.key === 'streak3').unlocked).toBe(true);
    expect(result.find((b) => b.key === 'streak7').unlocked).toBe(true);
  });
});
