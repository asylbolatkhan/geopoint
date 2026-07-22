import { TIMEZONE } from './config.js';
import { query } from './db.js';

export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}`;
}

export async function awardPoints(studentId, amount, reason, refId = null, client = null) {
  const runner = client ?? { query };
  await runner.query(
    `INSERT INTO points_events (student_id, amount, reason, ref_id, month_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [studentId, amount, reason, refId, monthKey()]
  );
}
