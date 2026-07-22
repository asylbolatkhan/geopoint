import { describe, it, expect } from 'vitest';
import {
  QUESTION_TYPES, generateQuestions, renderForPlayer,
  correctIndexes, scoreAnswers, parseGameConfig,
} from '../src/quiz.js';
import { COUNTRY_BY_ID } from '../../shared/data/index.js';

const CONFIG = { continents: ['europe'], questionTypes: [...QUESTION_TYPES], count: 15 };

describe('generateQuestions', () => {
  const qs = generateQuestions(CONFIG);

  it('produces the requested count with valid shape', () => {
    expect(qs).toHaveLength(15);
    for (const q of qs) {
      expect(COUNTRY_BY_ID.has(q.countryId)).toBe(true);
      expect(QUESTION_TYPES).toContain(q.type);
      expect(q.wrongIds).toHaveLength(3);
      expect(q.wrongIds).not.toContain(q.countryId);
    }
  });

  it('never repeats a country within one quiz', () => {
    const ids = qs.map((q) => q.countryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('option labels are unique in BOTH languages', () => {
    for (const q of qs) {
      const canonical = { ...q };
      for (const lang of ['kk', 'ru']) {
        const [rendered] = renderForPlayer([canonical], lang, 1);
        expect(new Set(rendered.options).size).toBe(4);
      }
    }
  });
});

describe('renderForPlayer / correctIndexes', () => {
  const qs = generateQuestions(CONFIG);

  it('is deterministic and consistent between the two functions', () => {
    const rendered = renderForPlayer(qs, 'kk', 99);
    const correct = correctIndexes(qs, 99);
    for (const r of rendered) {
      const q = qs[r.index];
      const country = COUNTRY_BY_ID.get(q.countryId);
      const field = q.type.endsWith('-country') ? 'name'
        : q.type.endsWith('-flag') ? 'flag' : 'capital';
      const expectedLabel = field === 'flag' ? q.countryId : country[field].kk;
      expect(r.options[correct[r.index]]).toBe(expectedLabel);
    }
  });

  it('shuffles question order per player (different seeds)', () => {
    const a = renderForPlayer(qs, 'kk', 2).map((r) => r.index);
    const b = renderForPlayer(qs, 'kk', 3).map((r) => r.index);
    expect(a).not.toEqual(b);
  });

  it('does not leak the correct answer in the payload', () => {
    const rendered = renderForPlayer(qs, 'kk', 5);
    for (const r of rendered) {
      expect(r).not.toHaveProperty('countryId');
      expect(r).not.toHaveProperty('correct');
      expect(r).not.toHaveProperty('wrongIds');
    }
  });
});

describe('scoreAnswers', () => {
  const qs = generateQuestions({ ...CONFIG, count: 10 });

  it('scores all-correct and all-wrong properly', () => {
    const correct = correctIndexes(qs, 4);
    expect(scoreAnswers(qs, correct, 4).correct).toBe(10);
    const wrong = correct.map((c) => (c + 1) % 4);
    expect(scoreAnswers(qs, wrong, 4).correct).toBe(0);
  });

  it('treats null (unanswered) as wrong', () => {
    const answers = correctIndexes(qs, 4);
    answers[0] = null;
    answers[1] = null;
    expect(scoreAnswers(qs, answers, 4).correct).toBe(8);
  });
});

describe('parseGameConfig', () => {
  it('accepts valid config and rejects bad ones', () => {
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 10 })).toBeTruthy();
    expect(parseGameConfig({ continents: 'all', questionTypes: ['flag-country'], count: 20 })).toBeTruthy();
    expect(parseGameConfig({ continents: ['atlantis'], questionTypes: ['flag-country'], count: 10 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['bad-type'], count: 10 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 7 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 'all' })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 'all' }, { allowAll: true })).toBeTruthy();
  });
});
