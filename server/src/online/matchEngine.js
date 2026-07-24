// Онлайн матчтың ТАЗА state machine-і: IO жоқ, Date.now() жоқ, таймер жоқ.
// Әр API {state, effects} қайтарады; effects-ті handler.js орындайды.
// Күй бір иеленген объектіде in-place мутацияланады (бір ағынды handler үшін қауіпсіз).
import { renderForPlayer, correctIndexes } from '../quiz.js';
import { seededShuffle } from '../random.js';
import { resolveBattle } from '../battleLogic.js';
import { BATTLE } from '../config.js';

export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 2500;
export const ANSWER_GRACE_MS = 1500;
export const DISCONNECT_GRACE_MS = 20000;

const ROUND_MS = BATTLE.questionSeconds * 1000;

const ignore = (state) => ({ state, effects: [] });
const isOver = (state) => state.phase === 'finished' || state.phase === 'aborted';
const otherId = (state, id) =>
  id === state.challengerId ? state.opponentId : state.challengerId;
const publicInfo = (p) => ({ id: p.id, name: p.name, class_name: p.class_name });

// Ағымдағы фазаның таймер аты (пауза/қалпына келтіру үшін)
function phaseTimerName(state) {
  if (state.phase === 'countdown') return 'countdownEnd';
  if (state.phase === 'round_active') return 'roundDeadline';
  if (state.phase === 'round_reveal') return 'revealEnd';
  return null;
}
function phaseTimerAt(state) {
  return state.phase === 'round_active'
    ? state.phaseDeadline + ANSWER_GRACE_MS
    : state.phaseDeadline;
}

export function createMatch({
  matchId, challengerId, opponentId, playerMeta, questions, config, matchSeed, now,
}) {
  const state = {
    matchId, config, questions,
    totalRounds: questions.length,
    order: seededShuffle(questions.map((_, i) => i), matchSeed), // ортақ сұрақ реті
    round: 0,
    phase: 'countdown',
    phaseDeadline: now + COUNTDOWN_MS,
    roundStartAt: null,
    paused: false,
    pauseRemainingMs: null,
    challengerId, opponentId,
    players: {},
    result: null,
  };
  for (const id of [challengerId, opponentId]) {
    const meta = playerMeta[id];
    const rendered = new Map(); // canonicalIdx → per-player нұсқа
    for (const item of renderForPlayer(questions, meta.lang, meta.seed)) {
      rendered.set(item.index, item);
    }
    state.players[id] = {
      id, lang: meta.lang, seed: meta.seed,
      name: meta.name, class_name: meta.class_name,
      rendered,
      correct: correctIndexes(questions, meta.seed),
      score: 0, durationMs: 0,
      roundAnswer: null,
      connected: true, graceDeadline: null,
    };
  }
  const effects = [challengerId, opponentId].map((id) => ({
    type: 'send', to: id,
    msg: {
      type: 'match:start', matchId,
      opponent: publicInfo(state.players[otherId(state, id)]),
      config, totalRounds: state.totalRounds,
      countdownEndsAt: state.phaseDeadline, serverNow: now,
    },
  }));
  effects.push({ type: 'setTimer', name: 'countdownEnd', at: state.phaseDeadline });
  return { state, effects };
}

function questionFor(state, id) {
  const q = state.players[id].rendered.get(state.order[state.round]);
  return { type: q.type, display: q.display, options: q.options };
}

function startRound(state, roundIdx, now) {
  state.round = roundIdx;
  state.phase = 'round_active';
  state.roundStartAt = now;
  state.phaseDeadline = now + ROUND_MS;
  const effects = [];
  for (const p of Object.values(state.players)) {
    p.roundAnswer = null;
    effects.push({
      type: 'send', to: p.id,
      msg: {
        type: 'round:start', matchId: state.matchId,
        round: roundIdx, total: state.totalRounds,
        question: questionFor(state, p.id),
        deadline: state.phaseDeadline, serverNow: now,
      },
    });
  }
  effects.push({ type: 'setTimer', name: 'roundDeadline', at: state.phaseDeadline + ANSWER_GRACE_MS });
  return effects;
}

function revealPayloadFor(state, id, now) {
  const p = state.players[id];
  const opp = state.players[otherId(state, id)];
  return {
    type: 'round:result', matchId: state.matchId, round: state.round,
    correctOption: p.correct[state.order[state.round]],
    yourAnswer: p.roundAnswer.optionIndex,
    yourCorrect: p.roundAnswer.correct,
    opponentCorrect: opp.roundAnswer.correct,
    scores: { you: p.score, opponent: opp.score },
    nextRoundAt: state.paused ? now + state.pauseRemainingMs : state.phaseDeadline,
    serverNow: now,
  };
}

function finishRound(state, now) {
  const canonical = state.order[state.round];
  for (const p of Object.values(state.players)) {
    const ok = p.roundAnswer.optionIndex !== null
      && p.roundAnswer.optionIndex === p.correct[canonical];
    p.roundAnswer.correct = ok;
    if (ok) p.score += 1;
    p.durationMs += p.roundAnswer.atMs;
  }
  state.phase = 'round_reveal';
  state.phaseDeadline = now + REVEAL_MS;
  // қарсылас өшік болса reveal да қатып тұрады, reconnect кезінде жалғасады
  if (state.paused) state.pauseRemainingMs = REVEAL_MS;
  const effects = [state.challengerId, state.opponentId].map((id) => ({
    type: 'send', to: id, msg: revealPayloadFor(state, id, now),
  }));
  if (!state.paused) {
    effects.push({ type: 'setTimer', name: 'revealEnd', at: state.phaseDeadline });
  }
  return effects;
}

function endMatch(state, outcome, reason, now) {
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
  effects.push({ type: 'end' });
  return effects;
}

function finishMatch(state, now) {
  const ch = state.players[state.challengerId];
  const op = state.players[state.opponentId];
  const outcome = resolveBattle(
    { correct: ch.score, durationMs: ch.durationMs },
    { correct: op.score, durationMs: op.durationMs },
  );
  return endMatch(state, outcome, 'completed', now);
}

function forfeit(state, loserId, now) {
  const winnerSide = loserId === state.challengerId ? 'opponent' : 'challenger';
  return endMatch(state, winnerSide, 'forfeit', now);
}

export function applyAnswer(state, studentId, round, optionIndex, now) {
  const p = state.players[studentId];
  if (!p) return ignore(state);
  if (state.phase !== 'round_active') return ignore(state);
  if (round !== state.round) return ignore(state);
  if (p.roundAnswer) return ignore(state); // қос жауап
  const options = p.rendered.get(state.order[state.round]).options;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
    return ignore(state);
  }
  if (!state.paused && now > state.phaseDeadline + ANSWER_GRACE_MS) return ignore(state);
  // паузада уақыт қатып тұр: elapsed = ROUND_MS - қалған
  const atMs = state.paused ? ROUND_MS - state.pauseRemainingMs : now - state.roundStartAt;
  p.roundAnswer = { optionIndex, atMs };
  const opp = state.players[otherId(state, p.id)];
  const effects = [];
  if (opp.connected) {
    effects.push({ type: 'send', to: opp.id, msg: { type: 'round:opponent_answered', round } });
  }
  if (opp.roundAnswer) effects.push(...finishRound(state, now));
  return { state, effects };
}

export function applyTimer(state, timerName, now) {
  if (isOver(state)) return ignore(state);
  if (timerName.startsWith('grace:')) {
    const p = state.players[timerName.slice('grace:'.length)];
    if (!p || p.connected) return ignore(state); // reconnect-тен кейінгі ескі таймер
    return { state, effects: forfeit(state, p.id, now) };
  }
  if (state.paused) return ignore(state); // паузада фаза алға жылжымайды
  if (timerName === 'countdownEnd') {
    if (state.phase !== 'countdown') return ignore(state);
    return { state, effects: startRound(state, 0, now) };
  }
  if (timerName === 'roundDeadline') {
    if (state.phase !== 'round_active') return ignore(state);
    for (const p of Object.values(state.players)) {
      if (!p.roundAnswer) p.roundAnswer = { optionIndex: null, atMs: ROUND_MS };
    }
    return { state, effects: finishRound(state, now) };
  }
  if (timerName === 'revealEnd') {
    if (state.phase !== 'round_reveal') return ignore(state);
    if (state.round + 1 < state.totalRounds) {
      return { state, effects: startRound(state, state.round + 1, now) };
    }
    return { state, effects: finishMatch(state, now) };
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
  state.paused = true;
  state.pauseRemainingMs = state.phaseDeadline - now; // phaseDeadline қатып қалады
  p.graceDeadline = now + DISCONNECT_GRACE_MS;
  const effects = [];
  const timerName = phaseTimerName(state);
  if (timerName) effects.push({ type: 'clearTimer', name: timerName });
  effects.push({ type: 'setTimer', name: `grace:${p.id}`, at: p.graceDeadline });
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
  if (wasDisconnected && state.paused) {
    // қалған уақытпен жалғастыру; atMs әділдігі үшін roundStartAt пауза ұзақтығына жылжиды
    state.paused = false;
    state.phaseDeadline = now + state.pauseRemainingMs;
    state.pauseRemainingMs = null;
    if (state.phase === 'round_active') {
      state.roundStartAt = state.phaseDeadline - ROUND_MS;
    }
    const timerName = phaseTimerName(state);
    if (timerName) effects.push({ type: 'setTimer', name: timerName, at: phaseTimerAt(state) });
    effects.push({ type: 'send', to: p.id, msg: snapshotFor(state, p.id, now) });
    effects.push({
      type: 'send', to: otherId(state, p.id),
      msg: { type: 'match:opponent_reconnected', deadline: state.phaseDeadline, serverNow: now },
    });
  } else {
    // жаңа сокетпен қайта келді (пауза жоқ) — тек snapshot
    effects.push({ type: 'send', to: p.id, msg: snapshotFor(state, p.id, now) });
  }
  return { state, effects };
}

export function applyLeave(state, studentId, now) {
  const p = state.players[studentId];
  if (!p || isOver(state)) return ignore(state);
  return { state, effects: forfeit(state, p.id, now) };
}

// Тек хабарлама payload-ын қайтарады ({state, effects} ЕМЕС)
export function snapshotFor(state, studentId, now) {
  const p = state.players[studentId];
  if (!p) return null;
  const opp = state.players[otherId(state, p.id)];
  const msg = {
    type: 'match:snapshot',
    phase: state.phase, round: state.round,
    scores: { you: p.score, opponent: opp.score },
    opponent: publicInfo(opp),
    serverNow: now,
  };
  const effDeadline = state.paused ? now + state.pauseRemainingMs : state.phaseDeadline;
  if (state.phase === 'countdown') msg.countdownEndsAt = effDeadline;
  if (state.phase === 'round_active') {
    msg.question = questionFor(state, p.id);
    msg.deadline = effDeadline;
  }
  if (state.phase === 'round_reveal') msg.revealPayload = revealPayloadFor(state, p.id, now);
  return msg;
}
