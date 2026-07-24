// Онлайн батл оркестрациясы: шақырулар + матч-жүргізу. Жалғыз stateful желім —
// барлық ойын логикасы таза matchEngine.js-те, бұл файл тек сокет/таймер/DB IO.
// Транспорт конвенциясы бойынша бұл файлға тест жазылмайды (жұқа қабат).
import { randomUUID, randomInt } from 'node:crypto';
import * as registry from './registry.js';
import {
  createMatch, applyAnswer, applyTimer, applyDisconnect, applyReconnect,
  applyLeave, snapshotFor,
} from './matchEngine.js';
import { persistOnlineBattle } from './persist.js';
import { countBattlesTodayBetween } from '../routes/battles.js';
import { challengeEligibility } from '../battleLogic.js';
import { isTopStudent } from '../eligibility.js';
import { parseGameConfig, generateQuestions } from '../quiz.js';
import { notify } from '../bot.js';
import { M } from '../messages.js';
import { BATTLE } from '../config.js';
import { query } from '../db.js';
import { isDbId } from '../ids.js';

const INVITE_TTL_MS = 90000;
const SEED_MAX = 2 ** 31; // randomInt жоғарғы шегі (exclusive)

// ---------------------------------------------------------------- көмекшілер

function sendTo(studentId, msg) {
  const ws = registry.sockets.get(studentId);
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // жабылып жатқан сокетке жазу — елеусіз
  }
}

function sendInviteError(studentId, code) {
  sendTo(studentId, { type: 'invite:error', code });
}

async function studentWithClass(id) {
  const { rows } = await query(
    `SELECT s.*, c.name AS class_name
     FROM students s LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ------------------------------------------------------------ effect-раннер

// Бір apply* шақыруының эффектілері қатаң ретпен орындалады; матч ішіндегі
// batch-тер бір-біріне қабаттаспау үшін per-match promise-тізбек қолданылады
// ('persist' await кезінде келген жаңа batch кезекте күтеді).
function dispatch(match, effects) {
  match.queue = match.queue
    .then(() => runEffects(match, effects))
    .catch((e) => console.error('online effects failed:', e));
}

// setTimer — replace-and-clear: сол атпен бұрын қойылған setTimeout алдымен
// өшіріледі (ерте жауапталған раундтың ескі roundDeadline-і келесі раундты
// қателесіп жаппауы үшін).
function setMatchTimer(match, name, at) {
  const existing = match.timers.get(name);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    match.timers.delete(name);
    // 'end' орындалған соң (немесе матч жойылған соң) ескі таймер атылмайды
    if (registry.matches.get(match.state.matchId) !== match) return;
    const { effects } = applyTimer(match.state, name, Date.now());
    dispatch(match, effects);
  }, Math.max(0, at - Date.now()));
  match.timers.set(name, timer);
}

function clearAllTimers(match) {
  for (const t of match.timers.values()) clearTimeout(t);
  match.timers.clear();
}

async function runEffects(match, effects) {
  const { state } = match;
  // persist нәтижесі: null (әлі жоқ) | {battleId, events} | 'failed'.
  // Эффектілер ретпен өңделеді, ал движок persist-ті match:end send-терінен
  // БҰРЫН шығарады — сондықтан await persist аяқталғанша match:end-тер
  // табиғи түрде «буферде» тұрады да, battleId/yourPoints толықтырылып барып
  // жіберіледі (match:end клиентке тек DB commit-тен КЕЙІН кетеді).
  let persisted = null;
  for (const eff of effects) {
    if (eff.type === 'send') {
      const targets = eff.to === 'both' ? [state.challengerId, state.opponentId] : [eff.to];
      for (const to of targets) {
        const msg = eff.msg;
        if (msg.type === 'match:end') {
          if (persisted === 'failed') continue; // commit жоқ → match:end жоқ
          if (persisted) {
            const side = to === state.challengerId ? 'challenger' : 'opponent';
            msg.battleId = persisted.battleId;
            msg.yourPoints = persisted.events
              .filter((ev) => ev.who === side)
              .reduce((sum, ev) => sum + ev.amount, 0);
          }
        }
        sendTo(to, msg);
      }
    } else if (eff.type === 'setTimer') {
      setMatchTimer(match, eff.name, eff.at);
    } else if (eff.type === 'clearTimer') {
      const t = match.timers.get(eff.name);
      if (t) {
        clearTimeout(t);
        match.timers.delete(eff.name);
      }
    } else if (eff.type === 'persist') {
      try {
        persisted = await persistOnlineBattle(eff.data);
      } catch (e) {
        console.error('online battle persist failed:', e);
        persisted = 'failed';
        sendTo(state.challengerId, { type: 'error', code: 'persist_failed' });
        sendTo(state.opponentId, { type: 'error', code: 'persist_failed' });
      }
    } else if (eff.type === 'end') {
      // матчтың БАРЛЫҚ таймерлері тазаланады + registry-ден өшеді
      clearAllTimers(match);
      registry.matches.delete(state.matchId);
      for (const id of [state.challengerId, state.opponentId]) {
        if (registry.matchByStudent.get(id) === state.matchId) {
          registry.matchByStudent.delete(id);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- шақырулар

function incomingMsg(invite) {
  return {
    type: 'invite:incoming',
    inviteId: invite.id,
    from: { id: invite.fromId, name: invite.fromName, class_name: invite.fromClassName },
    config: invite.config,
    expiresAt: invite.expiresAt,
    serverNow: Date.now(),
  };
}

function dropInvite(invite) {
  clearTimeout(invite.timer);
  registry.invites.delete(invite.id);
}

// TTL біткенде: invite өшеді, екі жаққа да (онлайн болса) invite:expired
function expireInviteByTtl(inviteId) {
  const invite = registry.invites.get(inviteId);
  if (!invite) return;
  registry.invites.delete(inviteId);
  sendTo(invite.fromId, { type: 'invite:expired', inviteId });
  sendTo(invite.toId, { type: 'invite:expired', inviteId });
}

// Матч басталғанда aId/bId қатысқан БАРЛЫҚ басқа кезектегі шақырулар өшеді.
// invite:expired тек матчқа кірмеген тарапқа жіберіледі — матч ойыншыларының
// клиенттері match:start алады, оларға қосымша expired тост қажет емес
// (өзара A↔B кейсінде кері шақыру үнсіз өшеді).
function expireInvitesInvolving(aId, bId) {
  const matched = new Set([aId, bId]);
  for (const invite of [...registry.invites.values()]) {
    if (!matched.has(invite.fromId) && !matched.has(invite.toId)) continue;
    dropInvite(invite);
    for (const party of [invite.fromId, invite.toId]) {
      if (!matched.has(party)) sendTo(party, { type: 'invite:expired', inviteId: invite.id });
    }
  }
}

// Тексеру тәртібі (жоспар бойынша): bad_config / self / busy_you /
// already_pending / busy_target / not_eligible / daily_cap.
// challengeEligibility-дің 'bad_opponent' нәтижесі де, қарсылас жоқ/approved
// емес кейсі де not_eligible кодына жиналады — протоколда бөлек bad_opponent
// коды жоқ, ал клиент үшін екеуі де «бұл қарсыласқа болмайды» дегенді білдіреді.
async function handleInviteSend(student, msg) {
  const config = parseGameConfig(msg.config);
  if (!config) return sendInviteError(student.id, 'bad_config');
  const toId = Number(msg.toStudentId);
  if (toId === student.id) return sendInviteError(student.id, 'self');
  if (registry.matchByStudent.has(student.id)) return sendInviteError(student.id, 'busy_you');
  for (const invite of registry.invites.values()) {
    if (invite.fromId === student.id) return sendInviteError(student.id, 'already_pending');
  }
  if (registry.matchByStudent.has(toId)) return sendInviteError(student.id, 'busy_target');
  if (!isDbId(toId)) return sendInviteError(student.id, 'not_eligible');
  const [sender, target] = await Promise.all([
    studentWithClass(student.id), studentWithClass(toId),
  ]);
  if (!sender || !target || target.status !== 'approved') {
    return sendInviteError(student.id, 'not_eligible');
  }
  const challengerIsTop =
    sender.role === 'student' && target.role === 'teacher'
      ? await isTopStudent(sender.id)
      : true;
  const verdict = challengeEligibility({
    challengerRole: sender.role,
    opponentRole: target.role,
    challengerIsTop,
  });
  if (verdict !== 'ok') return sendInviteError(student.id, 'not_eligible');
  if ((await countBattlesTodayBetween(sender.id, target.id)) >= BATTLE.dailyPerOpponent) {
    return sendInviteError(student.id, 'daily_cap');
  }

  const id = randomUUID();
  const invite = {
    id,
    fromId: sender.id,
    toId: target.id,
    fromName: sender.name,
    fromClassName: sender.class_name || null,
    config,
    expiresAt: Date.now() + INVITE_TTL_MS,
    timer: setTimeout(() => expireInviteByTtl(id), INVITE_TTL_MS),
  };
  registry.invites.set(id, invite);
  sendTo(sender.id, {
    type: 'invite:sent', inviteId: id, expiresAt: invite.expiresAt, serverNow: Date.now(),
  });
  if (registry.isOnline(target.id)) sendTo(target.id, incomingMsg(invite));
  // ӘРҚАШАН бот push (офлайн қарсылас 90с ішінде кіре алады); notify өзі
  // қатені жұтады — fire-and-forget
  notify(target.tg_user_id, M[target.lang].onlineInvite(sender.name), target.lang);
}

async function handleInviteAccept(student, msg) {
  const invite = registry.invites.get(msg.inviteId);
  if (!invite || invite.expiresAt <= Date.now()) {
    return sendInviteError(student.id, 'not_found');
  }
  if (invite.toId !== student.id) return; // бөтен шақыру — еленбейді
  const challengerId = invite.fromId;
  if (!registry.isOnline(challengerId)) {
    dropInvite(invite);
    return sendInviteError(student.id, 'challenger_offline');
  }
  if (registry.matchByStudent.has(student.id)) return sendInviteError(student.id, 'busy_you');
  if (registry.matchByStudent.has(challengerId)) return sendInviteError(student.id, 'busy_target');

  // Синхронды бөлім: registry мутациялары төмендегі await-тарға ДЕЙІН
  // орындалады — қатарлас екінші accept (сол ойыншылардың бірімен) busy көреді.
  dropInvite(invite);
  expireInvitesInvolving(challengerId, student.id);
  const matchId = randomUUID();
  registry.matchByStudent.set(challengerId, matchId);
  registry.matchByStudent.set(student.id, matchId);

  let challenger;
  let opponent;
  try {
    [challenger, opponent] = await Promise.all([
      studentWithClass(challengerId), studentWithClass(student.id),
    ]);
    if (!challenger || !opponent) throw new Error('student row missing');
  } catch (e) {
    console.error('online match setup failed:', e);
    registry.matchByStudent.delete(challengerId);
    registry.matchByStudent.delete(student.id);
    return sendInviteError(student.id, 'not_found');
  }

  const questions = generateQuestions(invite.config); // БІР РЕТ — ортақ тізім
  const playerMeta = {
    [challenger.id]: {
      lang: challenger.lang, seed: randomInt(SEED_MAX),
      name: challenger.name, class_name: challenger.class_name || null,
    },
    [opponent.id]: {
      lang: opponent.lang, seed: randomInt(SEED_MAX),
      name: opponent.name, class_name: opponent.class_name || null,
    },
  };
  const { state, effects } = createMatch({
    matchId,
    challengerId,
    opponentId: student.id,
    playerMeta,
    questions,
    config: invite.config,
    matchSeed: randomInt(SEED_MAX),
    now: Date.now(),
  });
  const match = { state, timers: new Map(), queue: Promise.resolve() };
  registry.matches.set(matchId, match);
  dispatch(match, effects);
}

function handleInviteCancel(student, msg) {
  const invite = registry.invites.get(msg.inviteId);
  if (!invite || invite.fromId !== student.id) return; // тек жіберуші болдырмайды
  dropInvite(invite);
  sendTo(invite.toId, { type: 'invite:cancelled', inviteId: invite.id });
}

function handleInviteDecline(student, msg) {
  const invite = registry.invites.get(msg.inviteId);
  if (!invite || invite.toId !== student.id) return; // тек алушы бас тартады
  dropInvite(invite);
  sendTo(invite.fromId, { type: 'invite:declined', inviteId: invite.id });
}

// -------------------------------------------------------------------- матч

// Жіберуші НАҚ ОСЫ матчтың қатысушысы болса ғана қайтарады, әйтпесе null
function matchForMember(studentId, matchId) {
  if (typeof matchId !== 'string') return null;
  if (registry.matchByStudent.get(studentId) !== matchId) return null;
  return registry.matches.get(matchId) || null;
}

function handleRoundAnswer(student, msg) {
  if (!Number.isInteger(msg.round)) return;
  if (!Number.isInteger(msg.optionIndex) || msg.optionIndex < 0 || msg.optionIndex > 3) return;
  const match = matchForMember(student.id, msg.matchId);
  if (!match) return; // бөтен/жоқ матч — үнсіз еленбейді
  const { effects } = applyAnswer(match.state, student.id, msg.round, msg.optionIndex, Date.now());
  dispatch(match, effects);
}

function handleMatchLeave(student, msg) {
  const match = matchForMember(student.id, msg.matchId);
  if (!match) return;
  const { effects } = applyLeave(match.state, student.id, Date.now());
  dispatch(match, effects);
}

function handleMatchState(student) {
  const matchId = registry.matchByStudent.get(student.id);
  const match = matchId ? registry.matches.get(matchId) : null;
  const snap = match ? snapshotFor(match.state, student.id, Date.now()) : null;
  sendTo(student.id, snap || { type: 'match:none' });
}

// ------------------------------------------------------------------ hooks

function onOpen(student) {
  // Белсенді матчқа қайта қосылу — движок snapshot-ты өзі шығарады
  const matchId = registry.matchByStudent.get(student.id);
  if (matchId) {
    const match = registry.matches.get(matchId);
    if (match) {
      const { effects } = applyReconnect(match.state, student.id, Date.now());
      dispatch(match, effects);
    }
  }
  // Кезекте тұрған кіріс шақырулар қайта жеткізіледі
  const now = Date.now();
  for (const invite of registry.invites.values()) {
    if (invite.toId === student.id && invite.expiresAt > now) {
      sendTo(student.id, incomingMsg(invite));
    }
  }
}

function onMessage(student, ws, msg) {
  switch (msg.type) {
    case 'invite:send':
      handleInviteSend(student, msg).catch((e) => console.error('invite:send failed:', e));
      return;
    case 'invite:accept':
      handleInviteAccept(student, msg).catch((e) => console.error('invite:accept failed:', e));
      return;
    case 'invite:cancel':
      return handleInviteCancel(student, msg);
    case 'invite:decline':
      return handleInviteDecline(student, msg);
    case 'round:answer':
      return handleRoundAnswer(student, msg);
    case 'match:leave':
      return handleMatchLeave(student, msg);
    case 'match:state':
      return handleMatchState(student);
    default:
      return; // белгісіз type үнсіз еленбейді
  }
}

function onClose(student) {
  // Шақырулар үзілісте ЖОЙЫЛМАЙДЫ (TTL басқарады; accept кезінде
  // challenger_offline тексеріледі) — тек белсенді матч paused болады.
  const matchId = registry.matchByStudent.get(student.id);
  if (!matchId) return;
  const match = registry.matches.get(matchId);
  if (!match) return;
  const { effects } = applyDisconnect(match.state, student.id, Date.now());
  dispatch(match, effects);
}

export const onlineHooks = { onOpen, onMessage, onClose };
