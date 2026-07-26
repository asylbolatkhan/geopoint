import { POINTS } from './config.js';

// challenger/opponent: { correct, durationMs }
export function resolveBattle(challenger, opponent) {
  if (challenger.correct !== opponent.correct) {
    return challenger.correct > opponent.correct ? 'challenger' : 'opponent';
  }
  if (challenger.durationMs !== opponent.durationMs) {
    return challenger.durationMs < opponent.durationMs ? 'challenger' : 'opponent';
  }
  return 'draw';
}

export function completedPointsEvents(outcome, challenger, opponent) {
  const base =
    outcome === 'draw'
      ? [
          { who: 'challenger', amount: POINTS.battleDraw, reason: 'battle_draw' },
          { who: 'opponent', amount: POINTS.battleDraw, reason: 'battle_draw' },
        ]
      : outcome === 'challenger'
        ? [
            { who: 'challenger', amount: POINTS.battleWin, reason: 'battle_win' },
            { who: 'opponent', amount: POINTS.battleLoss, reason: 'battle_loss' },
          ]
        : [
            { who: 'challenger', amount: POINTS.battleLoss, reason: 'battle_loss' },
            { who: 'opponent', amount: POINTS.battleWin, reason: 'battle_win' },
          ];
  const events = [...base];
  if (challenger.correct > 0) {
    events.push({ who: 'challenger', amount: challenger.correct * POINTS.battleCorrect, reason: 'battle_correct' });
  }
  if (opponent.correct > 0) {
    events.push({ who: 'opponent', amount: opponent.correct * POINTS.battleCorrect, reason: 'battle_correct' });
  }
  return events;
}

export function unansweredPointsEvents(challengerSubmitted, opponentSubmitted) {
  if (challengerSubmitted === opponentSubmitted) return [];
  const submitted = challengerSubmitted ? 'challenger' : 'opponent';
  const idle = challengerSubmitted ? 'opponent' : 'challenger';
  return [
    { who: submitted, amount: POINTS.battleExpiredBonus, reason: 'battle_expired_bonus' },
    { who: idle, amount: POINTS.battleExpiredPenalty, reason: 'battle_expired_penalty' },
  ];
}

// Батл тастау рұқсаты: 'ok' | 'bad_opponent' | 'not_eligible_teacher_battle'
// Бағалау реті маңызды: admin қарсылас әрқашан жабық, player-дер тек player-мен
// (мектепсіз) ойнай алады, ал student/teacher жұбына мектеп сәйкестігі талап етіледі.
export function challengeEligibility({ challengerRole, opponentRole, challengerIsTop, sameSchool }) {
  if (opponentRole === 'admin') return 'bad_opponent';
  if (challengerRole === 'player') return opponentRole === 'player' ? 'ok' : 'bad_opponent';
  if (opponentRole === 'player') return 'bad_opponent';
  if (challengerRole === 'admin') return 'ok';
  if (!sameSchool) return 'bad_opponent';
  if (challengerRole === 'student' && opponentRole === 'teacher' && !challengerIsTop) {
    return 'not_eligible_teacher_battle';
  }
  return 'ok';
}

export function declinePointsEvents() {
  return [
    { who: 'challenger', amount: POINTS.battleExpiredBonus, reason: 'battle_expired_bonus' },
    { who: 'opponent', amount: POINTS.battleExpiredPenalty, reason: 'battle_expired_penalty' },
  ];
}
