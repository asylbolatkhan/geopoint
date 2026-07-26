import { query } from './db.js';
import { monthKey, prevMonthKey } from './points.js';
import { notifySchoolMembers, notifyPlayers } from './bot.js';
import { M } from './messages.js';

// Ай ауысқанда өткен айдың мектеп топ-3-ін бір рет хабарлайды.
// announcements кестесі арқылы атомды claim жасалады — рестарт/жарыс кезінде
// қайта жіберілмейді (at-most-once).
export async function maybeAnnounceMonthly() {
  const key = prevMonthKey(monthKey());

  const { rows: claimed } = await query(
    'INSERT INTO announcements (month_key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING month_key',
    [key]
  );
  if (claimed.length === 0) return;

  const { rows: schools } = await query('SELECT id FROM schools ORDER BY id');
  for (const school of schools) {
    const { rows: top } = await query(
      `SELECT s.name, c.name AS class_name, SUM(p.amount)::int AS points
       FROM students s
       JOIN points_events p ON p.student_id = s.id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.role = 'student' AND s.status = 'approved' AND p.month_key = $1
         AND s.school_id = $2
       GROUP BY s.id, c.name
       HAVING SUM(p.amount) > 0
       ORDER BY SUM(p.amount) DESC, s.name
       LIMIT 3`,
      [key, school.id]
    );
    if (top.length === 0) continue;
    await notifySchoolMembers(school.id, (lang) => M[lang].monthlyTop(key, top));
  }

  const { rows: playerTop } = await query(
    `SELECT s.name, NULL AS class_name, SUM(p.amount)::int AS points
     FROM students s
     JOIN points_events p ON p.student_id = s.id
     WHERE s.role = 'player' AND s.status = 'approved' AND p.month_key = $1
     GROUP BY s.id
     HAVING SUM(p.amount) > 0
     ORDER BY SUM(p.amount) DESC, s.name
     LIMIT 3`,
    [key]
  );
  if (playerTop.length > 0) {
    await notifyPlayers((lang) => M[lang].monthlyTop(key, playerTop));
  }
}
