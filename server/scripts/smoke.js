// Іске қосу: сервер DEV_AUTH=1 күйінде жұмыс істеп тұрғанда:
//   ADMIN_TG_ID=1 болуы керек (dev 1 → админ болады)
//   node scripts/smoke.js
const BASE = process.env.SMOKE_BASE || 'http://localhost:3001';

async function call(devId, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `dev ${devId}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond, label, extra) {
  if (!cond) {
    console.error('FAIL:', label, extra ?? '');
    process.exit(1);
  }
  console.log('ok:', label);
}

const ADMIN = 1, ALICE = 100, BOB = 101;

// 1. Health
let r = await fetch(BASE + '/api/health').then((x) => x.json());
assert(r.ok === true, 'health');

// 2. Admin auto-provision + class create
r = await call(ADMIN, 'GET', '/api/me');
assert(r.json.student?.role === 'admin', 'admin auto-created', r.json);
r = await call(ADMIN, 'GET', '/api/admin/schools');
assert(r.status === 200 && r.json.schools.length >= 1, 'schools listed', r.json);
const schoolId = r.json.schools[0].id;
r = await call(ADMIN, 'POST', '/api/admin/classes', { name: '7Ә', schoolId });
assert(r.status === 200, 'class created', r.json);
const classId = r.json.class.id;

// 3. Students register
for (const [id, name] of [[ALICE, 'Алия'], [BOB, 'Бекзат']]) {
  r = await call(id, 'POST', '/api/register', { name, classId, lang: 'kk' });
  assert(r.status === 200 || r.json.error === 'already_registered', `register ${name}`, r.json);
}

// 4. Approve both
r = await call(ADMIN, 'GET', '/api/admin/pending');
for (const s of r.json.students) {
  const a = await call(ADMIN, 'POST', `/api/admin/students/${s.id}/approve`, {});
  assert(a.status === 200, `approve ${s.name}`);
}

// 5. Solo game
r = await call(ALICE, 'POST', '/api/solo/start', {
  continents: ['europe'], questionTypes: ['flag-country'], count: 10,
});
assert(r.status === 200 && r.json.questions.length === 10, 'solo start', r.json);
let answers = new Array(10).fill(0);
r = await call(ALICE, 'POST', `/api/solo/${r.json.gameId}/submit`, { answers, durationMs: 60000 });
assert(r.status === 200 && typeof r.json.correct === 'number', 'solo submit', r.json);

// 6. Battle: Alice → Bob
const students = await call(ALICE, 'GET', '/api/students');
const bob = students.json.students.find((s) => s.name === 'Бекзат');
assert(bob, 'opponent listed');
r = await call(ALICE, 'POST', '/api/battles', {
  opponentId: bob.id,
  config: { continents: ['europe'], questionTypes: ['country-capital'], count: 10 },
});
assert(r.status === 200, 'battle created', r.json);
const battleId = r.json.battle.id;
r = await call(ALICE, 'POST', `/api/battles/${battleId}/submit`, {
  answers: new Array(10).fill(1), durationMs: 50000,
});
assert(r.json.status === 'awaiting_opponent', 'challenger submitted', r.json);

// 7. Bob plays
r = await call(BOB, 'GET', `/api/battles/${battleId}`);
assert(r.json.questions?.length === 10, 'opponent sees questions', r.json);
r = await call(BOB, 'POST', `/api/battles/${battleId}/submit`, {
  answers: new Array(10).fill(2), durationMs: 40000,
});
assert(r.json.status === 'completed', 'battle completed', r.json);

// 8. Leaderboard
r = await call(ALICE, 'GET', '/api/leaderboard?scope=school');
assert(r.status === 200 && r.json.rows.length >= 2, 'leaderboard', r.json);
console.log('leaderboard:', r.json.rows.map((x) => `${x.name}:${x.points}`).join(', '));

// 9. Admin stats
r = await call(ADMIN, 'GET', '/api/admin/stats');
assert(r.status === 200 && Array.isArray(r.json.students), 'admin stats');

console.log('\nSMOKE PASSED ✅');
