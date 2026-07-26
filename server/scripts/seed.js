import 'dotenv/config';
import { pool } from '../src/db.js';

async function main() {
  const schoolName = process.env.SCHOOL_NAME || 'Менің мектебім';
  await pool.query('INSERT INTO schools (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [schoolName]);
  const { rows } = await pool.query('SELECT id FROM schools WHERE name = $1', [schoolName]);
  const schoolId = rows[0].id;
  console.log('school:', schoolName, 'id', schoolId);
  const classNames = (process.env.SEED_CLASSES || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of classNames) {
    await pool.query(
      'INSERT INTO classes (school_id, name) VALUES ($1, $2) ON CONFLICT (school_id, name) DO NOTHING',
      [schoolId, name]
    );
    console.log('class', name);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
