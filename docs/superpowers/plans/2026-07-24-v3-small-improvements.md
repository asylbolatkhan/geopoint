# GeoVictorina: ұсақ жақсартулар (V3)

## Контекст

V2 (фидбэк, көп құрлық, мұғалімдер) деплойда. Қолданушы төрт ұсақ жақсартуды сұрады:
1. **Реванш** — аяқталған батлдан кейін сол қарсыласқа жаңа батл тастау батырмасы: қарсылас алдын-ала таңдалады, бірақ баптауларды (құрлық, сұрақ түрі, саны) реванш тастаушы **өзі жаңадан таңдайды** (баптау экранына өтеді)
2. **Ай сайынғы қорытынды** — ай ауысқанда бот өткен айдың мектеп топ-3 үздіктерін барлық расталған қолданушыларға жариялайды
3. **Жетістіктер + стрик** — профильде 🔥 күн сериясы және медальдар торы (7 бейдж)
4. **Админ-статистиканы кеңейту** — оқушы кестесіне «соңғы белсенділік» бағаны + сыныптар бойынша жиынтық кесте

Барлық сервер өзгерістері аддитивті (жаңа JSON өрістер, жаңа кесте) — ескі клиент бұзылмайды; клиент өзгерістері `??` қорғаныспен ескі серверге төзімді.

## Task 1 — Сервер: `summarize()` → `other.id` (Реванш негізі)

**Файл:** `server/src/routes/battles.js`
- `summarize(b, myId)` (76-жол): `other`-ге `id: isChallenger ? b.opponent_id : b.challenger_id` қосу. SQL өзгермейді — `listSql` онсыз да `b.*` таңдайды (`other.role` бұрыннан бар).
- `summarize`-ді `export` ету (таза функция, тестке ашылады).
- **Жаңа тест** `server/tests/battleSummarize.test.js`: фейк жол екі перспективадан — `other.id` қарама-қарсы жақты алады, `winner`/`myCorrect` регрессия жоқ.

## Task 2 — Клиент: «Реванш» батырмасы

**Файлдар:** `tma/src/screens/BattlesTab.jsx`, `tma/src/i18n.js`

Реванш = қарсылас алдын-ала таңдалған күйде **баптау экранына** өту (баптауларды реванш тастаушы өзі таңдайды) — жаңа API шақыру логикасы қажет емес, қолданыстағы `settings` фазасы мен `throwBattle` толық қайта пайдаланылады.

- `finished` объектісіне `other` жеткізу үш жолмен: `openBattle` → `r.battle`-де бар (Task 1); `throwBattle` → `setGame(...)`-ге `other: {id: opponent.id, name: opponent.name, class_name: opponent.class_name ?? null, role: opponent.role}` қосу; `doSubmit` → `setFinished({..., other: game.other})`.
- Finished көрінісінде батырма шарты: `['completed','declined','expired'].includes(status) && other?.id && other.role !== 'admin'`.
- `rematch()` хендлері: `selectOpponent(finished.other)` үлгісіндегідей — `setOpponent(finished.other)`, баптау формасын дефолтқа тастау (қолданыстағы reset логикасы), `setFinished(null)`, `setPhase('settings')`. Одан әрі бәрі қолданыстағы ағын: `throwBattle` өз қателерін өзі көрсетеді (429 лимит, 403 мұғалім-шектеуі, 400 → жалпы қате).
- i18n: kk `rematch: 'Реванш ⚔️'`, ru `rematch: 'Реванш ⚔️'`.

## Task 3 — Сервер: ай сайынғы топ-3 хабарламасы

**Файлдар:** жаңа `server/migrations/003_announcements.sql`, жаңа `server/src/announcements.js`, `server/src/bot.js`, `server/src/messages.js`, `server/src/index.js`, жаңа `server/tests/messages.test.js`

- **Миграция 003:** `announcements(month_key TEXT PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT now())` + seed: деплой сәтіндегі өткен айды алдын-ала claim ету (алғашқы деплойда кеш хабарлама кетпес үшін):
  `INSERT INTO announcements (month_key) VALUES (to_char((now() AT TIME ZONE 'Asia/Almaty') - interval '1 month', 'YYYY-MM'));`
- **bot.js:** `notifyAllApproved(textByLang)` — `SELECT tg_user_id, lang FROM students WHERE status='approved'`, жүйелі цикл + 50мс кідіріс (Telegram ~30 msg/sec шегі; `notifyAdmins` үлгісінде, бірақ Promise.all ЕМЕС).
- **messages.js:** `export function monthLabel(key, lang)` (kk/ru ай атаулары: '2026-06' → 'маусым 2026') + екі тілде `monthlyTop(key, rows)` builder: 🥇🥈🥉 медальдармен, `аты (сыныбы) — N ұпай` жолдары, class_name null болса жақшасыз, соңында «Жаңа ай — жаңа жарыс! 💪» / «Новый месяц — новая гонка! 💪».
- **announcements.js:** `maybeAnnounceMonthly()`:
  1. `key = prevMonthKey(monthKey())`
  2. Атомды claim: `INSERT INTO announcements ... ON CONFLICT DO NOTHING RETURNING` — жоқ болса шығу (рестарт/жарыс қауіпсіз, at-most-once)
  3. Топ-3 SQL (eligibility.js-пен бірдей семантика): `SUM(points_events.amount)` per student, `LEFT JOIN classes`, `WHERE role='student' AND status='approved' AND month_key=$1`, `HAVING SUM>0`, `ORDER BY points DESC, name`, `LIMIT 3`
  4. Бос болса шығу; әйтпесе `notifyAllApproved((lang) => M[lang].monthlyTop(key, top))`
- **index.js** (45-47-жолдар): интервал денесін `sweep()`-ке айналдыру (expireDueBattles + maybeAnnounceMonthly, әрқайсысы өз catch-імен), 30 мин интервал + стартта бір рет бірден шақыру.
- **Тест** (таза логика ғана): `monthLabel` kk/ru, `M.kk.monthlyTop` — медальдар, сынып, ұпай бар; class_name null жағдайы. `maybeAnnounceMonthly` DB-тест жазылМАЙды (репо конвенциясы).

## Task 4 — Сервер: таза `achievements.js` + `dayKey()` + тесттер

**Файлдар:** жаңа `server/src/achievements.js`, `server/src/points.js`, жаңа `server/tests/achievements.test.js`, `server/tests/points.test.js`

- **points.js:** `dayKey(date)` — `monthKey` үлгісіндегі Intl (Asia/Almaty) → `'YYYY-MM-DD'`.
- **achievements.js** (импортсыз, толық таза):
  - `computeStreak(sortedDayKeys, todayKey)` → `{current, best}`. Кілттер `Date.UTC` арқылы күн нөміріне айналады (локал Date парсинг ЕМЕС); болашақ кілттер еленбейді; `current` = соңы бүгін НЕМЕСЕ кеше болатын серияның ұзындығы, әйтпесе 0; бос → `{0,0}`.
  - `computeAchievements({wins, soloCompleted, hasPerfectGame, bestStreak, totalPoints})` → бекітілген ретпен 7 бейдж: `firstWin`(жеңіс≥1), `wins10`, `solo50`, `perfect`, `streak3`, `streak7`, `points500`. Стрик-бейджтер **best**-тен есептеледі (алынған бейдж қайта жабылмайды).
- **Тесттер:** streak — бос, бүгін/кеше якорі, үзілістер, ай/жыл шекарасы (`2025-12-31`→`2026-01-01`), болашақ кілт; achievements — шек мәндері (0/1, 9/10, 49/50, 499/500, 2/3, 6/7); `dayKey` UTC+5 түн ауысуы (`points.test.js`-ке).

## Task 5 — Сервер: `GET /api/profile` → `streak` + `achievements`

**Файл:** `server/src/routes/profile.js`
- Promise.all-ға 2 сұраныс:
  - Белсенділік күндері: `SELECT DISTINCT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day FROM (solo_games completed UNION ALL points_events) ORDER BY day` — параметр `[sid, TIMEZONE]`. **Ескерту:** дәл `AT TIME ZONE` + `to_char`, `::date` ЕМЕС (сервер UTC — кешкі ойындар басқа күнге түсіп кетеді).
  - Perfect: `EXISTS(... solo_games WHERE completed AND total>=10 AND correct_count=total)`.
- `computeStreak(days, dayKey())`, `computeAchievements({wins, soloCompleted: games, hasPerfectGame, bestStreak, totalPoints})` → жауапқа `streak: {current, best}`, `achievements: [...]`.

## Task 6 — Клиент: профильде стрик + бейджтер

**Файлдар:** `tma/src/screens/ProfileTab.jsx`, `tma/src/i18n.js`
- Қорғаныс: `streak ?? {current:0,best:0}`, `achievements ?? []`.
- Стрик картасы (totalPoints-тан кейін): 🔥 `current` + `t.streakTitle`, оң жақта `best` + `t.streakBest`.
- Бейдж торы (`grid-cols-2`): unlocked → эмодзи (`{firstWin:'🏆', wins10:'⚔️', solo50:'🎯', perfect:'💯', streak3:'🔥', streak7:'🚀', points500:'⭐'}`) + `border-sky-500`; locked → 🔒 + `opacity-40`. Атау/сипаттама `t.badges[key]` (fallback `?? a.key`).
- i18n (екі тілде): `days`, `streakTitle` ('Күн сериясы'/'Серия дней'), `streakBest` ('Рекорд'), `achievementsTitle` ('Жетістіктер'/'Достижения'), кірістірілген `badges` объектісі — 7 бейджге name+desc (kk: 'Алғашқы жеңіс', 'Жеңімпаз', 'Еңбекқор', 'Мінсіз ойын', 'Қызу серия', 'Апталық серия', 'Жарты мың'; ru баламалары).

## Task 7 — Сервер: `/admin/stats` → `classSummary`

**Файл:** `server/src/routes/admin.js` (stats хендлері, ~174-жол)
- Бір SQL: сыныптар бойынша `{id, class_name, students(расталған оқушы саны), month_points(ағымдағы ай SUM), accuracy(solo орташа %)}` — корреляциялық ішкі сұраныстар (қолданыстағы students-сұраныс стилі), `ORDER BY c.name`, параметр `[monthKey()]`.
- Жауапқа `classSummary` қосу.

## Task 8 — Клиент: белсенділік бағаны + сынып жиынтығы

**Файлдар:** `tma/src/screens/AdminTab.jsx`, `tma/src/i18n.js`
- `relTime(iso, t)` хелпері: бүгін/кеше/`n күн бұрын` (теріс айырма → бүгін).
- Оқушы кестесіне 5-баған `t.lastActive` → `relTime(s.last_active, t)` (кесте онсыз да `overflow-x-auto`-да, `last_active` сервер жауабында бұрыннан бар — тек рендер қосылады).
- Жаңа карта `t.statClasses` (оқушы кестесінен кейін, `classSummary?.length > 0` қорғанысымен): сынып / оқушы саны / дәлдік (`accuracyColor`) / ай ұпайы.
- i18n: kk `lastActive: 'Белсенділік'`, `today: 'бүгін'`, `yesterday: 'кеше'`, `daysAgo: (n) => \`${n} күн бұрын\``, `statClasses: 'Сыныптар бойынша'`; ru баламалары. (`scopeClass`, `students`, `accuracy`, `points` кілттері қайта пайдаланылады.)

## Процесс және тексеру

- Бұрынғыдай: бранч (`feature/v3-small-improvements`), субагенттермен тапсырма-тапсырма (Task 1→8 реті — әр қадам жүйені жұмыс күйінде қалдырады), әр тапсырмаға ревью, соңында толық бранч-ревью, merge → main, push, Railway-ге `railway up --service geo-server` (миграция 003 автоматты).
- Локал: `server npm test` (қолданыстағы тесттер + жаңалары), `tma npm run build`.
- Деплойдан кейін қолмен: батл аяқтап «Реванш» басу; бір қарсыласқа 3 рет → 429 хабары; профильде 🔥 + бейджтер; админ-статистикада белсенділік бағаны + сынып кестесі. Хабарламаны тексеру: өткен айға фейк points_events кіргізіп, claim жолын өшіріп (`DELETE FROM announcements WHERE month_key='...'`), серверді рестарт — хабарлама келуі керек, соңында фейк деректерді тазалау.

## Ескертулер (қабылданған шешімдер)

- Хабарлама семантикасы — **at-most-once**: claim алдымен, жіберу кейін; жіберу ортасында құлау → сол айдың қалған хабарламалары кетпейді (қарапайымдылық үшін саналы таңдау).
- Seed-жол алғашқы деплойда өткен айға ретроактивті хабарлама жібермеу үшін.
- Реванш `declined`/`expired` күйлерінде де көрсетіледі; спамнан күндік 3-лимит қорғайды. `other.role==='admin'` болса жасырылады.
- Реваншта баптауларды тастаушы өзі таңдайды (қолданушының шешімі) — сондықтан серверден `config` қайтару қажет емес.
- Стрикке батл белсенділігі points_events арқылы кіреді (батл шешілген сәтте) — қосымша кесте/баған қажет емес.
- `battles` кестесінде CASCADE бар — өшірілген қарсыластың батлы тізімнен мүлдем жоғалады, сондықтан «өшірілген қарсыласқа реванш» тек тар жарыс терезесі (400 → жалпы қате хабары).
