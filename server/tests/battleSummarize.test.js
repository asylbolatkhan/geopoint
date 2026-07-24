import { describe, it, expect } from 'vitest';
import { summarize } from '../src/routes/battles.js';

describe('summarize', () => {
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + 3600000).toISOString();

  // Fake battle row with all needed fields
  const createBattle = (overrides = {}) => ({
    id: 1,
    challenger_id: 100,
    opponent_id: 200,
    challenger_result: null,
    opponent_result: null,
    other_name: 'Alice',
    other_class: '10A',
    other_role: 'student',
    status: 'awaiting_opponent',
    winner_id: null,
    total: 10,
    created_at: now,
    expires_at: expiry,
    questions: Array(10).fill(null),
    ...overrides,
  });

  it('exports as a function', () => {
    expect(typeof summarize).toBe('function');
  });

  it('adds opponent id to other object when viewing as challenger', () => {
    const battle = createBattle();
    const summary = summarize(battle, 100); // myId = 100 = challenger_id
    expect(summary.other.id).toBe(200); // opponent_id
  });

  it('adds opponent id to other object when viewing as opponent', () => {
    const battle = createBattle();
    const summary = summarize(battle, 200); // myId = 200 = opponent_id
    expect(summary.other.id).toBe(100); // challenger_id
  });

  it('preserves other.name, other.class_name, and other.role', () => {
    const battle = createBattle();
    const summary = summarize(battle, 100);
    expect(summary.other.name).toBe('Alice');
    expect(summary.other.class_name).toBe('10A');
    expect(summary.other.role).toBe('student');
  });

  it('correctly calculates winner when completed', () => {
    const battle = createBattle({ status: 'completed', winner_id: 100 });
    const cSummary = summarize(battle, 100); // challenger
    const oSummary = summarize(battle, 200); // opponent
    expect(cSummary.winner).toBe('me');
    expect(oSummary.winner).toBe('them');
  });

  it('handles draw results', () => {
    const battle = createBattle({ status: 'completed', winner_id: null });
    const summary = summarize(battle, 100);
    expect(summary.winner).toBe('draw');
  });

  it('correctly calculates myCorrect from challenger perspective', () => {
    const myResult = { correct: 8, durationMs: 30000 };
    const battle = createBattle({ challenger_result: myResult });
    const summary = summarize(battle, 100);
    expect(summary.myCorrect).toBe(8);
  });

  it('correctly calculates myCorrect from opponent perspective', () => {
    const myResult = { correct: 7, durationMs: 25000 };
    const battle = createBattle({ opponent_result: myResult });
    const summary = summarize(battle, 200);
    expect(summary.myCorrect).toBe(7);
  });

  it('includes all required summary fields', () => {
    const battle = createBattle();
    const summary = summarize(battle, 100);
    expect(summary).toHaveProperty('id');
    expect(summary).toHaveProperty('role');
    expect(summary).toHaveProperty('other');
    expect(summary).toHaveProperty('status');
    expect(summary).toHaveProperty('mode');
    expect(summary).toHaveProperty('mySubmitted');
    expect(summary).toHaveProperty('myCorrect');
    expect(summary).toHaveProperty('theirCorrect');
    expect(summary).toHaveProperty('winner');
    expect(summary).toHaveProperty('total');
    expect(summary).toHaveProperty('createdAt');
    expect(summary).toHaveProperty('expiresAt');
  });

  it('passes mode through for a completed online row, results verbatim', () => {
    const cResult = { correct: 9, durationMs: 12000 };
    const oResult = { correct: 6, durationMs: 20000 };
    const battle = createBattle({
      mode: 'online',
      status: 'completed',
      winner_id: 100,
      challenger_result: cResult,
      opponent_result: oResult,
    });
    const cSummary = summarize(battle, 100);
    const oSummary = summarize(battle, 200);
    expect(cSummary.mode).toBe('online');
    expect(oSummary.mode).toBe('online');
    expect(cSummary.myCorrect).toBe(9);
    expect(cSummary.theirCorrect).toBe(6);
    expect(oSummary.myCorrect).toBe(6);
    expect(oSummary.theirCorrect).toBe(9);
  });

  it('defaults mode to async for legacy rows where b.mode is undefined or null', () => {
    const missing = createBattle(); // mode key absent altogether
    expect(summarize(missing, 100).mode).toBe('async');

    const nullMode = createBattle({ mode: null });
    expect(summarize(nullMode, 100).mode).toBe('async');
  });
});
