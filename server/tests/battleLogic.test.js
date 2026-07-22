import { describe, it, expect } from 'vitest';
import {
  resolveBattle, completedPointsEvents, unansweredPointsEvents, declinePointsEvents,
} from '../src/battleLogic.js';
import { POINTS } from '../src/config.js';

const r = (correct, durationMs) => ({ correct, durationMs });
const find = (events, who, reason) =>
  events.find((e) => e.who === who && e.reason === reason);

describe('resolveBattle', () => {
  it('higher correct count wins', () => {
    expect(resolveBattle(r(8, 100), r(6, 50))).toBe('challenger');
    expect(resolveBattle(r(3, 100), r(6, 500))).toBe('opponent');
  });
  it('ties broken by lower duration', () => {
    expect(resolveBattle(r(7, 90_000), r(7, 120_000))).toBe('challenger');
    expect(resolveBattle(r(7, 120_000), r(7, 90_000))).toBe('opponent');
  });
  it('identical score and duration is a draw', () => {
    expect(resolveBattle(r(7, 90_000), r(7, 90_000))).toBe('draw');
  });
});

describe('completedPointsEvents', () => {
  it('win/loss + per-correct points', () => {
    const ev = completedPointsEvents('challenger', r(8, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_win').amount).toBe(POINTS.battleWin);
    expect(find(ev, 'opponent', 'battle_loss').amount).toBe(POINTS.battleLoss);
    expect(find(ev, 'challenger', 'battle_correct').amount).toBe(8 * POINTS.battleCorrect);
    expect(find(ev, 'opponent', 'battle_correct').amount).toBe(5 * POINTS.battleCorrect);
  });
  it('draw gives both draw points', () => {
    const ev = completedPointsEvents('draw', r(5, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_draw').amount).toBe(POINTS.battleDraw);
    expect(find(ev, 'opponent', 'battle_draw').amount).toBe(POINTS.battleDraw);
  });
  it('zero correct answers produce no battle_correct event', () => {
    const ev = completedPointsEvents('opponent', r(0, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_correct')).toBeUndefined();
  });
});

describe('unansweredPointsEvents', () => {
  it('rewards the side that played, penalizes the idle side', () => {
    const ev = unansweredPointsEvents(true, false);
    expect(find(ev, 'challenger', 'battle_expired_bonus').amount).toBe(POINTS.battleExpiredBonus);
    expect(find(ev, 'opponent', 'battle_expired_penalty').amount).toBe(POINTS.battleExpiredPenalty);
  });
  it('is symmetric', () => {
    const ev = unansweredPointsEvents(false, true);
    expect(find(ev, 'opponent', 'battle_expired_bonus')).toBeTruthy();
    expect(find(ev, 'challenger', 'battle_expired_penalty')).toBeTruthy();
  });
  it('gives nothing when neither (or both) submitted', () => {
    expect(unansweredPointsEvents(false, false)).toEqual([]);
    expect(unansweredPointsEvents(true, true)).toEqual([]);
  });
});

describe('declinePointsEvents', () => {
  it('always bonus to challenger, penalty to decliner', () => {
    const ev = declinePointsEvents();
    expect(find(ev, 'challenger', 'battle_expired_bonus').amount).toBe(POINTS.battleExpiredBonus);
    expect(find(ev, 'opponent', 'battle_expired_penalty').amount).toBe(POINTS.battleExpiredPenalty);
  });
});
