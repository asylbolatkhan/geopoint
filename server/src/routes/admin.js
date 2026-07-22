import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../authMiddleware.js';
import { notify } from '../bot.js';
import { M } from '../messages.js';
import { monthKey } from '../points.js';
import { correctIndexes } from '../quiz.js';
import { CONTINENTS } from '../../../shared/data/index.js';
import { isDbId } from '../ids.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

async function studentById(id) {
  const { rows } = await query('SELECT * FROM students WHERE id = $1', [id]);
  return rows[0] || null;
}

adminRouter.get('/pending', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.name, s.class_id, c.name AS class_name, s.tg_user_id, s.created_at
       FROM students s LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'pending' ORDER BY s.created_at`
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/students/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const classId = req.body?.classId ? Number(req.body.classId) : null;
    if (classId !== null && !isDbId(classId)) return res.status(400).json({ error: 'bad_class' });
    if (classId !== null) {
      const cls = await query('SELECT id FROM classes WHERE id = $1', [classId]);
      if (!cls.rows[0]) return res.status(400).json({ error: 'bad_class' });
    }
    const { rows } = await query(
      `UPDATE students SET status = 'approved', class_id = COALESCE($2, class_id)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, classId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    notify(rows[0].tg_user_id, M[rows[0].lang].approved, rows[0].lang);
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.post('/students/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const student = await studentById(id);
    if (!student || student.status !== 'pending') return res.status(404).json({ error: 'not_found' });
    await query('DELETE FROM students WHERE id = $1', [student.id]);
    notify(student.tg_user_id, M[student.lang].rejected, student.lang);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/students', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.name, s.class_id, c.name AS class_name, s.lang, s.created_at,
              COALESCE(SUM(p.amount) FILTER (WHERE p.month_key = $1), 0)::int AS month_points
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN points_events p ON p.student_id = s.id
       WHERE s.status = 'approved' AND s.role = 'student'
       GROUP BY s.id, c.name ORDER BY c.name, s.name`,
      [monthKey()]
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});

adminRouter.patch('/students/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const classId = Number(req.body?.classId);
    if (!isDbId(classId)) return res.status(400).json({ error: 'bad_class' });
    const cls = await query('SELECT id FROM classes WHERE id = $1', [classId]);
    if (!cls.rows[0]) return res.status(400).json({ error: 'bad_class' });
    const { rows } = await query(
      `UPDATE students SET class_id = $2 WHERE id = $1 AND role = 'student' RETURNING *`,
      [id, classId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.delete('/students/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const { rowCount } = await query(
      `DELETE FROM students WHERE id = $1 AND role = 'student'`, [id]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/students/:id/points', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const { rows } = await query(
      `SELECT id, amount, reason, ref_id, month_key, created_at
       FROM points_events WHERE student_id = $1
       ORDER BY created_at DESC LIMIT 200`,
      [id]
    );
    res.json({ events: rows });
  } catch (e) { next(e); }
});

adminRouter.delete('/points/:eventId', async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    if (!isDbId(eventId)) return res.status(404).json({ error: 'not_found' });
    const { rowCount } = await query(
      'DELETE FROM points_events WHERE id = $1', [eventId]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name,
              COUNT(s.id) FILTER (WHERE s.status = 'approved')::int AS students
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id ORDER BY c.name`
    );
    res.json({ classes: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/classes', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 20) return res.status(400).json({ error: 'bad_name' });
    const school = await query('SELECT id FROM schools LIMIT 1');
    if (!school.rows[0]) return res.status(500).json({ error: 'no_school_seeded' });
    const { rows } = await query(
      `INSERT INTO classes (school_id, name) VALUES ($1, $2)
       ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [school.rows[0].id, name]
    );
    res.json({ class: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.delete('/classes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!isDbId(id)) return res.status(404).json({ error: 'not_found' });
    const used = await query('SELECT 1 FROM students WHERE class_id = $1 LIMIT 1', [id]);
    if (used.rows[0]) return res.status(409).json({ error: 'not_empty' });
    const { rowCount } = await query('DELETE FROM classes WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/stats', async (req, res, next) => {
  try {
    const { rows: students } = await query(
      `SELECT s.id, s.name, c.name AS class_name,
              (SELECT COUNT(*) FROM solo_games g WHERE g.student_id = s.id AND g.status = 'completed')::int
            + (SELECT COUNT(*) FROM battles b
               WHERE (b.challenger_id = s.id AND b.challenger_result IS NOT NULL)
                  OR (b.opponent_id = s.id AND b.opponent_result IS NOT NULL))::int AS games,
              COALESCE((SELECT ROUND(AVG(g.correct_count::numeric / NULLIF(g.total, 0)) * 100)
                        FROM solo_games g WHERE g.student_id = s.id AND g.status = 'completed'), 0)::int AS accuracy,
              COALESCE((SELECT SUM(p.amount) FROM points_events p
                        WHERE p.student_id = s.id AND p.month_key = $1), 0)::int AS month_points,
              GREATEST(
                (SELECT MAX(g.created_at) FROM solo_games g WHERE g.student_id = s.id),
                (SELECT MAX(b.created_at) FROM battles b
                 WHERE b.challenger_id = s.id OR b.opponent_id = s.id)
              ) AS last_active
       FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student'
       ORDER BY c.name, s.name`,
      [monthKey()]
    );

    // Ең жиі қателесетін елдер: соңғы аяқталған ойындардың жауаптарын JS-пен санаймыз
    const CONTINENT_OF = new Map();
    for (const [key, list] of Object.entries(CONTINENTS)) {
      for (const c of list) if (!CONTINENT_OF.has(c.id)) CONTINENT_OF.set(c.id, key);
    }
    const contStats = new Map(); // continent -> { asked, missed }
    const misses = new Map();
    const tally = (questions, answers, seed) => {
      if (!Array.isArray(answers)) return;
      const correct = correctIndexes(questions, seed);
      questions.forEach((q, i) => {
        const continent = CONTINENT_OF.get(q.countryId);
        if (continent) {
          const s = contStats.get(continent) || { asked: 0, missed: 0 };
          s.asked += 1;
          if (answers[i] !== correct[i]) s.missed += 1;
          contStats.set(continent, s);
        }
        if (answers[i] !== correct[i]) misses.set(q.countryId, (misses.get(q.countryId) || 0) + 1);
      });
    };
    const { rows: soloGames } = await query(
      `SELECT id, questions, answers FROM solo_games
       WHERE status = 'completed' AND answers IS NOT NULL
       ORDER BY created_at DESC LIMIT 300`
    );
    for (const g of soloGames) tally(g.questions, g.answers, g.id);
    const { rows: battleRows } = await query(
      `SELECT id, questions, challenger_result, opponent_result FROM battles
       WHERE status = 'completed' ORDER BY created_at DESC LIMIT 200`
    );
    for (const b of battleRows) {
      tally(b.questions, b.challenger_result?.answers, b.id * 2);
      tally(b.questions, b.opponent_result?.answers, b.id * 2 + 1);
    }
    const missed = [...misses.entries()]
      .map(([countryId, count]) => ({ countryId, misses: count }))
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 15);

    const continents = [...contStats.entries()]
      .map(([continent, s]) => ({
        continent,
        asked: s.asked,
        missed: s.missed,
        accuracy: Math.round((1 - s.missed / s.asked) * 100),
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const { rows: inactive } = await query(
      `SELECT s.id, s.name, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student'
         AND NOT EXISTS (SELECT 1 FROM solo_games g WHERE g.student_id = s.id
                         AND g.created_at > now() - interval '7 days')
         AND NOT EXISTS (SELECT 1 FROM battles b
                         WHERE (b.challenger_id = s.id OR b.opponent_id = s.id)
                         AND b.created_at > now() - interval '7 days')
       ORDER BY c.name, s.name`
    );

    res.json({ students, continents, missed, inactive7d: inactive });
  } catch (e) { next(e); }
});
