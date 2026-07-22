import { validateInitData } from './telegramAuth.js';
import { query } from './db.js';

export async function auth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    let tgUser = null;
    if (header.startsWith('tma ')) {
      tgUser = validateInitData(header.slice(4), process.env.BOT_TOKEN);
    } else if (
      header.startsWith('dev ') &&
      process.env.DEV_AUTH === '1' &&
      process.env.NODE_ENV !== 'production'
    ) {
      tgUser = { id: Number(header.slice(4)), first_name: 'Dev' + header.slice(4) };
    }
    if (!tgUser || !tgUser.id) return res.status(401).json({ error: 'unauthorized' });
    req.tgUser = tgUser;

    let { rows } = await query('SELECT * FROM students WHERE tg_user_id = $1', [tgUser.id]);
    let student = rows[0] || null;
    if (!student && String(tgUser.id) === process.env.ADMIN_TG_ID) {
      ({ rows } = await query(
        `INSERT INTO students (tg_user_id, name, class_id, status, role)
         VALUES ($1, $2, NULL, 'approved', 'admin') RETURNING *`,
        [tgUser.id, tgUser.first_name || 'Admin']
      ));
      student = rows[0];
    }
    req.student = student;
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
