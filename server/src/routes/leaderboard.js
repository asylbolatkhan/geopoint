import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireApproved);

leaderboardRouter.get('/months', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT DISTINCT month_key FROM points_events ORDER BY month_key DESC'
    );
    res.json({ months: rows.map((r) => r.month_key) });
  } catch (e) { next(e); }
});

leaderboardRouter.get('/', async (req, res, next) => {
  try {
    const scope = ['class', 'school', 'classes'].includes(req.query.scope)
      ? req.query.scope : 'class';
    const month = req.query.month === 'all' ? null : (req.query.month || monthKey());
    if (month !== null && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'bad_month' });
    }

    if (scope === 'classes') {
      const { rows } = await query(
        `SELECT c.id, c.name, COUNT(DISTINCT s.id)::int AS students,
                ROUND(COALESCE(SUM(p.amount), 0)::numeric / GREATEST(COUNT(DISTINCT s.id), 1), 2)::float AS "avgPoints"
         FROM classes c
         JOIN students s ON s.class_id = c.id AND s.status = 'approved' AND s.role = 'student'
         LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
         GROUP BY c.id
         ORDER BY "avgPoints" DESC, c.name`,
        [month]
      );
      return res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
    }

    const classFilter = scope === 'class' ? req.student.class_id : null;
    const { rows } = await query(
      `SELECT s.id, s.name, c.name AS class_name, COALESCE(SUM(p.amount), 0)::int AS points
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
       WHERE s.status = 'approved' AND s.role = 'student'
         AND ($2::int IS NULL OR s.class_id = $2)
       GROUP BY s.id, c.name
       ORDER BY points DESC, s.name
       LIMIT 100`,
      [month, classFilter]
    );
    res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
  } catch (e) { next(e); }
});
