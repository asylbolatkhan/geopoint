// Онлайн матчтың ТАЗА state machine-і (RACE): IO жоқ, Date.now() жоқ, таймер жоқ.
// Әр API {state, effects} қайтарады; effects-ті handler.js орындайды.
// Күй бір иеленген объектіде in-place мутацияланады (бір ағынды handler үшін қауіпсіз).
// RACE: ортақ countdown-нан кейін әр ойыншы ӨЗ тізбегімен өз қарқынымен жүреді.
import { renderForPlayer, correctIndexes } from '../quiz.js';
import { resolveBattle } from '../battleLogic.js';
import { BATTLE } from '../config.js';

export const COUNTDOWN_MS = 3000;
export const FEEDBACK_MS = 900;
export const ANSWER_GRACE_MS = 1500;
export const DISCONNECT_GRACE_MS = 20000;

const ROUND_MS = BATTLE.questionSeconds * 1000;

const ignore = (state) => ({ state, effects: [] });
const isOver = (state) => state.phase === 'finished' || state.phase === 'aborted';
const otherId = (state, id) =>
  id === state.challengerId ? state.opponentId : state.challengerId;
const publicInfo = (p) => ({ id: p.id, name: p.name, class_name: p.class_name });

// Қанша сұрақ аяқталған ('feedback' — ағымдағы сұрақ аяқталды деген сөз)
const answeredCount = (state, p) =>
  p.sub === 'done' ? state.total : p.sub === 'feedback' ? p.idx + 1 : p.idx;
const progressOf = (state, p) => ({
  answered: answeredCount(state, p), score: p.score, finished: p.sub === 'done',
});
// Канондық index клиентке АҚПАЙДЫ (anti-cheat)
const questionOf = (p) => {
  const q = p.seq[p.idx];
  return { type: q.type, display: q.display, options: q.options };
};

export function createMatch({
  matchId, challengerId, opponentId, playerMeta, questions, config, now,
}) {
  const state = {
    matchId, config, questions,
    total: questions.length,
    phase: 'countdown',
    countdownEndsAt: now + COUNTDOWN_MS,
    challengerId, opponentId,
    players: {},
    result: null,
  };
  for (const id of [challengerId, opponentId]) {
    const meta = playerMeta[id];
    state.players[id] = {
      id, name: meta.name, class_name: meta.class_name,
      seq: renderForPlayer(questions, meta.lang, meta.seed), // ӨЗ реті (per-player)
      correct: correctIndexes(questions, meta.seed), // canonical-индекстелген
      idx: 0, sub: 'question',
      qStartAt: null, qDeadline: null, nextAt: null,
      lastResult: null, frozen: null,
      score: 0, durationMs: 0, finishedAt: null,
      connected: true, graceDeadline: null,
    };
  }
  const effects = [challengerId, opponentId].map((id) => ({
    type: 'send', to: id,
    msg: {
      type: 'match:start', matchId,
      opponent: publicInfo(state.players[otherId(state, id)]),
      config, totalRounds: state.total,
      countdownEndsAt: state.countdownEndsAt, serverNow: now,
    },
  }));
  effects.push({ type: 'setTimer', name: 'countdownEnd', at: state.countdownEndsAt });
  return { state, effects };
}

function startQuestion(state, p, i, now) {
  p.idx = i;
  p.sub = 'question';
  p.qStartAt = now;
  p.qDeadline = now + ROUND_MS;
  p.nextAt = null;
  p.lastResult = null;
  return [
    {
      type: 'send', to: p.id,
      msg: {
        type: 'q:start', matchId: state.matchId,
        idx: i, total: state.total,
        question: questionOf(p),
        deadline: p.qDeadline, serverNow: now,
      },
    },
    { type: 'setTimer', name: `q:${p.id}`, at: p.qDeadline + ANSWER_GRACE_MS },
  ];
}

// Жауап немесе timeout (optionIndex=null) → жеке нәтиже + 900мс фидбэк
function completeQuestion(state, p, optionIndex, atMs, now) {
  const canonical = p.seq[p.idx].index;
  const ok = optionIndex !== null && optionIndex === p.correct[canonical];
  if (ok) p.score += 1;
  p.durationMs += atMs;
  p.lastResult = { correctOption: p.correct[canonical], yourAnswer: optionIndex, yourCorrect: ok };
  p.sub = 'feedback';
  p.nextAt = now + FEEDBACK_MS;
  p.qStartAt = null;
  p.qDeadline = null;
  const opp = state.players[otherId(state, p.id)];
  const effects = [
    { type: 'clearTimer', name: `q:${p.id}` },
    {
      type: 'send', to: p.id,
      msg: {
        type: 'q:result', matchId: state.matchId, idx: p.idx,
        ...p.lastResult,
        scores: { you: p.score, opponent: opp.score },
        nextAt: p.nextAt, serverNow: now,
      },
    },
  ];
  if (opp.connected) {
    effects.push({
      type: 'send', to: opp.id,
      msg: { type: 'opponent:progress', ...progressOf(state, p) },
    });
  }
  effects.push({ type: 'setTimer', name: `next:${p.id}`, at: p.nextAt });
  return effects;
}

// Соңғы фидбэк бітті → done; қарсылас та done болса — матч аяқталады
function finishPlayer(state, p, now) {
  p.sub = 'done';
  p.finishedAt = now;
  p.nextAt = null;
  p.lastResult = null;
  const opp = state.players[otherId(state, p.id)];
  if (opp.sub === 'done') return finishMatch(state);
  const effects = [{
    type: 'send', to: p.id,
    msg: {
      type: 'match:waiting', matchId: state.matchId,
      opponentProgress: progressOf(state, opp),
      opponentDisconnected: opp.connected ? null : (opp.graceDeadline ?? true),
      serverNow: now,
    },
  }];
  if (opp.connected) {
    effects.push({
      type: 'send', to: opp.id,
      msg: { type: 'opponent:progress', ...progressOf(state, p) },
    });
  }
  return effects;
}

function endMatch(state, outcome, reason) {
  state.phase = 'finished';
  state.result = { outcome, reason };
  const ch = state.players[state.challengerId];
  const op = state.players[state.opponentId];
  const effects = [{
    type: 'persist',
    data: {
      challengerId: state.challengerId, opponentId: state.opponentId,
      config: state.config, questions: state.questions,
      challengerResult: { correct: ch.score, durationMs: ch.durationMs },
      opponentResult: { correct: op.score, durationMs: op.durationMs },
      outcome,
    },
  }];
  for (const id of [state.challengerId, state.opponentId]) {
    const side = id === state.challengerId ? 'challenger' : 'opponent';
    const p = state.players[id];
    const o = state.players[otherId(state, id)];
    effects.push({
      type: 'send', to: id,
      msg: {
        type: 'match:end', matchId: state.matchId,
        outcome: outcome === 'draw' ? 'draw' : outcome === side ? 'win' : 'loss',
        reason: reason === 'completed' ? 'completed'
          : outcome === side ? 'forfeit_opponent' : 'forfeit_you',
        scores: { you: p.score, opponent: o.score },
        // battleId/yourPoints-ты handler DB commit-тен кейін толтырады
      },
    });
  }
  effects.push({ type: 'end' }); // handler БАРЛЫҚ таймерді (grace-терді де) тазалайды
  return effects;
}

function finishMatch(state) {
  const ch = state.players[state.challengerId];
  const op = state.players[state.opponentId];
  const outcome = resolveBattle(
    { correct: ch.score, durationMs: ch.durationMs },
    { correct: op.score, durationMs: op.durationMs },
  );
  return endMatch(state, outcome, 'completed');
}

function forfeit(state, loserId) {
  const winnerSide = loserId === state.challengerId ? 'opponent' : 'challenger';
  return endMatch(state, winnerSide, 'forfeit');
}

export function applyAnswer(state, studentId, idx, optionIndex, now) {
  const p = state.players[studentId];
  if (!p) return ignore(state);
  if (state.phase !== 'racing') return ignore(state);
  if (!p.connected) return ignore(state); // өшік ойыншыдан жауап еленбейді
  if (p.sub !== 'question') return ignore(state);
  if (idx !== p.idx) return ignore(state); // ескі/бөтен сұрақ
  const options = p.seq[p.idx].options;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
    return ignore(state);
  }
  if (now > p.qDeadline + ANSWER_GRACE_MS) return ignore(state);
  // Жылдамдық — тай-брейк, сондықтан grace-жауап та ROUND_MS-пен кэптеледі
  const atMs = Math.min(ROUND_MS, now - p.qStartAt);
  return { state, effects: completeQuestion(state, p, optionIndex, atMs, now) };
}

export function applyTimer(state, timerName, now) {
  if (isOver(state)) return ignore(state);
  if (timerName === 'countdownEnd') {
    if (state.phase !== 'countdown') return ignore(state);
    state.phase = 'racing';
    const effects = [];
    for (const p of Object.values(state.players)) {
      if (p.connected) {
        effects.push(...startQuestion(state, p, 0, now));
      } else {
        // өшік ойыншы: q0 «қатып» тұрады, reconnect кезінде толық 15с алады
        p.idx = 0;
        p.sub = 'question';
        p.frozen = { kind: 'q', remainingMs: ROUND_MS };
      }
    }
    return { state, effects };
  }
  if (timerName.startsWith('grace:')) {
    const p = state.players[timerName.slice('grace:'.length)];
    // ескі таймер (reconnect-тен кейін) / done-ойыншы ЕШҚАШАН grace-пен жеңілмейді
    if (!p || p.connected || p.sub === 'done') return ignore(state);
    return { state, effects: forfeit(state, p.id) };
  }
  if (timerName.startsWith('q:')) {
    const p = state.players[timerName.slice('q:'.length)];
    if (!p || state.phase !== 'racing') return ignore(state);
    if (p.sub !== 'question' || p.frozen) return ignore(state); // ескі таймер
    return { state, effects: completeQuestion(state, p, null, ROUND_MS, now) };
  }
  if (timerName.startsWith('next:')) {
    const p = state.players[timerName.slice('next:'.length)];
    if (!p || state.phase !== 'racing') return ignore(state);
    if (p.sub !== 'feedback' || p.frozen) return ignore(state); // ескі таймер
    if (p.idx + 1 < state.total) {
      return { state, effects: startQuestion(state, p, p.idx + 1, now) };
    }
    return { state, effects: finishPlayer(state, p, now) };
  }
  return ignore(state);
}

export function applyDisconnect(state, studentId, now) {
  const p = state.players[studentId];
  if (!p || !p.connected || isOver(state)) return ignore(state);
  p.connected = false;
  const opp = state.players[otherId(state, p.id)];
  if (!opp.connected) {
    // екеуі де өшік → матч жойылады, ештеңе жазылмайды
    state.phase = 'aborted';
    state.result = { outcome: null, reason: 'aborted' };
    return { state, effects: [{ type: 'end' }] };
  }
  const effects = [];
  // Тек ӨЗ таймері қатады — қарсыластың жарысына әсер жоқ.
  // countdown кезінде freeze жоқ (countdownEnd өзі өшік ойыншыны frozen q0 етеді).
  if (state.phase === 'racing' && p.sub === 'question') {
    p.frozen = { kind: 'q', remainingMs: Math.max(0, p.qDeadline - now) };
    effects.push({ type: 'clearTimer', name: `q:${p.id}` });
  } else if (state.phase === 'racing' && p.sub === 'feedback') {
    p.frozen = { kind: 'next', remainingMs: Math.max(0, p.nextAt - now) };
    effects.push({ type: 'clearTimer', name: `next:${p.id}` });
  }
  // Аяқтаған ('done') ойыншыға grace ҚОЙЫЛМАЙДЫ — нәтижесі сақталады, жазаланбайды
  if (p.sub !== 'done') {
    p.graceDeadline = now + DISCONNECT_GRACE_MS;
    effects.push({ type: 'setTimer', name: `grace:${p.id}`, at: p.graceDeadline });
  }
  effects.push({
    type: 'send', to: opp.id,
    msg: { type: 'match:opponent_disconnected', graceEndsAt: p.graceDeadline, serverNow: now },
  });
  return { state, effects };
}

export function applyReconnect(state, studentId, now) {
  const p = state.players[studentId];
  if (!p || isOver(state)) return ignore(state);
  const wasDisconnected = !p.connected;
  p.connected = true;
  p.graceDeadline = null;
  const effects = [];
  if (wasDisconnected) effects.push({ type: 'clearTimer', name: `grace:${p.id}` });
  if (p.frozen) {
    if (p.frozen.kind === 'q') {
      // qStartAt артқа жылжиды — atMs офлайн уақытын қоспайды
      p.qDeadline = now + p.frozen.remainingMs;
      p.qStartAt = p.qDeadline - ROUND_MS;
      effects.push({ type: 'setTimer', name: `q:${p.id}`, at: p.qDeadline + ANSWER_GRACE_MS });
    } else {
      p.nextAt = now + p.frozen.remainingMs;
      effects.push({ type: 'setTimer', name: `next:${p.id}`, at: p.nextAt });
    }
    p.frozen = null;
  }
  effects.push({ type: 'send', to: p.id, msg: snapshotFor(state, p.id, now) });
  if (wasDisconnected) {
    // deadline ЖОҚ — қарсыластың өз таймеріне тиіспейміз
    effects.push({
      type: 'send', to: otherId(state, p.id),
      msg: { type: 'match:opponent_reconnected', serverNow: now },
    });
  }
  return { state, effects };
}

export function applyLeave(state, studentId, now) {
  const p = state.players[studentId];
  if (!p || isOver(state)) return ignore(state);
  return { state, effects: forfeit(state, p.id) }; // done-да да — саналы шығу
}

// Тек хабарлама payload-ын қайтарады ({state, effects} ЕМЕС)
export function snapshotFor(state, studentId, now) {
  const p = state.players[studentId];
  if (!p) return null;
  const opp = state.players[otherId(state, p.id)];
  const msg = {
    type: 'match:snapshot',
    matchId: state.matchId, total: state.total,
    phase: state.phase,
    scores: { you: p.score, opponent: opp.score },
    opponent: publicInfo(opp),
    serverNow: now,
  };
  if (state.phase === 'countdown') msg.countdownEndsAt = state.countdownEndsAt;
  if (state.phase === 'racing') {
    msg.idx = p.idx;
    msg.sub = p.sub;
    msg.opponentProgress = progressOf(state, opp);
    // done-ойыншыда graceDeadline жоқ → уақытсыз белгі (true)
    msg.opponentDisconnected = opp.connected ? null : (opp.graceDeadline ?? true);
    if (p.sub === 'question') {
      msg.question = questionOf(p);
      msg.deadline = p.frozen ? now + p.frozen.remainingMs : p.qDeadline;
    } else if (p.sub === 'feedback') {
      msg.question = questionOf(p);
      msg.feedback = {
        ...p.lastResult,
        nextAt: p.frozen ? now + p.frozen.remainingMs : p.nextAt,
      };
    }
    // sub 'done' → сұрақсыз (күту-экран пішіні)
  }
  return msg;
}
