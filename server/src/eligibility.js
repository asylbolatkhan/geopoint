import { query } from './db.js';
import { prevMonthKey } from './points.js';
import { BATTLE } from './config.js';

// Оқушы өткен айдың мектеп рейтингінде топ-N ішінде ме? (тек өз мектебінің ішінде)
export async function isTopStudent(studentId, schoolId) {
  const { rows } = await query(
    `SELECT s.id
     FROM students s
     JOIN points_events p ON p.student_id = s.id AND p.month_key = $1
     WHERE s.role = 'student' AND s.status = 'approved' AND s.school_id = $3
     GROUP BY s.id
     HAVING SUM(p.amount) > 0
     ORDER BY SUM(p.amount) DESC, s.name
     LIMIT $2`,
    [prevMonthKey(), BATTLE.teacherChallengeTopN, schoolId]
  );
  return rows.some((r) => r.id === studentId);
}
