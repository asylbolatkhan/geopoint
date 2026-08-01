import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';
import { isDbId } from '../ids.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireApproved);

// 'class' (өз сыныбы) UI-дан алынды, бірақ ашық тұрған ескі клиенттер 403 алмауы үшін қабылданады
const SCOPES = {
  student: ['classes', 'school', 'class'],
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

    // 'classes' — таңдалған БІР сыныптың ішіндегі оқушылар рейтингі
    let classId = null;
    if (scope === 'classes') {
      if (req.query.classId !== undefined) {
        const requested = Number(req.query.classId);
        if (!isDbId(requested)) return res.status(400).json({ error: 'bad_class' });
        const { rows } = await query(
          'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
          [requested, school]
        );
        if (rows.length === 0) return res.status(400).json({ error: 'bad_class' });
        classId = requested;
      } else {
        // Әдепкі: өз сыныбы (сол мектепте болса), әйтпесе мектептің алғашқы сыныбы
        const { rows } = await query(
          `SELECT id FROM classes WHERE school_id = $1
           ORDER BY (id = $2) DESC, name LIMIT 1`,
          [school, req.student.class_id]
        );
        classId = rows[0]?.id ?? null;
      }
      if (classId === null) return res.json({ rows: [], classId: null });
    }

    const classFilter = scope === 'class' ? req.student.class_id : classId;
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
    const body = { rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
    if (scope === 'classes') body.classId = classId;
    res.json(body);
  } catch (e) { next(e); }
});
