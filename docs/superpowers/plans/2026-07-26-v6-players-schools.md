# GeoVictorina V6: жеке ойыншылар + көп мектеп

## Контекст

Қолданушы платформаны мектептен тыс адамдарға ашқысы келеді, бірақ бақылауды сақтап:
1. **«Жеке ойыншы» рөлі**: кез келген адам тіркеледі → БАРЛЫҒЫ админ растауынан өтеді (қолданушы талабы) → БӨЛЕК ӘЛЕМ: батлдар тек ойыншы↔ойыншы, өз «Жалпы рейтингі», мектеп рейтингтеріне/статистикасына мүлдем араласпайды.
2. **Көп мектеп тіркелуі**: оқушы тіркелгенде мектепті → сыныпты таңдайды; мұғалім мектебін таңдайды; админ жаңа мектеп қоса алады. Барлық «мектеп» аясындағы функциялар нақты мектеппен шектеледі (қазір бір мектеп болғандықтан бәрі глобал).

**Негізгі факт:** students кестесінде school_id ЖОҚ (мектеп тек classes арқылы); мұғалімдерде мектеп-байланысы мүлдем жоқ; «school» scope/isTopStudent/announcements — бәрі іс жүзінде глобал. challengeEligibility жаңа рөлді қарсылас ретінде қабылдамайды (жақсы), бірақ шақырушы ретінде өткізеді (түзелуі керек).

**Тізбектеу қулығы:** Task 1-ден кейін бәрі бір мектепте → sameSchool әрқашан true, school-фильтрлер identity → серверлік scoping мінез-құлықты өзгертпей ерте қона алады.

## Task 1 — Миграция 005 + provisioning (DB қабаты)

**Файлдар:** жаңа `server/migrations/005_players_and_schools.sql`, `server/src/authMiddleware.js`, `server/scripts/seed.js`.

```sql
ALTER TABLE students ADD COLUMN school_id INT REFERENCES schools(id);
UPDATE students s SET school_id = c.school_id FROM classes c WHERE s.class_id = c.id;
UPDATE students SET school_id = (SELECT id FROM schools ORDER BY id LIMIT 1)
WHERE school_id IS NULL AND role IN ('teacher', 'admin');
ALTER TABLE students DROP CONSTRAINT students_role_check;
ALTER TABLE students ADD CONSTRAINT students_role_check
  CHECK (role IN ('student', 'teacher', 'player', 'admin'));
ALTER TABLE schools ADD CONSTRAINT schools_name_key UNIQUE (name);
CREATE INDEX students_school_idx ON students (school_id);
```
- authMiddleware auto-provision INSERT (25-30 маңы): `school_id = (SELECT id FROM schools ORDER BY id LIMIT 1)` қосу (жаңа DB-де NULL — зиянсыз, seed кейін толтырады).
- seed.js: мектепті АТЫ бойынша upsert (`INSERT ... ON CONFLICT (name) DO NOTHING` + `SELECT id WHERE name=$1`) — қазіргі `LIMIT 1` екінші мектеп пайда болса кездейсоқ мектепке сынып құяды.
- Тест жоқ (DB қабаты); `npm test` регрессия үшін. Коммит инертті: ешкім school_id оқымайды әлі.

## Task 2 — Таза логика: eligibility матрицасы + school-скоуп top-N + messages (шақырушыларымен)

**Файлдар:** `server/src/battleLogic.js`, `server/src/eligibility.js`, `server/src/messages.js`, `server/src/routes/battles.js`, `server/src/online/handler.js`, `server/tests/battleLogic.test.js`, `server/tests/messages.test.js`.

`challengeEligibility({challengerRole, opponentRole, challengerIsTop, sameSchool})` — бағалау реті:
1. opponentRole==='admin' → bad_opponent
2. challengerRole==='player' → opponentRole==='player' ? ok : bad_opponent
3. opponentRole==='player' → bad_opponent
4. challengerRole==='admin' → ok (мектеп еленбейді — глобал админ кез келгенмен тест ойнай алады)
5. !sameSchool → bad_opponent (бұл жерде екі жақ та student|teacher)
6. student→teacher && !challengerIsTop → not_eligible_teacher_battle
7. → ok

| шақырушы \ қарсылас | student | teacher | player | admin |
|---|---|---|---|---|
| student | sameSchool?ok:bad | sameSchool?(top?ok:not_eligible):bad | bad | bad |
| teacher | sameSchool?ok:bad | sameSchool?ok:bad | bad | bad |
| player | bad | bad | **ok** (мектепсіз) | bad |
| admin | ok (кез келген мектеп) | ok | bad | bad |

- eligibility.js: `isTopStudent(studentId, schoolId)` — `AND s.school_id = $3`, params [prevMonthKey(), teacherChallengeTopN, schoolId].
- Шақырушылар: battles.js POST (~130-138) және handler.js invite:send (~201-210): `isTopStudent(id, school_id)`; `sameSchool: challenger.school_id != null && challenger.school_id === opponent.school_id` (handler-дегі studentWithClass `SELECT s.*` — school_id өзі келеді).
- messages.js: `newPendingPlayer(name)` kk (`🎮 Жаңа жеке ойыншы өтінімі: ${name}`) / ru (`🎮 Новая заявка свободного игрока: ${name}`).
- **Тесттер:** battleLogic — қолданыстағы 8 кейс sameSchool:true-мен + жаңалары: student→student/teacher→student/teacher→teacher cross-school → bad; student→teacher cross-school top:true → bad (5-ереже 6-дан бұрын); player→player sameSchool:false → ok; player→student/teacher/admin → bad; student/teacher/admin→player → bad; admin→student sameSchool:false → ok. messages — newPendingPlayer екі тілде атты қамтиды.
- Коммит: бір мектеп → sameSchool әрқашан true, player жоқ → мінез-құлық бірдей.

## Task 3 — Тіркелу тік кесіндісі (сервер + клиент бірге)

**Файлдар:** `server/src/routes/auth.js`, `tma/src/screens/RegisterScreen.jsx`, `tma/src/screens/PendingScreen.jsx`, `tma/src/App.jsx`, `tma/src/i18n.js`.

Сервер:
- ЖАҢА `GET /schools` (/classes қасында, requireApproved-қа ДЕЙІН): `SELECT id, name FROM schools ORDER BY name`.
- `GET /classes`: `?schoolId=` МІНДЕТТІ (isDbId, әйтпесе 400 bad_school) → `WHERE school_id = $1 ORDER BY name`. (Транзитшіл ескі клиент 400 көріп reload жасайды — сервер+клиент бір артефакт, қауіпсіз.)
- `POST /register`: allow-list ['student','teacher','player']:
  - player: {name, lang, role:'player'} → INSERT (class/school NULL, pending) + notifyAdmins(newPendingPlayer).
  - teacher: {name, lang, role, schoolId} → мектеп бар-жоғын тексеру (bad_school), INSERT school_id-мен, class NULL.
  - student: {name, lang, schoolId, classId} → сынып бар ЖӘНЕ `cls.school_id === schoolIdNum` (bad_class), INSERT class_id+school_id.
- `GET /students` пикері: caller role==='player' → `WHERE approved AND role='player' AND id<>$me` (+іздеу; class фильтрсіз; eligibleForTeacherBattle: true); әйтпесе қолданыстағы сұранысқа `AND s.school_id = $mySchool` (мұғалімдер де тек өз мектебінен).

Клиент:
- RegisterScreen: рөл чиптері массивпен ×3 (roleStudent/roleTeacher/rolePlayer); мектеп-пикер (/schools mount-та; чиптер) student+teacher-ге; сынып-пикер тек student-ке, таңдалған мектепке тәуелді (`/classes?schoolId=`, мектеп ауысса рефетч + classId reset); player екеуін де жасырады. canSubmit: student → name+school+class; teacher → name+school; player → name. Payload жоғарыдағыдай. 409-жол өзгеріссіз.
- PendingScreen: `role` prop қабылдайды (App-тан `role={me.role}`); player → `t.pendingTextPlayer`, әйтпесе pendingText.
- i18n (екі тілде): rolePlayer ('Жеке ойыншы'/'Свободный игрок'), pendingTextPlayer ('Тіркелуіңді әкімші растағанша сәл күте тұр 🙌'/'Подожди, пока администратор подтвердит регистрацию 🙌'), yourSchool ('Мектебің'/'Твоя школа').

## Task 4 — Админ тік кесіндісі: мектеп CRUD, player өтінімдері, мектеп-қорғандар

**Файлдар:** `server/src/routes/admin.js`, `tma/src/screens/AdminTab.jsx`, `tma/src/i18n.js`.

Сервер:
- GET /pending: + `s.school_id, sc.name AS school_name` (LEFT JOIN schools).
- POST approve: алдымен жолды жүктеу; classId ТЕК role==='student' жолға қолданылады және `class.school_id = row.school_id` тексеріледі (bad_class) — басқа мектептің сыныбымен растау бұзылмасын; teacher/player classId елемейді.
- GET /students: role IN ('student','teacher','player') + school_id/school_name; ORDER BY sc.name, c.name NULLS LAST, s.name.
- PATCH /students/:id: жаңа сынып оқушының мектебіне тиесілі екені тексеріледі.
- ЖАҢА: GET /admin/schools (id, name, сынып саны, расталған мүше саны); POST /admin/schools {name} (trim, ≤40, 23505 → 409 duplicate); DELETE /admin/schools/:id (сыныбы немесе мүшесі болса 409 not_empty).
- POST /classes: {name, schoolId} (мектеп тексеріледі — `LIMIT 1` жойылады); GET /classes: + school_id.
- GET /stats: students жолдарына + school_name (ORDER BY school, class); classSummary + мектеп атауы; miss-analysis/inactive глобал қалады (бір глобал админге қолайлы).

Клиент (AdminTab):
- PendingSection: player жолы → t.playerBadge pill (ClassSelect жоқ, approve classId:null); student жолдарында ClassSelect тек сол мектептің сыныптары (`classes.filter(c => c.school_id === s.school_id)`); school_name көрсету.
- StudentRow: сынып ауыстыру ТЕК role==='student' (қазір `!== 'teacher'` — player-ге де көрінер еді); ClassSelect мектеп-фильтрмен; subtitle: class_name ?? (teacher→teacherBadge, player→playerBadge, әйтпесе '').
- ClassesSection қайта құрылады: мектеп-селектор чиптері (/admin/schools) + инлайн «мектеп қосу» + мектеп өшіру (409 → schoolNotEmpty) + таңдалған мектептің сыныптары + сынып қосу {name, schoolId}. SECTIONS ×4 қалады (мектеп басқару «Сыныптар» секциясының ішінде).
- StatsSection: classSummary-ге мектеп атауы (мектеп >1 болғанда префикс — имплементер таңдауы).
- i18n: playerBadge ('Жеке ойыншы'/'Свободный игрок'), addSchool ('Мектеп қосу'/'Добавить школу'), schoolName ('Мектеп атауы'/'Название школы'), schoolNotEmpty ('Мектепте сыныптар немесе мүшелер бар'/'В школе есть классы или участники').

## Task 5 — Рейтинг + хабарландыру кесіндісі (сервер + RatingTab)

**Файлдар:** `server/src/routes/leaderboard.js`, `server/src/announcements.js`, `server/src/bot.js`, `tma/src/screens/RatingTab.jsx`, `tma/src/i18n.js`.

Сервер (leaderboard.js) — рөлге қарай scope жиындары (серверлік ДЕФОЛТ та рөлге қарай — player параметрсіз шақырса 403 емес, global алуы керек):
```js
const SCOPES = {
  student: ['class', 'school', 'classes'],
  teacher: ['school', 'classes', 'teachers'],
  admin:   ['school', 'classes', 'teachers', 'global'],
  player:  ['global'],
};
// сұралған scope тізімде болмаса 403; жоқ болса SCOPES[role][0]
```
- class/school: қолданыстағы сұраныс + `AND s.school_id = $school` ($school = req.student.school_id; role admin болса опционал `?schoolId=` қабылданады — глобал админ басқа мектепті көре алуы үшін, UI кейін).
- classes: `WHERE c.school_id = $school`; teachers: + school фильтрі.
- ЖАҢА global: сол SUM пішіні, `WHERE role='player' AND approved`, class_name NULL, LIMIT 100.

announcements.js: бір claim-нен кейін — мектептер циклі: әр мектепке top-3 (қолданыстағы сұраныс + `AND s.school_id=$2`), бос болса өткізу, `notifySchoolMembers(schoolId, ...)`; сосын player top-3 (role='player') → `notifyPlayers(...)`. bot.js: `notifySchoolMembers(schoolId, textByLang)` (`WHERE approved AND school_id=$1`, 50мс кідіріспен жүйелі) + `notifyPlayers(textByLang)` (`WHERE approved AND role='player'`); notifyAllApproved енді қолданылмаса — өшіру.

Клиент (RatingTab): SCOPES_PLAYER=['global'], SCOPES_ADMIN + 'global'; defaultScopeFor('player')='global'; subtitle (142-жол): `scope==='teachers' ? t.teacherBadge : scope==='global' ? '' : (r.class_name ?? '')` — player-лерді «Мұғалім» деп белгілеу қатесі де жөнделеді. i18n: scopeGlobal ('Жалпы рейтинг'/'Общий рейтинг').

## Task 6 — BattlesTab / онлайн клиент player-жылтырату

**Файлдар:** `tma/src/screens/BattlesTab.jsx`, `tma/src/i18n.js` (playerBadge қайта пайдаланылады).

- Пикер чиптері (481): `me.role !== 'teacher'` → `me.role === 'student'` (player-ге де сынып/мектеп чиптері жоқ; player-дің бастапқы scope='myClass' зиянсыз — class_id null болғандықтан параметр кетпейді).
- Пикер жолдары: серверден player-ге тек player-лер келеді → studentRows бұтағында көрінеді; оң жақ белгі: class_name null → t.playerBadge (роль-хабардар).
- Белгі-фолбэктер (BattleRow 68, settings header 552, finished.other): `class_name ?? (role==='teacher' ? t.teacherBadge : role==='player' ? t.playerBadge : '')`.
- InviteToast class-префиксі null-да онсыз да жасырын — өзгеріссіз. onlineDot, H2H, rematch — өзгеріссіз жұмыс істейді.

## Task 7 — E2E драйв (контроллер өзі, merge алдында)

Бұрынғы инфра: Railway Postgres-те уақытша geodev_e2e, migrate+seed, DEV_AUTH сервер, vite-тер, Playwright (Edge headless). Драйв:
1. dev 999 (ADMIN_TG_ID) → /me → админ auto-provision, school_id толған.
2. Админ: жаңа мектеп «Школа Б» + оған сынып қосу (жаңа UI арқылы).
3. dev 111: тіркелу экраны — 3 рөл чипі; player болып тіркелу → pending (player мәтіні) → админ pending-те playerBadge көріп растайды (classId әдейі таңдалса да class NULL қалатынын тексеру). dev 222 → P2.
4. P1 пикерінде тек P2; P1↔P2 онлайн батл толық өтеді (ұпай жазылады); P1 → оқушыға тікелей API батл → 400 bad_opponent.
5. dev 333 Школа Б оқушысы болып тіркеледі (мектеп → сынып каскады) → расталады → Школа А оқушысының пикерінде көрінбейді; кросс-мектеп тікелей API батл → 400.
6. Рейтинг: player scope=global (тек P1/P2); player scope=school → 403; student scope=global → 403; student school → өз мектебі ғана.
7. `server npm test` (battleLogic жаңа матрица) + `tma npm run build`.

## Процесс

Бранч `feature/v6-players-schools`, субагенттермен Task 1→6, әр тапсырмаға ревью, финалдық бранч-ревью, e2e (Task 7), merge → main, `railway up` (миграция 005 автоматты). Деплойдан кейін: нақты Telegram-нан жеке ойыншы болып тіркеліп көру.

## Ескертулер (қабылданған шешімдер)

- Барлық жаңа қолданушы (player қоса) админ растауынан өтеді — қолданушының қатаң талабы.
- Player-лер мектеп әлемін көрмейді және оған көрінбейді (пикер, рейтинг, статистика, хабарландыру — бөлек).
- Админ шақырушы ретінде кез келген мектептің student/teacher-імен ойнай алады (тест мақсатында); админға батл тастау бұрынғыша мүмкін емес.
- Ай сайынғы хабарландыру: бір claim → мектеп сайын top-3 өз мүшелеріне + player top-3 player-лерге.
- Мектеп өшіру тек бос болса (сынып/мүше жоқ); FK онсыз да қорғайды.
- Кросс-мектеп батлдар (мектепаралық жарыс) — болашаққа қалдырылды.
