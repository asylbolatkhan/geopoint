import { describe, it, expect } from 'vitest';
import {
  COUNTDOWN_MS, REVEAL_MS, ANSWER_GRACE_MS, DISCONNECT_GRACE_MS,
  createMatch, applyAnswer, applyTimer,
  applyDisconnect, applyReconnect, applyLeave, snapshotFor,
} from '../src/online/matchEngine.js';
import { generateQuestions, correctIndexes } from '../src/quiz.js';
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
    matchSeed: 5,
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

// countdown → round 0 (create now=1000 → countdownEnd at 4000 → deadline 19000)
const toRound0 = (state) => applyTimer(state, 'countdownEnd', 1000 + COUNTDOWN_MS);
const correctOf = (state, id) => state.players[id].correct[state.order[state.round]];
const wrongOf = (state, id) => (correctOf(state, id) + 1) % 4;

describe('createMatch', () => {
  it('countdown фазасы, match:start екеуіне (қарсылас ақпаратымен), countdownEnd таймері', () => {
    const { state, effects } = makeMatch();
    expect(state.phase).toBe('countdown');
    expect(state.phaseDeadline).toBe(1000 + COUNTDOWN_MS);
    expect(state.totalRounds).toBe(3);
    expect([...state.order].sort()).toEqual([0, 1, 2]);
    expect(state.paused).toBe(false);
    const a = sendTo(effects, 'match:start', 'A');
    const b = sendTo(effects, 'match:start', 'B');
    expect(a.msg.opponent).toEqual({ id: 'B', name: 'Bek', class_name: '7B' });
    expect(b.msg.opponent).toEqual({ id: 'A', name: 'Aya', class_name: '7A' });
    expect(a.msg).toMatchObject({
      matchId: 'm1', totalRounds: 3, countdownEndsAt: 4000, serverNow: 1000,
    });
    expect(timerOf(effects, 'countdownEnd').at).toBe(4000);
  });
});

describe('3 раундтық толық happy-path', () => {
  it('countdown → 3 раунд → persist + match:end + end', () => {
    const { state, questions, config } = makeMatch();

    // round 0 басталады
    let r = toRound0(state);
    expect(state.phase).toBe('round_active');
    expect(state.round).toBe(0);
    expect(state.phaseDeadline).toBe(19000);
    const rsA = sendTo(r.effects, 'round:start', 'A').msg;
    const rsB = sendTo(r.effects, 'round:start', 'B').msg;
    expect(rsA).toMatchObject({ matchId: 'm1', round: 0, total: 3, deadline: 19000, serverNow: 4000 });
    expect(rsA.question.options).toHaveLength(4);
    expect(rsA.question).not.toHaveProperty('index'); // канондық индекс клиентке ақпайды
    expect(rsB.question.options).toHaveLength(4);
    expect(timerOf(r.effects, 'roundDeadline').at).toBe(19000 + ANSWER_GRACE_MS);

    // round 0: A дұрыс (atMs 1000), B бұрыс (atMs 2000)
    r = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    expect(state.phase).toBe('round_active');
    expect(sendTo(r.effects, 'round:opponent_answered', 'B').msg.round).toBe(0);
    const bCorrect0 = correctOf(state, 'B');
    r = applyAnswer(state, 'B', 0, wrongOf(state, 'B'), 6000);
    expect(state.phase).toBe('round_reveal');
    const resA = sendTo(r.effects, 'round:result', 'A').msg;
    const resB = sendTo(r.effects, 'round:result', 'B').msg;
    expect(resA).toMatchObject({
      matchId: 'm1', round: 0,
      correctOption: state.players.A.correct[state.order[0]],
      yourCorrect: true, opponentCorrect: false,
      scores: { you: 1, opponent: 0 },
      nextRoundAt: 6000 + REVEAL_MS, serverNow: 6000,
    });
    expect(resB.correctOption).toBe(bCorrect0);
    expect(resB.yourCorrect).toBe(false);
    expect(resB.opponentCorrect).toBe(true);
    expect(resB.scores).toEqual({ you: 0, opponent: 1 });
    expect(timerOf(r.effects, 'revealEnd').at).toBe(8500);

    // round 1: екеуі де дұрыс (A 500мс, B 1500мс)
    r = applyTimer(state, 'revealEnd', 8500);
    expect(state.round).toBe(1);
    expect(state.phaseDeadline).toBe(8500 + ROUND_MS);
    applyAnswer(state, 'A', 1, correctOf(state, 'A'), 9000);
    r = applyAnswer(state, 'B', 1, correctOf(state, 'B'), 10000);
    expect(sendTo(r.effects, 'round:result', 'A').msg.scores).toEqual({ you: 2, opponent: 1 });

    // round 2: екеуі де бұрыс (A 500мс, B 1000мс)
    r = applyTimer(state, 'revealEnd', 12500);
    expect(state.round).toBe(2);
    applyAnswer(state, 'A', 2, wrongOf(state, 'A'), 13000);
    r = applyAnswer(state, 'B', 2, wrongOf(state, 'B'), 13500);
    expect(timerOf(r.effects, 'revealEnd').at).toBe(16000);

    // соңғы reveal бітті → finished
    r = applyTimer(state, 'revealEnd', 16000);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'challenger', reason: 'completed' });
    expect(persistOf(r.effects).data).toEqual({
      challengerId: 'A', opponentId: 'B', config, questions,
      challengerResult: { correct: 2, durationMs: 2000 },
      opponentResult: { correct: 1, durationMs: 4500 },
      outcome: 'challenger',
    });
    expect(sendTo(r.effects, 'match:end', 'A').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'win', reason: 'completed', scores: { you: 2, opponent: 1 },
    });
    expect(sendTo(r.effects, 'match:end', 'B').msg).toEqual({
      type: 'match:end', matchId: 'm1',
      outcome: 'loss', reason: 'completed', scores: { you: 1, opponent: 2 },
    });
    // эффект тәртібі: persist → match:end×2 → end
    expect(r.effects.map((e) => e.type)).toEqual(['persist', 'send', 'send', 'end']);
  });
});

describe('applyAnswer қорғандары', () => {
  it('қос жауап еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const first = state.players.A.roundAnswer;
    const r = applyAnswer(state, 'A', 0, wrongOf(state, 'A'), 6000);
    expect(r.effects).toEqual([]);
    expect(state.players.A.roundAnswer).toBe(first);
  });

  it('ескі раунд жауабы еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000);
    applyTimer(state, 'revealEnd', 8500); // round 1 басталды
    const r = applyAnswer(state, 'A', 0, 0, 9000);
    expect(r.effects).toEqual([]);
    expect(state.players.A.roundAnswer).toBeNull();
  });

  it('deadline+1400 қабылданады, deadline+1600 еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state); // deadline 19000
    const r1 = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 19000 + 1400);
    expect(state.players.A.roundAnswer).toMatchObject({ atMs: 16400 });
    expect(sendTo(r1.effects, 'round:opponent_answered', 'B')).toBeTruthy();
    const r2 = applyAnswer(state, 'B', 0, correctOf(state, 'B'), 19000 + 1600);
    expect(r2.effects).toEqual([]);
    expect(state.players.B.roundAnswer).toBeNull();
  });

  it('round_active емес фазада еленбейді (countdown)', () => {
    const { state } = makeMatch();
    const r = applyAnswer(state, 'A', 0, 0, 2000);
    expect(r.effects).toEqual([]);
    expect(state.phase).toBe('countdown');
  });

  it('жарамсыз optionIndex / бөтен ойыншы еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    expect(applyAnswer(state, 'A', 0, 7, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'A', 0, -1, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'A', 0, null, 5000).effects).toEqual([]);
    expect(applyAnswer(state, 'Z', 0, 0, 5000).effects).toEqual([]);
    expect(state.players.A.roundAnswer).toBeNull();
  });
});

describe('таймауттар', () => {
  it('екеуі де timeout: durationMs += 15000, ұпай жоқ, yourAnswer null', () => {
    const { state } = makeMatch();
    toRound0(state);
    const r = applyTimer(state, 'roundDeadline', 19000 + ANSWER_GRACE_MS);
    expect(state.phase).toBe('round_reveal');
    const resA = sendTo(r.effects, 'round:result', 'A').msg;
    expect(resA.yourAnswer).toBeNull();
    expect(resA.yourCorrect).toBe(false);
    expect(resA.opponentCorrect).toBe(false);
    expect(resA.scores).toEqual({ you: 0, opponent: 0 });
    expect(state.players.A.durationMs).toBe(ROUND_MS);
    expect(state.players.B.durationMs).toBe(ROUND_MS);
  });

  it('біреуі жауап берді, екіншісі timeout', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyTimer(state, 'roundDeadline', 20500);
    const resA = sendTo(r.effects, 'round:result', 'A').msg;
    expect(resA.yourCorrect).toBe(true);
    expect(resA.scores).toEqual({ you: 1, opponent: 0 });
    expect(state.players.A.durationMs).toBe(1000);
    expect(state.players.B.durationMs).toBe(ROUND_MS);
  });

  it('ескі/бөтен таймерлер еленбейді', () => {
    const { state } = makeMatch();
    expect(applyTimer(state, 'roundDeadline', 2000).effects).toEqual([]); // countdown кезінде
    expect(applyTimer(state, 'revealEnd', 2000).effects).toEqual([]);
    expect(applyTimer(state, 'bogus', 2000).effects).toEqual([]);
    toRound0(state);
    expect(applyTimer(state, 'countdownEnd', 5000).effects).toEqual([]); // қайталанған countdown
    expect(state.round).toBe(0);
  });
});

describe('нәтиже / persist', () => {
  it('тең ұпайда durationMs тай-брейк', () => {
    const { state } = makeMatch({ count: 1 });
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000); // 1000мс
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000); // 2000мс
    const r = applyTimer(state, 'revealEnd', 8500);
    expect(persistOf(r.effects).data.outcome).toBe('challenger');
    expect(sendTo(r.effects, 'match:end', 'A').msg.outcome).toBe('win');
    expect(sendTo(r.effects, 'match:end', 'B').msg.outcome).toBe('loss');
  });

  it('толық теңдік → draw екеуіне де', () => {
    const { state } = makeMatch({ count: 1 });
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 5000);
    const r = applyTimer(state, 'revealEnd', 7500);
    expect(persistOf(r.effects).data.outcome).toBe('draw');
    expect(sendTo(r.effects, 'match:end', 'A').msg.outcome).toBe('draw');
    expect(sendTo(r.effects, 'match:end', 'B').msg.outcome).toBe('draw');
  });
});

describe('disconnect / reconnect', () => {
  it('disconnect → pause: phaseDeadline қатады, фаза-таймер өшеді, grace қойылады', () => {
    const { state } = makeMatch();
    toRound0(state); // deadline 19000
    const r = applyDisconnect(state, 'B', 10000);
    expect(state.paused).toBe(true);
    expect(state.pauseRemainingMs).toBe(9000);
    expect(state.phaseDeadline).toBe(19000); // қатып қалды
    expect(state.players.B.connected).toBe(false);
    expect(clearOf(r.effects, 'roundDeadline')).toBeTruthy();
    expect(timerOf(r.effects, 'grace:B').at).toBe(10000 + DISCONNECT_GRACE_MS);
    expect(sendTo(r.effects, 'match:opponent_disconnected', 'A').msg)
      .toMatchObject({ graceEndsAt: 30000, serverNow: 10000 });
  });

  it('паузада фаза-таймер еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000);
    const r = applyTimer(state, 'roundDeadline', 20500);
    expect(r.effects).toEqual([]);
    expect(state.phase).toBe('round_active');
  });

  it('reconnect → қалған уақыт дұрыс, snapshot өзіне, opponent_reconnected қарсыласқа', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000); // 9000мс қалды
    const r = applyReconnect(state, 'B', 15000);
    expect(state.paused).toBe(false);
    expect(state.phaseDeadline).toBe(24000); // 15000 + 9000
    expect(state.players.B.connected).toBe(true);
    expect(clearOf(r.effects, 'grace:B')).toBeTruthy();
    expect(timerOf(r.effects, 'roundDeadline').at).toBe(24000 + ANSWER_GRACE_MS);
    const snap = sendTo(r.effects, 'match:snapshot', 'B').msg;
    expect(snap.phase).toBe('round_active');
    expect(snap.deadline).toBe(24000);
    expect(snap.question.options).toHaveLength(4);
    expect(sendTo(r.effects, 'match:opponent_reconnected', 'A').msg.deadline).toBe(24000);
  });

  it('пауза уақыты atMs-қа кірмейді (roundStartAt түзетіледі)', () => {
    const { state } = makeMatch();
    toRound0(state); // start 4000
    applyDisconnect(state, 'B', 10000); // ойналғаны 6000мс
    applyReconnect(state, 'B', 15000);  // 5000мс пауза
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 16000);
    expect(state.players.A.roundAnswer.atMs).toBe(7000); // 6000 + 1000, паузасыз
  });

  it('пауза кезіндегі жауап қатқан уақытпен қабылданады', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 14000);
    expect(state.players.A.roundAnswer.atMs).toBe(6000); // пауза сәтіндегі elapsed
  });

  it('паузада раунд аяқталса reveal да қатады, reconnect оны жалғастырады', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 5000);
    applyDisconnect(state, 'B', 6000);
    // A жауап берді → екеуі де жауапта → reveal, бірақ пауза сақталады
    const r = applyAnswer(state, 'A', 0, correctOf(state, 'A'), 8000);
    expect(state.phase).toBe('round_reveal');
    expect(state.paused).toBe(true);
    expect(state.pauseRemainingMs).toBe(REVEAL_MS);
    expect(timerOf(r.effects, 'revealEnd')).toBeUndefined(); // таймер қойылмайды
    expect(sendTo(r.effects, 'round:result', 'A').msg.nextRoundAt).toBe(8000 + REVEAL_MS);
    // reconnect → reveal қалған уақытпен жалғасады
    const r2 = applyReconnect(state, 'B', 12000);
    expect(state.paused).toBe(false);
    expect(state.phaseDeadline).toBe(12000 + REVEAL_MS);
    expect(timerOf(r2.effects, 'revealEnd').at).toBe(12000 + REVEAL_MS);
    expect(sendTo(r2.effects, 'match:snapshot', 'B').msg.revealPayload.round).toBe(0);
  });
});

describe('forfeit', () => {
  it('grace бітті → forfeit: мәжбүрлі outcome (алда тұрса да), persist + match:end', () => {
    const { state } = makeMatch();
    toRound0(state);
    // round 0: A бұрыс, B дұрыс → B алда
    applyAnswer(state, 'A', 0, wrongOf(state, 'A'), 5000);
    applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000);
    applyTimer(state, 'revealEnd', 8500); // round 1
    applyDisconnect(state, 'B', 10000);
    const r = applyTimer(state, 'grace:B', 30000);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'challenger', reason: 'forfeit' });
    const p = persistOf(r.effects);
    expect(p.data.outcome).toBe('challenger'); // resolveBattle 'opponent' берер еді — мәжбүрлі
    expect(p.data.challengerResult).toEqual({ correct: 0, durationMs: 1000 });
    expect(p.data.opponentResult).toEqual({ correct: 1, durationMs: 2000 });
    expect(sendTo(r.effects, 'match:end', 'A').msg)
      .toMatchObject({ outcome: 'win', reason: 'forfeit_opponent', scores: { you: 0, opponent: 1 } });
    expect(sendTo(r.effects, 'match:end', 'B').msg)
      .toMatchObject({ outcome: 'loss', reason: 'forfeit_you', scores: { you: 1, opponent: 0 } });
    expect(endOf(r.effects)).toBeTruthy();
  });

  it('reconnect-тен кейін ескі grace таймері еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000);
    applyReconnect(state, 'B', 15000);
    const r = applyTimer(state, 'grace:B', 30000);
    expect(r.effects).toEqual([]);
    expect(state.phase).toBe('round_active');
  });

  it('applyLeave → forfeit шыққанға қарсы', () => {
    const { state } = makeMatch();
    toRound0(state);
    const r = applyLeave(state, 'A', 5000);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({ outcome: 'opponent', reason: 'forfeit' });
    expect(persistOf(r.effects).data.outcome).toBe('opponent');
    expect(sendTo(r.effects, 'match:end', 'A').msg).toMatchObject({ outcome: 'loss', reason: 'forfeit_you' });
    expect(sendTo(r.effects, 'match:end', 'B').msg).toMatchObject({ outcome: 'win', reason: 'forfeit_opponent' });
  });

  it('finished күйде leave/disconnect/answer еленбейді', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyLeave(state, 'A', 5000);
    expect(applyLeave(state, 'B', 6000).effects).toEqual([]);
    expect(applyDisconnect(state, 'B', 6000).effects).toEqual([]);
    expect(applyAnswer(state, 'B', 0, 0, 6000).effects).toEqual([]);
    expect(applyTimer(state, 'roundDeadline', 20500).effects).toEqual([]);
  });
});

describe('aborted', () => {
  it('екеуі де disconnect → aborted, persist ЖОҚ, тек end', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000);
    const r = applyDisconnect(state, 'A', 11000);
    expect(state.phase).toBe('aborted');
    expect(persistOf(r.effects)).toBeUndefined();
    expect(sendsOf(r.effects, 'match:end')).toEqual([]);
    expect(endOf(r.effects)).toBeTruthy();
    // aborted күйде бәрі еленбейді
    expect(applyReconnect(state, 'A', 12000).effects).toEqual([]);
    expect(applyTimer(state, 'grace:B', 30000).effects).toEqual([]);
  });
});

describe('нұсқа-рет тәуелсіздігі', () => {
  it('бір канондық сұраққа A мен B-ның correctOption-ы әртүрлі', () => {
    const qs = generateQuestions({ continents: ['europe'], questionTypes: ['flag-country'], count: 10 });
    const canonical = makeMatch({ count: 10, questions: qs }).state.order[0];
    const cA = correctIndexes(qs, 11);
    // 0-раундтың канондық сұрағында айырма беретін seed-ті табамыз
    let seedB = null;
    for (let s = 12; s < 300; s++) {
      if (correctIndexes(qs, s)[canonical] !== cA[canonical]) { seedB = s; break; }
    }
    expect(seedB).not.toBeNull();
    const { state } = makeMatch({ count: 10, questions: qs, seedB });
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    const r = applyAnswer(state, 'B', 0, correctOf(state, 'B'), 6000);
    const resA = sendTo(r.effects, 'round:result', 'A').msg;
    const resB = sendTo(r.effects, 'round:result', 'B').msg;
    expect(resA.correctOption).not.toBe(resB.correctOption);
    expect(resA.yourCorrect).toBe(true); // екеуі де ӨЗ ретінде дұрыс
    expect(resB.yourCorrect).toBe(true);
  });
});

describe('snapshotFor', () => {
  it('countdown: countdownEndsAt', () => {
    const { state } = makeMatch();
    const s = snapshotFor(state, 'A', 2000);
    expect(s).toMatchObject({
      type: 'match:snapshot', phase: 'countdown', round: 0,
      countdownEndsAt: 4000, scores: { you: 0, opponent: 0 }, serverNow: 2000,
    });
    expect(s.opponent).toEqual({ id: 'B', name: 'Bek', class_name: '7B' });
    expect(s.question).toBeUndefined();
  });

  it('round_active: өз сұрағы + deadline', () => {
    const { state } = makeMatch();
    toRound0(state);
    const s = snapshotFor(state, 'B', 5000);
    expect(s.phase).toBe('round_active');
    expect(s.deadline).toBe(19000);
    expect(s.question.options).toHaveLength(4);
    expect(s.question).not.toHaveProperty('index');
  });

  it('round_reveal: revealPayload толық', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyAnswer(state, 'A', 0, correctOf(state, 'A'), 5000);
    applyAnswer(state, 'B', 0, wrongOf(state, 'B'), 6000);
    const s = snapshotFor(state, 'A', 7000);
    expect(s.phase).toBe('round_reveal');
    expect(s.revealPayload).toMatchObject({
      round: 0, yourCorrect: true, opponentCorrect: false,
      scores: { you: 1, opponent: 0 }, nextRoundAt: 8500,
    });
    expect(s.scores).toEqual({ you: 1, opponent: 0 });
  });

  it('паузада deadline = now + қалған уақыт', () => {
    const { state } = makeMatch();
    toRound0(state);
    applyDisconnect(state, 'B', 10000); // 9000 қалды
    const s = snapshotFor(state, 'A', 12000);
    expect(s.deadline).toBe(21000);
  });
});
