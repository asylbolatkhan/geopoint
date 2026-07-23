import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';

export const profileRouter = Router();
profileRouter.use(requireApproved);

profileRouter.get('/', async (req, res, next) => {
  try {
    const sid = req.student.id;
    const [points, battles, solo] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(amount), 0)::int AS total,
                COALESCE(SUM(amount) FILTER (WHERE month_key = $2), 0)::int AS month
         FROM points_events WHERE student_id = $1`,
        [sid, monthKey()]
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE winner_id = $1)::int AS wins,
                COUNT(*) FILTER (WHERE winner_id IS NULL)::int AS draws,
                COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id <> $1)::int AS losses
         FROM battles
         WHERE status = 'completed' AND (challenger_id = $1 OR opponent_id = $1)`,
        [sid]
      ),
      query(
        `SELECT COUNT(*)::int AS games,
                COALESCE(ROUND(AVG(correct_count::numeric / NULLIF(total, 0)) * 100), 0)::int AS accuracy
         FROM solo_games WHERE student_id = $1 AND status = 'completed'`,
        [sid]
      ),
    ]);
    res.json({
      monthPoints: points.rows[0].month,
      totalPoints: points.rows[0].total,
      battles: battles.rows[0],
      soloGames: solo.rows[0].games,
      accuracy: solo.rows[0].accuracy,
    });
  } catch (e) { next(e); }
});
