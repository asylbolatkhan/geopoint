import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { query } from '../db.js';
import { tickets } from '../online/registry.js';
import { requireApproved } from '../authMiddleware.js';
import { notifyAdmins } from '../bot.js';
import { M } from '../messages.js';
import { isDbId } from '../ids.js';
import { isTopStudent } from '../eligibility.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  res.json({ student: req.student });
});

authRouter.get('/schools', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM schools ORDER BY name');
    res.json({ schools: rows });
  } catch (e) { next(e); }
});

authRouter.get('/classes', async (req, res, next) => {
  try {
    const schoolIdNum = Number(req.query.schoolId);
    if (!isDbId(schoolIdNum)) return res.status(400).json({ error: 'bad_school' });
    const { rows } = await query(
      'SELECT id, name FROM classes WHERE school_id = $1 ORDER BY name',
      [schoolIdNum]
    );
    res.json({ classes: rows });
  } catch (e) { next(e); }
});

authRouter.post('/register', async (req, res, next) => {
  try {
    if (req.student) return res.status(409).json({ error: 'already_registered' });
    const { name, classId, schoolId, lang, role } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
      return res.status(400).json({ error: 'bad_name' });
    }
    if (!['kk', 'ru'].includes(lang)) return res.status(400).json({ error: 'bad_lang' });
    const roleValue = role === undefined ? 'student' : role;
    if (!['student', 'teacher', 'player'].includes(roleValue)) {
      return res.status(400).json({ error: 'bad_role' });
    }
    if (roleValue === 'player') {
      // Жеке ойыншы: мектепке/сыныпқа байланбайды және РАСТАУСЫЗ бірден кіреді.
      // Админге тек ақпараттық хабарлама барады.
      let rows;
      try {
        ({ rows } = await query(
          `INSERT INTO students (tg_user_id, name, lang, role, status)
           VALUES ($1, $2, $3, 'player', 'approved') RETURNING *`,
          [req.tgUser.id, name.trim(), lang]
        ));
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'already_registered' });
        throw e;
      }
      notifyAdmins((adminLang) => M[adminLang].newUserJoined(name.trim()));
      return res.json({ student: rows[0] });
    }
    const schoolIdNum = Number(schoolId);
    if (!isDbId(schoolIdNum)) return res.status(400).json({ error: 'bad_school' });
    if (roleValue === 'teacher') {
      const school = await query('SELECT id FROM schools WHERE id = $1', [schoolIdNum]);
      if (!school.rows[0]) return res.status(400).json({ error: 'bad_school' });
      let rows;
      try {
        ({ rows } = await query(
          `INSERT INTO students (tg_user_id, name, class_id, school_id, lang, role)
           VALUES ($1, $2, NULL, $3, $4, 'teacher') RETURNING *`,
          [req.tgUser.id, name.trim(), schoolIdNum, lang]
        ));
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'already_registered' });
        throw e;
      }
      notifyAdmins((adminLang) => M[adminLang].newPendingTeacher(name.trim()));
      return res.json({ student: rows[0] });
    }
    const classIdNum = Number(classId);
    if (!isDbId(classIdNum)) return res.status(400).json({ error: 'bad_class' });
    // Сынып таңдалған мектепке тиесілі болуы керек.
    const cls = await query('SELECT id, name, school_id FROM classes WHERE id = $1', [classIdNum]);
    if (!cls.rows[0] || cls.rows[0].school_id !== schoolIdNum) {
      return res.status(400).json({ error: 'bad_class' });
    }
    let rows;
    try {
      ({ rows } = await query(
        `INSERT INTO students (tg_user_id, name, class_id, school_id, lang)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.tgUser.id, name.trim(), classIdNum, schoolIdNum, lang]
      ));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'already_registered' });
      throw e;
    }
    notifyAdmins((adminLang) => M[adminLang].newPending(name.trim(), cls.rows[0].name));
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

// WS қосылуға бір реттік билет. Bearer токен URL-ға шықпауы үшін: клиент осы
// endpoint-тен билет алады да, /ws?ticket=... арқылы қосылады. Билет 30 секунд
// жарамды және бір-ақ рет қолданылады (upgrade кезінде бірден өшіріледі).
const WS_TICKET_TTL_MS = 30000;

authRouter.post('/online/ticket', requireApproved, (req, res) => {
  const now = Date.now();
  // Ленивая тазалау: мерзімі өткен билеттерді өшіреміз — map әрқашан кішкентай.
  for (const [t, v] of tickets) {
    if (v.expiresAt < now) tickets.delete(t);
  }
  const ticket = randomUUID();
  tickets.set(ticket, { studentId: req.student.id, expiresAt: now + WS_TICKET_TTL_MS });
  res.json({ ticket });
});

authRouter.get('/students', requireApproved, async (req, res, next) => {
  try {
    const classId = Number.isInteger(Number(req.query.classId)) && req.query.classId !== '' && req.query.classId !== undefined ? Number(req.query.classId) : null;
    const q = req.query.q ? String(req.query.q) : null;
    if (req.student.role === 'player') {
      // Жеке ойыншы тек басқа жеке ойыншылармен ойнайды.
      const { rows } = await query(
        `SELECT s.id, s.name, s.role, c.name AS class_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.status = 'approved' AND s.role = 'player' AND s.id <> $1
           AND ($2::text IS NULL OR s.name ILIKE '%' || $2 || '%')
         ORDER BY s.name
         LIMIT 200`,
        [req.student.id, q]
      );
      return res.json({ students: rows, eligibleForTeacherBattle: true });
    }
    const { rows } = await query(
      `SELECT s.id, s.name, s.role, c.name AS class_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role IN ('student','teacher') AND s.id <> $1
         AND s.school_id = $4
         AND (s.role = 'teacher' OR $2::int IS NULL OR s.class_id = $2)
         AND ($3::text IS NULL OR s.name ILIKE '%' || $3 || '%')
       ORDER BY s.role, c.name NULLS LAST, s.name
       LIMIT 200`,
      [req.student.id, classId, q, req.student.school_id]
    );
    const eligibleForTeacherBattle =
      req.student.role !== 'student' ? true : await isTopStudent(req.student.id, req.student.school_id);
    res.json({ students: rows, eligibleForTeacherBattle });
  } catch (e) { next(e); }
});
