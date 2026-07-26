import { describe, it, expect } from 'vitest';
import {
  resolveBattle, completedPointsEvents, unansweredPointsEvents, declinePointsEvents,
  challengeEligibility,
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

describe('challengeEligibility', () => {
  it('student -> student is ok', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'student', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('teacher -> teacher is ok', () => {
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'teacher', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('teacher -> student is ok', () => {
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'student', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('admin -> teacher is ok', () => {
    expect(challengeEligibility({ challengerRole: 'admin', opponentRole: 'teacher', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('admin -> student is ok', () => {
    expect(challengeEligibility({ challengerRole: 'admin', opponentRole: 'student', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('student -> teacher: ok when challenger is top-3 of previous month', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'teacher', challengerIsTop: true, sameSchool: true })).toBe('ok');
  });
  it('student -> teacher: not eligible when challenger is not top-3', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'teacher', challengerIsTop: false, sameSchool: true }))
      .toBe('not_eligible_teacher_battle');
  });
  it('anyone -> admin is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'admin', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'admin', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'admin', opponentRole: 'admin', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
  });

  it('student -> student cross-school is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'student', challengerIsTop: false, sameSchool: false })).toBe('bad_opponent');
  });
  it('teacher -> student cross-school is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'student', challengerIsTop: false, sameSchool: false })).toBe('bad_opponent');
  });
  it('teacher -> teacher cross-school is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'teacher', challengerIsTop: false, sameSchool: false })).toBe('bad_opponent');
  });
  it('student -> teacher cross-school is a bad opponent even when top-3 (rule 5 before rule 6)', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'teacher', challengerIsTop: true, sameSchool: false })).toBe('bad_opponent');
  });

  it('player -> player is ok regardless of school', () => {
    expect(challengeEligibility({ challengerRole: 'player', opponentRole: 'player', challengerIsTop: false, sameSchool: false })).toBe('ok');
    expect(challengeEligibility({ challengerRole: 'player', opponentRole: 'player', challengerIsTop: false, sameSchool: true })).toBe('ok');
  });
  it('player -> student/teacher/admin is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'player', opponentRole: 'student', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'player', opponentRole: 'teacher', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'player', opponentRole: 'admin', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
  });
  it('student/teacher/admin -> player is a bad opponent', () => {
    expect(challengeEligibility({ challengerRole: 'student', opponentRole: 'player', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'teacher', opponentRole: 'player', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
    expect(challengeEligibility({ challengerRole: 'admin', opponentRole: 'player', challengerIsTop: false, sameSchool: true })).toBe('bad_opponent');
  });

  it('admin -> student cross-school is still ok (global admin ignores school)', () => {
    expect(challengeEligibility({ challengerRole: 'admin', opponentRole: 'student', challengerIsTop: false, sameSchool: false })).toBe('ok');
  });
});
