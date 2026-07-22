import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { notifyAdmins } from '../bot.js';
import { M } from '../messages.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  res.json({ student: req.student });
});

authRouter.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM classes ORDER BY name');
    res.json({ classes: rows });
  } catch (e) { next(e); }
});

authRouter.post('/register', async (req, res, next) => {
  try {
    if (req.student) return res.status(409).json({ error: 'already_registered' });
    const { name, classId, lang } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
      return res.status(400).json({ error: 'bad_name' });
    }
    if (!['kk', 'ru'].includes(lang)) return res.status(400).json({ error: 'bad_lang' });
    const cls = await query('SELECT id, name FROM classes WHERE id = $1', [classId]);
    if (!cls.rows[0]) return res.status(400).json({ error: 'bad_class' });
    const { rows } = await query(
      'INSERT INTO students (tg_user_id, name, class_id, lang) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.tgUser.id, name.trim(), classId, lang]
    );
    notifyAdmins((adminLang) => M[adminLang].newPending(name.trim(), cls.rows[0].name));
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

authRouter.get('/students', requireApproved, async (req, res, next) => {
  try {
    const classId = req.query.classId ? Number(req.query.classId) : null;
    const q = req.query.q ? String(req.query.q) : null;
    const { rows } = await query(
      `SELECT s.id, s.name, c.name AS class_name
       FROM students s
       JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student' AND s.id <> $1
         AND ($2::int IS NULL OR s.class_id = $2)
         AND ($3::text IS NULL OR s.name ILIKE '%' || $3 || '%')
       ORDER BY c.name, s.name
       LIMIT 200`,
      [req.student.id, classId, q]
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});
