import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';
import { isDbId } from '../ids.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireApproved);

const SCOPES = {
  student: ['class', 'school', 'classes'],
  teacher: ['school', 'classes', 'teachers'],
  admin: ['school', 'classes', 'teachers', 'global'],
  player: ['global'],
};

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
    const allowedScopes = SCOPES[req.student.role] || SCOPES.student;
    const requestedScope = req.query.scope;
    if (requestedScope && !allowedScopes.includes(requestedScope)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const scope = requestedScope || allowedScopes[0];

    const month = req.query.month === 'all' ? null : (req.query.month || monthKey());
    if (month !== null && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'bad_month' });
    }

    let school = req.student.school_id;
    if (req.student.role === 'admin' && req.query.schoolId !== undefined) {
      const schoolIdNum = Number(req.query.schoolId);
      if (isDbId(schoolIdNum)) school = schoolIdNum;
    }

    if (scope === 'global') {
      const { rows } = await query(
        `SELECT s.id, s.name, NULL AS class_name, COALESCE(SUM(p.amount), 0)::int AS points
         FROM students s
         LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
         WHERE s.role = 'player' AND s.status = 'approved'
         GROUP BY s.id
         ORDER BY points DESC, s.name
         LIMIT 100`,
        [month]
      );
      return res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
    }

    if (scope === 'teachers') {
      const { rows } = await query(
        `SELECT s.id, s.name, NULL AS class_name, COALESCE(SUM(p.amount), 0)::int AS points
         FROM students s
         LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
         WHERE s.status = 'approved' AND s.role = 'teacher' AND s.school_id = $2
         GROUP BY s.id
         ORDER BY points DESC, s.name
         LIMIT 100`,
        [month, school]
      );
      return res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
    }

    if (scope === 'classes') {
      const { rows } = await query(
        `SELECT c.id, c.name, COUNT(DISTINCT s.id)::int AS students,
                ROUND(COALESCE(SUM(p.amount), 0)::numeric / GREATEST(COUNT(DISTINCT s.id), 1), 2)::float AS "avgPoints"
         FROM classes c
         JOIN students s ON s.class_id = c.id AND s.status = 'approved' AND s.role = 'student'
         LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
         WHERE c.school_id = $2
         GROUP BY c.id
         ORDER BY "avgPoints" DESC, c.name`,
        [month, school]
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
         AND s.school_id = $3
       GROUP BY s.id, c.name
       ORDER BY points DESC, s.name
       LIMIT 100`,
      [month, classFilter, school]
    );
    res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
  } catch (e) { next(e); }
});
