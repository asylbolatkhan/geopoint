import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey, dayKey } from '../points.js';
import { TIMEZONE } from '../config.js';
import { computeStreak, computeAchievements } from '../achievements.js';

export const profileRouter = Router();
profileRouter.use(requireApproved);

profileRouter.get('/', async (req, res, next) => {
  try {
    const sid = req.student.id;
    const [points, battles, solo, activityDays, perfectGame] = await Promise.all([
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
      query(
        `SELECT DISTINCT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day
         FROM (
           SELECT created_at FROM solo_games WHERE student_id = $1 AND status = 'completed'
           UNION ALL
           SELECT created_at FROM points_events WHERE student_id = $1
         ) t
         ORDER BY day`,
        [sid, TIMEZONE]
      ),
      query(
        `SELECT EXISTS(SELECT 1 FROM solo_games WHERE student_id = $1 AND status = 'completed' AND total >= 10 AND correct_count = total) AS has_perfect`,
        [sid]
      ),
    ]);

    const todayKey = dayKey();
    const activityDayKeys = activityDays.rows.map(row => row.day);
    const streak = computeStreak(activityDayKeys, todayKey);

    const achievementsData = computeAchievements({
      wins: battles.rows[0].wins,
      soloCompleted: solo.rows[0].games,
      hasPerfectGame: perfectGame.rows[0].has_perfect,
      bestStreak: streak.best,
      totalPoints: points.rows[0].total,
    });

    res.json({
      monthPoints: points.rows[0].month,
      totalPoints: points.rows[0].total,
      battles: battles.rows[0],
      soloGames: solo.rows[0].games,
      accuracy: solo.rows[0].accuracy,
      streak,
      achievements: achievementsData,
    });
  } catch (e) { next(e); }
});
