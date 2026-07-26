import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { parseGameConfig, generateQuestions, renderForPlayer, scoreAnswers, correctIndexes } from '../quiz.js';
import { awardPoints } from '../points.js';
import { POINTS, TIMEZONE } from '../config.js';
import { isDbId } from '../ids.js';
import { mergeAnswers, validAnswerValue } from '../soloProgress.js';
import { soloModeKey, modePointsAllowed } from '../soloMode.js';

export const soloRouter = Router();
soloRouter.use(requireApproved);

soloRouter.post('/start', async (req, res, next) => {
  try {
    const config = parseGameConfig(req.body, { allowAll: true });
    if (!config) return res.status(400).json({ error: 'bad_config' });
    const questions = generateQuestions(config);
    const modeKey = soloModeKey(config);
    // Клиент ойын басында-ақ «бұл ойын ұпайсыз» деп ескерте алуы үшін
    const { rows: playRows } = await query(
      `SELECT COUNT(*) AS n FROM solo_games
       WHERE student_id = $1 AND mode_key = $2 AND status = 'completed'
         AND (created_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
      [req.student.id, modeKey, TIMEZONE]
    );
    const { rows } = await query(
      `INSERT INTO solo_games (student_id, config, questions, total, mode_key)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.student.id, config, JSON.stringify(questions), questions.length, modeKey]
    );
    const gameId = rows[0].id;
    res.json({
      gameId,
      total: questions.length,
      questions: renderForPlayer(questions, req.student.lang, gameId),
      pointsEligible: modePointsAllowed(Number(playRows[0].n)),
    });
  } catch (e) { next(e); }
});

soloRouter.post('/:id/answer', async (req, res, next) => {
  try {
    const gameId = Number(req.params.id);
    if (!isDbId(gameId)) return res.status(404).json({ error: 'not_found' });
    const { index, answer } = req.body || {};
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM solo_games WHERE id = $1 AND student_id = $2 FOR UPDATE',
        [gameId, req.student.id]
      );
      const game = rows[0];
      if (!game) return { code: 404, body: { error: 'not_found' } };
      if (game.status === 'completed') return { code: 409, body: { error: 'already_submitted' } };
      if (!Number.isInteger(index) || index < 0 || index >= game.total) {
        return { code: 400, body: { error: 'bad_answer' } };
      }
      if (!validAnswerValue(answer)) {
        return { code: 400, body: { error: 'bad_answer' } };
      }
      const progress = game.progress ?? {};
      const key = String(index);
      const correctOptionIndex = correctIndexes(game.questions, gameId)[index];
      if (Object.hasOwn(progress, key)) {
        // Сақталған мән әрқашан жеңеді (анти-чит) — қайта жазбаймыз
        const stored = validAnswerValue(progress[key]) ? progress[key] : null;
        return {
          code: 200,
          body: { correct: stored === correctOptionIndex, correctOptionIndex, alreadyAnswered: true },
        };
      }
      await client.query(
        'UPDATE solo_games SET progress = jsonb_set(progress, $2::text[], $3::jsonb) WHERE id = $1',
        [gameId, [key], JSON.stringify(answer)]
      );
      return {
        code: 200,
        body: { correct: answer === correctOptionIndex, correctOptionIndex, alreadyAnswered: false },
      };
    });
    res.status(result.code).json(result.body);
  } catch (e) { next(e); }
});

soloRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const gameId = Number(req.params.id);
    if (!isDbId(gameId)) return res.status(404).json({ error: 'not_found' });
    const { answers, durationMs } = req.body || {};
    const result = await withTransaction(async (client) => {
      // Бір оқушының барлық submit-тері тізбектеле орындалады — күндік шек айналып өтілмейді
      await client.query('SELECT pg_advisory_xact_lock($1)', [req.student.id]);
      const { rows } = await client.query(
        'SELECT * FROM solo_games WHERE id = $1 AND student_id = $2 FOR UPDATE',
        [gameId, req.student.id]
      );
      const game = rows[0];
      if (!game) return { code: 404, body: { error: 'not_found' } };
      if (game.status === 'completed') return { code: 409, body: { error: 'already_submitted' } };
      if (answers !== undefined && (!Array.isArray(answers) || answers.length !== game.total ||
          !answers.every((a) => a === null || (Number.isInteger(a) && a >= 0 && a <= 3)))) {
        return { code: 400, body: { error: 'bad_answers' } };
      }
      const finalAnswers = mergeAnswers(game.total, game.progress ?? {}, answers);
      const { correct, correctOptionIndexes } = scoreAnswers(game.questions, finalAnswers, gameId);
      await client.query(
        `UPDATE solo_games SET answers = $1, correct_count = $2, duration_ms = $3, status = 'completed'
         WHERE id = $4`,
        [JSON.stringify(finalAnswers), correct, Math.max(0, Number(durationMs) || 0), gameId]
      );
      // Режим шегі: осы ойынға ДЕЙІН бүгін (Алматы) сол режимде аяқталған ойындар —
      // өз id-і шығарылады, себебі жоғарыда status='completed' болып қойылды.
      // pg_advisory_xact_lock параллель submit-тердің жарысын болдырмайды.
      const { rows: playRows } = await client.query(
        `SELECT COUNT(*) AS n FROM solo_games
         WHERE student_id = $1 AND mode_key = $2 AND status = 'completed' AND id <> $3
           AND (created_at AT TIME ZONE $4)::date = (now() AT TIME ZONE $4)::date`,
        [req.student.id, game.mode_key, gameId, TIMEZONE]
      );
      const modeCapped = !modePointsAllowed(Number(playRows[0].n));
      const points = modeCapped ? 0 : correct * POINTS.soloCorrect;
      if (points > 0) await awardPoints(req.student.id, points, 'solo_correct', gameId, client);
      return { code: 200, body: { correct, total: game.total, points, modeCapped, correctOptionIndexes } };
    });
    res.status(result.code).json(result.body);
  } catch (e) { next(e); }
});
