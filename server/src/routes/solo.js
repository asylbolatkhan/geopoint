import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { parseGameConfig, generateQuestions, renderForPlayer, scoreAnswers } from '../quiz.js';
import { awardPoints } from '../points.js';
import { POINTS, TIMEZONE } from '../config.js';

export const soloRouter = Router();
soloRouter.use(requireApproved);

soloRouter.post('/start', async (req, res, next) => {
  try {
    const config = parseGameConfig(req.body, { allowAll: true });
    if (!config) return res.status(400).json({ error: 'bad_config' });
    const questions = generateQuestions(config);
    const { rows } = await query(
      `INSERT INTO solo_games (student_id, config, questions, total)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.student.id, config, JSON.stringify(questions), questions.length]
    );
    const gameId = rows[0].id;
    res.json({
      gameId,
      total: questions.length,
      questions: renderForPlayer(questions, req.student.lang, gameId),
    });
  } catch (e) { next(e); }
});

soloRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) return res.status(404).json({ error: 'not_found' });
    const { answers, durationMs } = req.body || {};
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM solo_games WHERE id = $1 AND student_id = $2 FOR UPDATE',
        [gameId, req.student.id]
      );
      const game = rows[0];
      if (!game) return { code: 404, body: { error: 'not_found' } };
      if (game.status === 'completed') return { code: 409, body: { error: 'already_submitted' } };
      if (!Array.isArray(answers) || answers.length !== game.total) {
        return { code: 400, body: { error: 'bad_answers' } };
      }
      const { correct, correctOptionIndexes } = scoreAnswers(game.questions, answers, gameId);
      await client.query(
        `UPDATE solo_games SET answers = $1, correct_count = $2, duration_ms = $3, status = 'completed'
         WHERE id = $4`,
        [JSON.stringify(answers), correct, Math.max(0, Number(durationMs) || 0), gameId]
      );
      // Күндік шек (Алматы уақытымен) — сол транзакция ішінде оқылады
      const { rows: capRows } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM points_events
         WHERE student_id = $1 AND reason = 'solo_correct'
           AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
        [req.student.id, TIMEZONE]
      );
      const alreadyToday = Number(capRows[0].total);
      const points = Math.max(0, Math.min(correct * POINTS.soloCorrect, POINTS.soloDailyCap - alreadyToday));
      if (points > 0) await awardPoints(req.student.id, points, 'solo_correct', gameId, client);
      return { code: 200, body: { correct, total: game.total, points, correctOptionIndexes } };
    });
    res.status(result.code).json(result.body);
  } catch (e) { next(e); }
});
