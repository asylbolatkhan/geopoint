import { describe, it, expect } from 'vitest';
import {
  COUNTDOWN_MS, FEEDBACK_MS, ANSWER_GRACE_MS, DISCONNECT_GRACE_MS,
  createMatch, applyAnswer, applyTimer,
  applyDisconnect, applyReconnect, applyLeave, snapshotFor,
} from '../src/online/matchEngine.js';
import { generateQuestions, renderForPlayer } from '../src/quiz.js';
import { BATTLE } from '../src/config.js';

const ROUND_MS = BATTLE.questionSeconds * 1000; // 15000

function makeMatch({ count = 3, seedA = 11, seedB = 22, questions } = {}) {
  const config = { continents: ['europe'], questionTypes: ['flag-country'], count };
  const qs = questions ?? generateQuestions(config);
  const { state, effects } = createMatch({
    matchId: 'm1',
    challengerId: 'A',
    opponentId: 'B',
    playerMeta: {
      A: { lang: 'kk', seed: seedA, name: 'Aya', class_name: '7A' },
      B: { lang: 'ru', seed: seedB, name: 'Bek', class_name: '7B' },
    },
    questions: qs,
    config,
    now: 1000,
  });
  return { state, effects, questions: qs, config };
}

const sendsOf = (effects, type) =>
  effects.filter((e) => e.type === 'send' && e.msg.type === type);
const sendTo = (effects, type, to) => sendsOf(effects, type).find((e) => e.to === to);
const timerOf = (effects, name) => effects.find((e) => e.type === 'setTimer' && e.name === name);
const clearOf = (effects, name) => effects.find((e) => e.type === 'clearTimer' && e.name === name);
const persistOf = (effects) => effects.find((e) => e.type === 'persist');
const endOf = (effects) => effects.find((e) => e.type === 'end');

// countdown → racing (create now=1000 → countdownEnd at 4000 → q0 deadline 19000)
const toRacing = (state) => applyTimer(state, 'countdownEnd', 1000 + COUNTDOWN_MS);
// Ойыншының АҒЫМДАҒЫ сұрағының дұрыс/бұрыс option-ы (өз ретімен)
const correctOf = (state, id) => {
  const p = state.players[id];
  return p.correct[p.seq[p.idx].index];
};
const wrongOf = (state, id) => (correctOf(state, id) + 1) % 4;
const stripped = (seqItem) =>
  ({ type: seqItem.type, display: seqItem.display, options: seqItem.options });

describe('createMatch / countdown', () => {
  it('countdown фазасы, match:start екеуіне (қарсылас ақпаратымен), countdownEnd таймері', () => {
    const { state, effects, config } = makeMatch();
    expect(state.phase).toBe('countdown');
    expect(state.countdownEndsAt).toBe(1000 + COUNTDOWN_MS);
    expect(state.total).toBe(3);
    expect(state.result).toBeNull();
    for (const id of ['A', 'B']) {
      const p = state.players[id];
      expect(p).toMatchObject({
        idx: 0, sub: 'question', qStartAt: null, qDeadline: null, nextAt: null,
        lastResult: null, frozen: null, score: 0, durationMs: 0,
        finishedAt: null, connected: true, graceDeadline: null,
      });
      expect(p.seq).toHaveLength(3);
      expect(p.correct).toHaveLength(3);
    }
    const a = sendTo(effects, 'match:start', 'A');
    const b = sendTo(effects, 'match:start', 'B');
    expect(a.msg.opponent).toEqual({ id: 'B', name: 'Bek', class_name: '7B' });
    expect(b.msg.opponent).toEqual({ id: 'A', name: 'Aya', class_name: '7A' });
    expect(a.msg).toEqual({
      type: 'match:start', matchId: 'm1', opponent: a.msg.opponent,
      config, totalRounds: 3, countdownEndsAt: 4000, serverNow: 1000,
    });
    expect(timerOf(effects, 'countdownEnd').at).toBe(4000);
  });

  it('әр ойыншыға ӨЗ реті: seq — канондық индекстер пермутациясы, seed-тер рет айырмасын береді', () => {
    const qs = generateQuestions({ continents: ['europe'], questionTypes: ['flag-country'], count: 10 });
    const orderOf = (lang, seed) => renderForPlayer(qs, lang, seed).map((q) => q.index);
    // 11-seed-тен өзгеше рет беретін seed табылады
    let seedB = null;
    for (let s = 12; s < 300; s++) {
      if (orderOf('ru', s).join() !== orderOf('kk', 11).join()) { seedB = s; break; }
    }
    expect(seedB).not.toBeNull();
    const { state } = makeMatch({ count: 10, questions: qs, seedB });
    const seqA = state.players.A.seq.map((q) => q.index);
    const seqB = state.players.B.seq.map((q) => q.index);
    expect(seqA).toEqual(orderOf('kk', 11));
    expect(seqB).toEqual(orderOf('ru', seedB));
    expect([...seqA].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...seqB].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seqA).not.toEqual(seqB);
  });
});

describe('countdownEnd', () => {
  it('racing: әр connected ойыншыға ӨЗ q:start-ы + q:<id> таймері', () => {
    const { state } = makeMatch();
    const r = toRacing(state);
    expect(state.phase).toBe('racing');
    const qsA = sendTo(r.effects, 'q:start', 'A').msg;
    const qsB = sendTo(r.effects, 'q:start', 'B').msg;
    expect(qsA).toEqual({
      type: 'q:start', matchId: 'm1', idx: 0, total: 3,
      question: stripped(state.players.A.seq[0]), deadline: 19000, serverNow: 4000,
    });
    expect(qsA.question).not.toHaveProperty('index'); // канондық индекс ЛИКТЕЛМЕЙДІ
    expect(qsB.question).toEqual(stripped(state.players.B.seq[0]));
    expect(qsB.question).not.toHaveProperty('index');
    expect(timerOf(r.effects, 'q:A').at).toBe(19000 + ANSWER_GRACE_MS);
    expect(timerOf(r.effects, 'q:B').at).toBe(19000 + ANSWER_GRACE_MS);
    expect(state.players.A).toMatchObject({ idx: 0, sub: 'question', qStartAt: 4000, qDeadline: 19000 });
  });

  it('countdown кезінде өшік ойыншы → frozen q0 (q:start жоқ, толық 15с сақталады)', () => {
    const { state } = makeMatch();
    const d = applyDisconnect(state, 'B', 2000);
    // countdown-да freeze ЖОҚ, бірақ grace қойылады
    expect(state.players.B.frozen).toBeNull();
    expect(state.players.B.graceDeadline).toBe(2000 + DISCONNECT_GRACE_MS);
    expect(d.effects.some((e) => e.type === 'clearTimer')).toBe(false);
    expect(timerOf(d.effects, 'grace:B').at).toBe(22000);
    expect(sendTo(d.effects, 'match:opponent_disconnected', 'A').msg)
      .toEqual({ type: 'match:opponent_disconnected', graceEndsAt: 22000, serverNow: 2000 });
    const r = toRacing(state);
    expect(sendTo(r.effects, 'q:start', 'A')).toBeTruthy();
    expect(sendTo(r.effects, 'q:start', 'B')).toBeUndefined();
    expect(timerOf(r.effects, 'q:B')).toBeUndefined();
    expect(state.players.B).toMatchObject({
      idx: 0, sub: 'question', frozen: { kind: 'q', remainingMs: ROUND_MS },
      qStartAt: null, qDeadline: null,
    });
  });
});

describe('жауап (applyAnswer)', () => {
  it('дұрыс жауап: q:result дәл payload, opponent:progress, next-таймер', () => {
    const { state } = makeMatch();
    toRacing(state);
    const cA = correctOf(state, 'A');
    const r = applyAnswer(state, 'A', 0, cA, 6000);
    expect(r.effects.map((e) => e.type)).toEqual(['clearTimer', 'send', 'send', 'setTimer']);
    expect(clearOf(r.effects, 'q:A')).toBeTruthy();
    expect(sendTo(r.effects, 'q:result', 'A').msg).toEqual({
      type: 'q:result', matchId: 'm1', idx: 0,
      correctOption: cA, yourAnswer: cA, yourCorrect: true,
      scores: { you: 1, opponent: 0 }, nextAt: 6000 + FEEDBACK_MS, serverNow: 6000,
    });
    expect(sendTo(r.effects, 'opponent:progress', 'B').msg)
      .toEqual({ type: 'opponent:progress', answered: 1, score: 1, finished: false });
    expect(timerOf(r.effects, 'next:A').at).toBe(6900);
    expect(state.players.A).toMatchObject({
      sub: 'feedback', score: 1, durationMs: 2000, nextAt: 6900,
      qStartAt: null, qDeadline: null,
      lastResult: { correctOption: cA, yourAnswer: cA, yourCorrect: true },
    });
  });

  it('қате жауап: yourCorrect false, ұпай өспейді, durationMs жиналады', () => {
    const { state } = makeMatch();
    toRacing(state);
    const cA = correctOf(state, 'A');
    const wA = wrongOf(state, 'A');
    const r = applyAnswer(state, 'A', 0, wA, 5000);
    expect(sendTo(r.effects, 'q:result', 'A').msg).toEqual({
      type: 'q:result', matchId: 'm1', idx: 0,
      correctOption: cA, yourAnswer: wA, yourCorrect: false,
      scores: { you: 0, opponent: 0 }, nextAt: 5900, serverNow: 5000,
    });
    expect(state.players.A).toMatchObject({ score: 0, durationMs: 1000, sub: 'feedback' });
  });

  it('қарсылас өшік болса opponent:progress жіберілмейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyDisconnect(state, 'B', 5000);
    const r = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 6000);
    expect(sendsOf(r.effects, 'opponent:progress')).toEqual([]);
    expect(sendTo(r.effects, 'q:result', 'A')).toBeTruthy();
  });

  it('grace-терезе жауабы: deadline+1400 қабылданады, atMs 15000-мен кэптеледі', () => {
    const { state } = makeMatch();
    toRacing(state); // deadline 19000
    const r = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 19000 + 1400);
    expect(state.players.A.durationMs).toBe(ROUND_MS); // 16400 емес — кэп
    expect(sendTo(r.effects, 'q:result', 'A').msg.nextAt).toBe(20400 + FEEDBACK_MS);
    expect(state.players.A.score).toBe(1);
  });
});

describe('applyAnswer қорғандары', () => {
  it('қос жауап (feedback кезінде) еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyAnswer(state, 'A', 0, 0, 5100);
    expect(r.effects).toEqual([]);
    expect(state.players.A).toMatchObject({ sub: 'feedback', score: 1, durationMs: 1000 });
  });

  it('ескі/алдағы idx еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyTimer(state, 'next:A', 5900); // A → q1
    expect(applyAnswer(state, 'A', 0, 0, 6000).effects).toEqual([]); // ескі
    expect(applyAnswer(state, 'A', 2, 0, 6000).effects).toEqual([]); // алдағы
    expect(state.players.A).toMatchObject({ idx: 1, sub: 'question', score: 1 });
  });

  it('жарамсыз optionIndex / бөтен ойыншы еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    expect(applyAnswer(state, 'A', 0, 7, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'A', 0, -1, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'A', 0, null, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'A', 0, 1.5, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'Z', 0, 0, 5000).effects).toEqual([]);
    expect(state.players.A).toMatchObject({ sub: 'question', score: 0, durationMs: 0 });
  });

  it('countdown кезінде жауап еленбейді', () => {
    const { state } = makeMatch();
    const r = applyAnswer(state, 'A', 0, 0, 2000);
    expect(r.effects).toEqual([]);
    expect(state.phase).toBe('countdown');
  });

  it('deadline+1600 еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state); // deadline 19000
    const r = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 19000 + 1600);
    expect(r.effects).toEqual([]);
    expect(state.players.A).toMatchObject({ sub: 'question', durationMs: 0 });
  });
});

describe('timeout / таймер қорғандары', () => {
  it('q:<id> timeout: yourAnswer null, atMs=ROUND_MS, feedback басталады', () => {
    const { state } = makeMatch();
    toRacing(state);
    const cA = correctOf(state, 'A');
    const r = applyTimer(state, 'q:A', 19000 + ANSWER_GRACE_MS);
    expect(sendTo(r.effects, 'q:result', 'A').msg).toEqual({
      type: 'q:result', matchId: 'm1', idx: 0,
      correctOption: cA, yourAnswer: null, yourCorrect: false,
      scores: { you: 0, opponent: 0 }, nextAt: 20500 + FEEDBACK_MS, serverNow: 20500,
    });
    expect(sendTo(r.effects, 'opponent:progress', 'B').msg)
      .toEqual({ type: 'opponent:progress', answered: 1, score: 0, finished: false });
    expect(timerOf(r.effects, 'next:A').at).toBe(21400);
    expect(state.players.A).toMatchObject({ sub: 'feedback', score: 0, durationMs: ROUND_MS });
    expect(state.players.B).toMatchObject({ sub: 'question', durationMs: 0 }); // B-ге әсер жоқ
  });

  it('ескі q-таймер feedback кезінде еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyTimer(state, 'q:A', 20500);
    expect(r.effects).toEqual([]);
    expect(state.players.A).toMatchObject({ sub: 'feedback', durationMs: 1000 });
  });

  it('бөтен/ескі таймерлер еленбейді', () => {
    const { state } = makeMatch();
    expect(applyTimer(state, 'q:A', 2000).effects).toEqual([]); // countdown кезінде
    expect(applyTimer(state, 'next:A', 2000).effects).toEqual([]);
    expect(applyTimer(state, 'bogus', 2000).effects).toEqual([]);
    toRacing(state);
    expect(applyTimer(state, 'countdownEnd', 5000).effects).toEqual([]); // қайталанған
    expect(applyTimer(state, 'q:Z', 5000).effects).toEqual([]);
    expect(applyTimer(state, 'next:A', 5000).effects).toEqual([]); // sub='question'
  });
});

describe('next:<id> — жеке прогресс', () => {
  it('next → келесі сұрақ: q:start idx+1 өз ретімен', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyTimer(state, 'next:A', 5900);
    expect(sendTo(r.effects, 'q:start', 'A').msg).toEqual({
      type: 'q:start', matchId: 'm1', idx: 1, total: 3,
      question: stripped(state.players.A.seq[1]), deadline: 5900 + ROUND_MS, serverNow: 5900,
    });
    expect(timerOf(r.effects, 'q:A').at).toBe(20900 + ANSWER_GRACE_MS);
    expect(state.players.A).toMatchObject({ idx: 1, sub: 'question', qStartAt: 5900, lastResult: null });
  });

  it('тәуелсіз прогресс: A 3 сұрақ өтті, B күйі мүлдем өзгеріссіз', () => {
    const { state } = makeMatch();
    toRacing(state);
    const bBefore = JSON.parse(JSON.stringify(state.players.B));
    // A барлық 3 сұрақты дұрыс, әрқайсысына 1000мс
    let t = 4000;
    for (let i = 0; i < 3; i++) {
      const r = applyAnswer(state, 'A', i, correctOf(state, 'A'), t + 1000);
      // B-ге ТЕК opponent:progress барады
      const toB = r.effects.filter((e) => e.type === 'send' && e.to === 'B');
      expect(toB.map((e) => e.msg.type)).toEqual(['opponent:progress']);
      t += 1000 + FEEDBACK_MS;
      applyTimer(state, `next:A`, t);
    }
    // A done, B мүлдем тимеген (qDeadline 19000 күйінде)
    expect(state.players.A).toMatchObject({ sub: 'done', score: 3, durationMs: 3000, finishedAt: 9700 });
    expect(JSON.parse(JSON.stringify(state.players.B))).toEqual(bBefore);
    expect(state.phase).toBe('racing');
  });

  it('соңғы next → done: match:waiting өзіне, opponent:progress finished:true, persist ЖОҚ', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyTimer(state, 'next:A', 5900);
    expect(state.players.A).toMatchObject({ sub: 'done', finishedAt: 5900, nextAt: null });
    expect(state.phase).toBe('racing'); // B әлі жарыста
    expect(sendTo(r.effects, 'match:waiting', 'A').msg).toEqual({
      type: 'match:waiting', matchId: 'm1',
      opponentProgress: { answered: 0, score: 0, finished: false },
      opponentDisconnected: null, serverNow: 5900,
    });
    expect(sendTo(r.effects, 'opponent:progress', 'B').msg)
      .toEqual({ type: 'opponent:progress', answered: 1, score: 1, finished: true });
    expect(persistOf(r.effects)).toBeUndefined();
    expect(endOf(r.effects)).toBeUndefined();
  });
});

describe('finishMatch / нәтиже', () => {
  it('екеуі done → persist,send,send,end дәл тәртіппен; тең ұпайда жылдам жеңеді', () => {
    const { state, questions, config } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // 1000мс
    applyTimer(state, 'next:A', 5900); // A done
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000); // 2000мс
    const r = applyTimer(state, 'next:B', 6900); // B done → finishMatch
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'challenger', reason: 'completed' });
    expect(r.effects.map((e) => e.type)).toEqual(['persist', 'send', 'send', 'end']);
    expect(persistOf(r.effects).data).toEqual({
      challengerId: 'A', opponentId: 'B', config, questions,
      challengerResult: { correct: 1, durationMs: 1000 },
      opponentResult: { correct: 1, durationMs: 2000 },
      outcome: 'challenger',
    });
    expect(sendTo(r.effects, 'match:end', 'A').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'win', reason: 'completed', scores: { you: 1, opponent: 1 },
    });
    expect(sendTo(r.effects, 'match:end', 'B').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'loss', reason: 'completed', scores: { you: 1, opponent: 1 },
    });
  });

  it('ұпайы көп жеңеді (баяу болса да)', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, wrongOf(state, 'A'), 5000); // жылдам, бірақ қате
    applyTimer(state, 'next:A', 5900);
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 9000); // баяу, бірақ дұрыс
    const r = applyTimer(state, 'next:B', 9900);
    expect(persistOf(r.effects).data.outcome).toBe('opponent');
    expect(sendTo(r.effects, 'match:end', 'A').msg.outcome).toBe('loss');
    expect(sendTo(r.effects, 'match:end', 'B').msg.outcome).toBe('win');
  });

  it('толық теңдік → draw екеуіне де', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // 1000мс
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 5000); // 1000мс
    applyTimer(state, 'next:A', 5900);
    const r = applyTimer(state, 'next:B', 5900);
    expect(persistOf(r.effects).data.outcome).toBe('draw');
    expect(sendTo(r.effects, 'match:end', 'A').msg.outcome).toBe('draw');
    expect(sendTo(r.effects, 'match:end', 'B').msg.outcome).toBe('draw');
  });
});

describe('disconnect', () => {
  it('question кезінде: тек ӨЗ q-таймері қатады, қарсылас әсер алмайды', () => {
    const { state } = makeMatch();
    toRacing(state); // deadline 19000
    const r = applyDisconnect(state, 'B', 10000);
    expect(r.effects.map((e) => e.type)).toEqual(['clearTimer', 'setTimer', 'send']);
    expect(clearOf(r.effects, 'q:B')).toBeTruthy();
    expect(clearOf(r.effects, 'q:A')).toBeUndefined(); // A таймері тізімде қалады
    expect(timerOf(r.effects, 'grace:B').at).toBe(10000 + DISCONNECT_GRACE_MS);
    expect(sendTo(r.effects, 'match:opponent_disconnected', 'A').msg)
      .toEqual({ type: 'match:opponent_disconnected', graceEndsAt: 30000, serverNow: 10000 });
    expect(state.players.B).toMatchObject({
      connected: false, frozen: { kind: 'q', remainingMs: 9000 }, graceDeadline: 30000,
    });
    // A жарыса береді
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 11000);
    expect(state.players.A).toMatchObject({ sub: 'feedback', durationMs: 7000 });
    // өшік ойыншыдан жауап та, қатқан q-таймер де еленбейді
    expect(applyAnswer(state, 'B', 0, 0, 11000).effects).toEqual([]);
    expect(applyTimer(state, 'q:B', 20500).effects).toEqual([]);
    expect(state.players.B.durationMs).toBe(0);
  });

  it('feedback кезінде: frozen next, next-таймер қатады', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // nextAt 5900
    const r = applyDisconnect(state, 'A', 5300);
    expect(clearOf(r.effects, 'next:A')).toBeTruthy();
    expect(timerOf(r.effects, 'grace:A').at).toBe(5300 + DISCONNECT_GRACE_MS);
    expect(state.players.A.frozen).toEqual({ kind: 'next', remainingMs: 600 });
    // қатқан next-таймер еленбейді
    expect(applyTimer(state, 'next:A', 5900).effects).toEqual([]);
    expect(state.players.A).toMatchObject({ sub: 'feedback', idx: 0 });
  });

  it('done-ойыншы disconnect → grace ҚОЙЫЛМАЙДЫ, freeze жоқ', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyTimer(state, 'next:A', 5900); // A done
    const r = applyDisconnect(state, 'A', 7000);
    expect(r.effects).toEqual([{
      type: 'send', to: 'B',
      msg: { type: 'match:opponent_disconnected', graceEndsAt: null, serverNow: 7000 },
    }]);
    expect(state.players.A).toMatchObject({ connected: false, frozen: null, graceDeadline: null });
    // тіпті ескі grace-таймер атылса да done-ойыншы жеңілмейді
    expect(applyTimer(state, 'grace:A', 27000).effects).toEqual([]);
    expect(state.phase).toBe('racing');
  });

  it('done-ойыншы өшік күйде қарсылас аяқтаса → finishMatch әділ нәтиже', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // 1000мс
    applyTimer(state, 'next:A', 5900);
    applyDisconnect(state, 'A', 7000); // A done + өшік
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 8000); // 4000мс
    const r = applyTimer(state, 'next:B', 8900);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'challenger', reason: 'completed' });
    expect(r.effects.map((e) => e.type)).toEqual(['persist', 'send', 'send', 'end']);
    expect(sendTo(r.effects, 'match:end', 'A').msg.outcome).toBe('win'); // өшік A ЖЕҢЕДІ
  });

  it('екеуі де өшік → aborted, persist ЖОҚ, тек end', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyDisconnect(state, 'B', 10000);
    const r = applyDisconnect(state, 'A', 11000);
    expect(state.phase).toBe('aborted');
    expect(state.result).toEqual({ outcome: null, reason: 'aborted' });
    expect(r.effects).toEqual([{ type: 'end' }]);
    // aborted күйде бәрі еленбейді
    expect(applyReconnect(state, 'A', 12000).effects).toEqual([]);
    expect(applyTimer(state, 'grace:B', 30000).effects).toEqual([]);
  });
});

describe('reconnect', () => {
  it('question: qDeadline=now+қалған, qStartAt түзетіледі — atMs офлайн уақытын қоспайды', () => {
    const { state } = makeMatch();
    toRacing(state); // start 4000, deadline 19000
    applyDisconnect(state, 'B', 10000); // 6000 ойналды, 9000 қалды
    const r = applyReconnect(state, 'B', 20000);
    expect(clearOf(r.effects, 'grace:B')).toBeTruthy();
    expect(timerOf(r.effects, 'q:B').at).toBe(29000 + ANSWER_GRACE_MS);
    expect(state.players.B).toMatchObject({
      connected: true, frozen: null, graceDeadline: null,
      qDeadline: 29000, qStartAt: 14000,
    });
    const snap = sendTo(r.effects, 'match:snapshot', 'B').msg;
    expect(snap).toMatchObject({ phase: 'racing', idx: 0, sub: 'question', deadline: 29000 });
    expect(sendTo(r.effects, 'match:opponent_reconnected', 'A').msg)
      .toEqual({ type: 'match:opponent_reconnected', serverNow: 20000 }); // deadline ЖОҚ
    // 10 сек офлайн atMs-қа кірмейді: 6000 (дейін) + 1000 (кейін)
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 21000);
    expect(state.players.B.durationMs).toBe(7000);
  });

  it('countdown кезінде өшкен ойыншы racing-те қосылса — q0 толық 15с-пен басталады', () => {
    const { state } = makeMatch();
    applyDisconnect(state, 'B', 2000);
    toRacing(state); // B frozen {kind:'q', remainingMs:15000}
    const r = applyReconnect(state, 'B', 6000);
    expect(state.players.B).toMatchObject({ qDeadline: 21000, qStartAt: 6000, frozen: null });
    expect(timerOf(r.effects, 'q:B').at).toBe(21000 + ANSWER_GRACE_MS);
    const snap = sendTo(r.effects, 'match:snapshot', 'B').msg;
    expect(snap.deadline).toBe(21000);
    expect(snap.question).toEqual(stripped(state.players.B.seq[0]));
  });

  it('feedback: nextAt=now+қалған, next-таймер қайта қойылады, ағын жалғасады', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyDisconnect(state, 'A', 5300); // 600мс қалды
    const r = applyReconnect(state, 'A', 8000);
    expect(state.players.A).toMatchObject({ nextAt: 8600, frozen: null, sub: 'feedback' });
    expect(timerOf(r.effects, 'next:A').at).toBe(8600);
    const snap = sendTo(r.effects, 'match:snapshot', 'A').msg;
    expect(snap.sub).toBe('feedback');
    expect(snap.feedback.nextAt).toBe(8600);
    // жалғасы: next → q1
    const r2 = applyTimer(state, 'next:A', 8600);
    expect(sendTo(r2.effects, 'q:start', 'A').msg.idx).toBe(1);
  });

  it('reconnect-тен кейін ескі grace таймері еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyDisconnect(state, 'B', 10000);
    applyReconnect(state, 'B', 15000);
    const r = applyTimer(state, 'grace:B', 30000);
    expect(r.effects).toEqual([]);
    expect(state.phase).toBe('racing');
  });
});

describe('forfeit', () => {
  it('racing ойыншының grace-і бітті → forfeit (алда болса да)', () => {
    const { state } = makeMatch({ count: 2 });
    toRacing(state);
    applyAnswer(state, 'A', 0, wrongOf(state, 'A'), 5000); // A 0 ұпай
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000); // B 1 ұпай — алда
    applyTimer(state, 'next:B', 6900); // B q1-де
    applyDisconnect(state, 'B', 10000);
    const r = applyTimer(state, 'grace:B', 30000);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'challenger', reason: 'forfeit' });
    expect(r.effects.map((e) => e.type)).toEqual(['persist', 'send', 'send', 'end']);
    const p = persistOf(r.effects);
    expect(p.data.outcome).toBe('challenger'); // resolveBattle 'opponent' берер еді — мәжбүрлі
    expect(p.data.challengerResult).toEqual({ correct: 0, durationMs: 1000 });
    expect(p.data.opponentResult).toEqual({ correct: 1, durationMs: 2000 });
    expect(sendTo(r.effects, 'match:end', 'A').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'win', reason: 'forfeit_opponent', scores: { you: 0, opponent: 1 },
    });
    expect(sendTo(r.effects, 'match:end', 'B').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'loss', reason: 'forfeit_you', scores: { you: 1, opponent: 0 },
    });
  });

  it('applyLeave racing кезінде → forfeit', () => {
    const { state } = makeMatch();
    toRacing(state);
    const r = applyLeave(state, 'A', 5000);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'opponent', reason: 'forfeit' });
    expect(persistOf(r.effects).data.outcome).toBe('opponent');
    expect(sendTo(r.effects, 'match:end', 'A').msg)
      .toMatchObject({ outcome: 'loss', reason: 'forfeit_you' });
    expect(sendTo(r.effects, 'match:end', 'B').msg)
      .toMatchObject({ outcome: 'win', reason: 'forfeit_opponent' });
  });

  it('applyLeave done кезінде де → forfeit (саналы шығу)', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyTimer(state, 'next:A', 5900); // A done
    const r = applyLeave(state, 'A', 7000);
    expect(state.result).toEqual({ outcome: 'opponent', reason: 'forfeit' });
    expect(sendTo(r.effects, 'match:end', 'A').msg)
      .toMatchObject({ outcome: 'loss', reason: 'forfeit_you' });
  });

  it('finished күйде leave/disconnect/answer/timer еленбейді', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyLeave(state, 'A', 5000);
    expect(applyLeave(state, 'B', 6000).effects).toEqual([]);
    expect(applyDisconnect(state, 'B', 6000).effects).toEqual([]);
    expect(applyAnswer(state, 'B', 0, 0, 6000).effects).toEqual([]);
    expect(applyTimer(state, 'q:B', 20500).effects).toEqual([]);
    expect(applyReconnect(state, 'B', 7000).effects).toEqual([]);
  });
});

describe('snapshotFor', () => {
  it('countdown: countdownEndsAt, сұрақсыз (дәл пішін)', () => {
    const { state } = makeMatch();
    const s = snapshotFor(state, 'A', 2000);
    expect(s).toEqual({
      type: 'match:snapshot', matchId: 'm1', total: 3, phase: 'countdown',
      scores: { you: 0, opponent: 0 },
      opponent: { id: 'B', name: 'Bek', class_name: '7B' },
      serverNow: 2000, countdownEndsAt: 4000,
    });
  });

  it('racing/question: өз сұрағы (index ЛИКТЕЛМЕЙДІ) + deadline + opponentProgress', () => {
    const { state } = makeMatch();
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // A алға кетті
    const s = snapshotFor(state, 'B', 6000);
    expect(s).toEqual({
      type: 'match:snapshot', matchId: 'm1', total: 3, phase: 'racing',
      scores: { you: 0, opponent: 1 },
      opponent: { id: 'A', name: 'Aya', class_name: '7A' },
      serverNow: 6000, idx: 0, sub: 'question',
      opponentProgress: { answered: 1, score: 1, finished: false },
      opponentDisconnected: null,
      question: stripped(state.players.B.seq[0]), deadline: 19000,
    });
    expect(s.question).not.toHaveProperty('index');
  });

  it('racing/feedback: question + feedback пішіні, deadline жоқ', () => {
    const { state } = makeMatch();
    toRacing(state);
    const cA = correctOf(state, 'A');
    applyAnswer(state, 'A', 0, cA, 6000);
    const s = snapshotFor(state, 'A', 6500);
    expect(s.sub).toBe('feedback');
    expect(s.idx).toBe(0);
    expect(s.question).toEqual(stripped(state.players.A.seq[0]));
    expect(s.feedback).toEqual({
      correctOption: cA, yourAnswer: cA, yourCorrect: true, nextAt: 6900,
    });
    expect(s.scores).toEqual({ you: 1, opponent: 0 });
    expect(s).not.toHaveProperty('deadline');
  });

  it('racing/done: сұрақсыз күту-пішін, қарсылас прогресі тірі', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyTimer(state, 'next:A', 5900); // A done
    const s = snapshotFor(state, 'A', 7000);
    expect(s).toMatchObject({
      phase: 'racing', idx: 0, sub: 'done',
      opponentProgress: { answered: 0, score: 0, finished: false },
      opponentDisconnected: null,
    });
    expect(s).not.toHaveProperty('question');
    expect(s).not.toHaveProperty('deadline');
    expect(s).not.toHaveProperty('feedback');
  });

  it('opponentDisconnected: racing қарсыласта graceDeadline, done қарсыласта true', () => {
    const { state } = makeMatch({ count: 1 });
    toRacing(state);
    applyDisconnect(state, 'B', 10000);
    expect(snapshotFor(state, 'A', 11000).opponentDisconnected).toBe(30000);
    applyReconnect(state, 'B', 12000);
    // A аяқтап, өшіп кетеді → B snapshot-ында уақытсыз белгі (true)
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 13000);
    applyTimer(state, 'next:A', 13900);
    applyDisconnect(state, 'A', 14000);
    const s = snapshotFor(state, 'B', 15000);
    expect(s.opponentDisconnected).toBe(true);
    expect(s.opponentProgress).toEqual({ answered: 1, score: 1, finished: true });
  });
});
