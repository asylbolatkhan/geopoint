import { validateInitData } from './telegramAuth.js';
import { query } from './db.js';

// Auth токенін ('tma <initData>' немесе 'dev <id>') студентке айналдырады.
// Жарамсыз/танылмаған токен → null. Жарамды токен, бірақ студент жазбасы жоқ болса
// (admin auto-provision-нан басқа жағдайда) → {tgUser, student: null} (requireApproved
// кейін 403 қайтарады — қолданыстағы мінез-құлық сақталады).
export async function resolveStudentFromAuthToken(token) {
  let tgUser = null;
  if (token.startsWith('tma ')) {
    tgUser = validateInitData(token.slice(4), process.env.BOT_TOKEN);
  } else if (
    token.startsWith('dev ') &&
    process.env.DEV_AUTH === '1' &&
    process.env.NODE_ENV !== 'production'
  ) {
    tgUser = { id: Number(token.slice(4)), first_name: 'Dev' + token.slice(4) };
  }
  if (!tgUser || !tgUser.id) return null;

  let { rows } = await query('SELECT * FROM students WHERE tg_user_id = $1', [tgUser.id]);
  let student = rows[0] || null;
  if (!student && String(tgUser.id) === process.env.ADMIN_TG_ID) {
    ({ rows } = await query(
      `INSERT INTO students (tg_user_id, name, class_id, status, role)
       VALUES ($1, $2, NULL, 'approved', 'admin')
       ON CONFLICT (tg_user_id) DO NOTHING
       RETURNING *`,
      [tgUser.id, tgUser.first_name || 'Admin']
    ));
    student = rows[0]
      ?? (await query('SELECT * FROM students WHERE tg_user_id = $1', [tgUser.id])).rows[0];
  }
  return { tgUser, student };
}

export async function auth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const resolved = header ? await resolveStudentFromAuthToken(header) : null;
    if (!resolved) return res.status(401).json({ error: 'unauthorized' });
    req.tgUser = resolved.tgUser;
    req.student = resolved.student;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireApproved(req, res, next) {
  if (!req.student || req.student.status !== 'approved') {
    return res.status(403).json({ error: 'not_approved' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.student || req.student.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
