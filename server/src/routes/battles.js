import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { parseGameConfig, generateQuestions, renderForPlayer, scoreAnswers } from '../quiz.js';
import {
  resolveBattle, completedPointsEvents, unansweredPointsEvents, declinePointsEvents,
} from '../battleLogic.js';
import { awardPoints } from '../points.js';
import { notify } from '../bot.js';
import { M } from '../messages.js';
import { BATTLE, TIMEZONE } from '../config.js';

export const battlesRouter = Router();
battlesRouter.use(requireApproved);

const challengerSeed = (battleId) => battleId * 2;
const opponentSeed = (battleId) => battleId * 2 + 1;

async function applyWhoEvents(client, events, battle) {
  for (const e of events) {
    const studentId = e.who === 'challenger' ? battle.challenger_id : battle.opponent_id;
    await awardPoints(studentId, e.amount, e.reason, battle.id, client);
  }
}

async function studentById(id) {
  const { rows } = await query('SELECT * FROM students WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function expireDueBattles() {
  const { rows } = await query(
    `UPDATE battles SET status = 'expired'
     WHERE status = 'awaiting_opponent' AND expires_at < now()
     RETURNING *`
  );
  for (const b of rows) {
    const events = unansweredPointsEvents(!!b.challenger_result, !!b.opponent_result);
    for (const e of events) {
      const studentId = e.who === 'challenger' ? b.challenger_id : b.opponent_id;
      await awardPoints(studentId, e.amount, e.reason, b.id);
    }
    const challenger = await studentById(b.challenger_id);
    const opponent = await studentById(b.opponent_id);
    if (!challenger || !opponent) continue;
    const cDone = !!b.challenger_result;
    const oDone = !!b.opponent_result;
    if (cDone === oDone) continue; // ұпай жазылған жоқ — хабарлама да жіберілмейді
    const submitted = cDone ? challenger : opponent;
    const idle = cDone ? opponent : challenger;
    notify(submitted.tg_user_id, M[submitted.lang].battleExpired(idle.name), submitted.lang);
    notify(idle.tg_user_id, M[idle.lang].battleExpiredIdle(submitted.name), idle.lang);
  }
  return rows.length;
}

function summarize(b, myId) {
  const isChallenger = b.challenger_id === myId;
  const my = isChallenger ? b.challenger_result : b.opponent_result;
  const their = isChallenger ? b.opponent_result : b.challenger_result;
  return {
    id: b.id,
    role: isChallenger ? 'challenger' : 'opponent',
    other: { name: b.other_name, class_name: b.other_class },
    status: b.status,
    mySubmitted: !!my,
    myCorrect: my ? my.correct : null,
    theirCorrect: b.status === 'completed' && their ? their.correct : null,
    winner:
      b.status !== 'completed' ? null
        : b.winner_id === null ? 'draw'
        : b.winner_id === myId ? 'me' : 'them',
    total: b.total,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
  };
}

const listSql = `
  SELECT b.*, jsonb_array_length(b.questions) AS total,
         o.name AS other_name, oc.name AS other_class
  FROM battles b
  JOIN students o ON o.id = CASE WHEN b.challenger_id = $1 THEN b.opponent_id ELSE b.challenger_id END
  LEFT JOIN classes oc ON oc.id = o.class_id
  WHERE b.challenger_id = $1 OR b.opponent_id = $1`;

battlesRouter.post('/', async (req, res, next) => {
  try {
    const { opponentId } = req.body || {};
    const config = parseGameConfig(req.body?.config);
    if (!config) return res.status(400).json({ error: 'bad_config' });
    const opponentIdNum = Number(opponentId);
    if (!Number.isInteger(opponentIdNum)) return res.status(400).json({ error: 'bad_opponent' });
    const opponent = await studentById(opponentIdNum);
    if (!opponent || opponent.status !== 'approved' || opponent.role !== 'student' ||
        opponent.id === req.student.id) {
      return res.status(400).json({ error: 'bad_opponent' });
    }
    const { rows: cntRows } = await query(
      `SELECT COUNT(*)::int AS n FROM battles
       WHERE challenger_id = $1 AND opponent_id = $2
         AND (created_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
      [req.student.id, opponent.id, TIMEZONE]
    );
    if (cntRows[0].n >= BATTLE.dailyPerOpponent) {
      return res.status(429).json({ error: 'daily_limit' });
    }
    const questions = generateQuestions(config);
    const { rows } = await query(
      `INSERT INTO battles (challenger_id, opponent_id, config, questions, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING *`,
      [req.student.id, opponent.id, config, JSON.stringify(questions), BATTLE.expiryHours]
    );
    const battle = rows[0];
    notify(opponent.tg_user_id, M[opponent.lang].challenged(req.student.name), opponent.lang);
    res.json({
      battle: {
        id: battle.id, status: battle.status, expiresAt: battle.expires_at,
        opponent: { id: opponent.id, name: opponent.name },
      },
      total: questions.length,
      questionSeconds: BATTLE.questionSeconds,
      questions: renderForPlayer(questions, req.student.lang, challengerSeed(battle.id)),
    });
  } catch (e) { next(e); }
});

battlesRouter.get('/', async (req, res, next) => {
  try {
    await expireDueBattles();
    const { rows } = await query(`${listSql} ORDER BY b.created_at DESC LIMIT 50`, [req.student.id]);
    res.json({ battles: rows.map((b) => summarize(b, req.student.id)) });
  } catch (e) { next(e); }
});

battlesRouter.get('/:id', async (req, res, next) => {
  try {
    const battleId = Number(req.params.id);
    if (!Number.isInteger(battleId)) return res.status(404).json({ error: 'not_found' });
    await expireDueBattles();
    const { rows } = await query(`${listSql} AND b.id = $2`, [req.student.id, battleId]);
    const b = rows[0];
    if (!b) return res.status(404).json({ error: 'not_found' });
    const isChallenger = b.challenger_id === req.student.id;
    const myResult = isChallenger ? b.challenger_result : b.opponent_result;
    const summary = summarize(b, req.student.id);
    if (b.status === 'awaiting_opponent' && !myResult) {
      const seed = isChallenger ? challengerSeed(b.id) : opponentSeed(b.id);
      return res.json({
        battle: summary,
        total: b.total,
        questionSeconds: BATTLE.questionSeconds,
        questions: renderForPlayer(b.questions, req.student.lang, seed),
      });
    }
    res.json({ battle: summary });
  } catch (e) { next(e); }
});

battlesRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const battleId = Number(req.params.id);
    if (!Number.isInteger(battleId)) return res.status(404).json({ error: 'not_found' });
    const { answers, durationMs } = req.body || {};
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]
      );
      const b = rows[0];
      if (!b || (b.challenger_id !== req.student.id && b.opponent_id !== req.student.id)) {
        return { code: 404, body: { error: 'not_found' } };
      }
      if (b.status !== 'awaiting_opponent') return { code: 409, body: { error: 'battle_closed', status: b.status } };
      const isChallenger = b.challenger_id === req.student.id;
      if (isChallenger ? b.challenger_result : b.opponent_result) {
        return { code: 409, body: { error: 'already_submitted' } };
      }
      if (!Array.isArray(answers) || answers.length !== b.questions.length) {
        return { code: 400, body: { error: 'bad_answers' } };
      }
      const seed = isChallenger ? challengerSeed(b.id) : opponentSeed(b.id);
      const { correct } = scoreAnswers(b.questions, answers, seed);
      const myResult = {
        answers, correct,
        durationMs: Math.max(0, Number(durationMs) || 0),
        submittedAt: new Date().toISOString(),
      };
      const col = isChallenger ? 'challenger_result' : 'opponent_result';
      await client.query(`UPDATE battles SET ${col} = $1 WHERE id = $2`, [JSON.stringify(myResult), b.id]);

      const otherResult = isChallenger ? b.opponent_result : b.challenger_result;
      if (!otherResult) {
        return { code: 200, body: { correct, total: b.questions.length, status: 'awaiting_opponent' } };
      }
      const cRes = isChallenger ? myResult : b.challenger_result;
      const oRes = isChallenger ? b.opponent_result : myResult;
      const outcome = resolveBattle(cRes, oRes);
      const winnerId =
        outcome === 'draw' ? null : outcome === 'challenger' ? b.challenger_id : b.opponent_id;
      await client.query(
        `UPDATE battles SET status = 'completed', winner_id = $1 WHERE id = $2`,
        [winnerId, b.id]
      );
      await applyWhoEvents(client, completedPointsEvents(outcome, cRes, oRes), b);
      return {
        code: 200,
        body: { correct, total: b.questions.length, status: 'completed',
                winner: winnerId === null ? 'draw' : winnerId === req.student.id ? 'me' : 'them' },
        completed: { battle: b, cRes, oRes, winnerId },
      };
    });

    if (result.completed) {
      const { battle, cRes, oRes, winnerId } = result.completed;
      const challenger = await studentById(battle.challenger_id);
      const opponent = await studentById(battle.opponent_id);
      const pairs = [
        [challenger, opponent, cRes.correct, oRes.correct],
        [opponent, challenger, oRes.correct, cRes.correct],
      ];
      for (const [me, other, my, their] of pairs) {
        const t = M[me.lang];
        const text =
          winnerId === null ? t.battleDraw(other.name, my)
            : winnerId === me.id ? t.battleWon(other.name, my, their)
            : t.battleLost(other.name, my, their);
        notify(me.tg_user_id, text, me.lang);
      }
    }
    res.status(result.code).json(result.body);
  } catch (e) { next(e); }
});

battlesRouter.post('/:id/decline', async (req, res, next) => {
  try {
    const battleId = Number(req.params.id);
    if (!Number.isInteger(battleId)) return res.status(404).json({ error: 'not_found' });
    const outcome = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]);
      const b = rows[0];
      if (!b || b.opponent_id !== req.student.id) return { code: 404, body: { error: 'not_found' } };
      if (b.status !== 'awaiting_opponent' || b.opponent_result) {
        return { code: 409, body: { error: 'battle_closed', status: b.status } };
      }
      await client.query(`UPDATE battles SET status = 'declined' WHERE id = $1`, [b.id]);
      await applyWhoEvents(client, declinePointsEvents(), b);
      return { code: 200, body: { status: 'declined' }, battle: b };
    });
    if (outcome.battle) {
      const challenger = await studentById(outcome.battle.challenger_id);
      notify(challenger.tg_user_id, M[challenger.lang].battleDeclined(req.student.name), challenger.lang);
    }
    res.status(outcome.code).json(outcome.body);
  } catch (e) { next(e); }
});
