import { query } from './db.js';
import { prevMonthKey } from './points.js';
import { BATTLE } from './config.js';

// Оқушы өткен айдың мектеп рейтингінде топ-N ішінде ме?
export async function isTopStudent(studentId) {
  const { rows } = await query(
    `SELECT s.id
     FROM students s
     JOIN points_events p ON p.student_id = s.id AND p.month_key = $1
     WHERE s.role = 'student' AND s.status = 'approved'
     GROUP BY s.id
     ORDER BY SUM(p.amount) DESC, s.name
     LIMIT $2`,
    [prevMonthKey(), BATTLE.teacherChallengeTopN]
  );
  return rows.some((r) => r.id === studentId);
}
