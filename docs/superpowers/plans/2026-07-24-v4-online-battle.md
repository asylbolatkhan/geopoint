# GeoVictorina: Онлайн батл (real-time) — V4

## Контекст

«Онлайн батл» батырмасы іске қосылғаннан бері «Жақын арада 🔒» күйінде тұр. Енді нағыз real-time режим жасалады: екі ойыншы бір мезгілде, бір сұрақтарды көріп, бір-бірінің прогресін бақылап жарысады (Kahoot-стиль). Сервер — Railway-дегі жалғыз инстанс (бір процесс, бір порт) → in-memory күй қауіпсіз.

## Қабылданған негізгі шешімдер

1. **Транспорт**: `ws` кітапханасы, `app.listen()` қайтарған http.Server-ге жалғанады, жол `/ws`, аутентификация `?auth=<urlencoded getAuthHeader()>` query-параметрімен (браузер WS-те header қоя алмайды) — authMiddleware-ден бөлініп шығатын ортақ хелпермен тексеріледі (тек approved). `req.url`-ды upgrade-хендлерде ЛОГТАМАУ (ішінде жарамды токен бар).
2. **Lockstep раундтар**: екі ойыншы әр раундта БІР канондық сұрақты бір мезгілде ойнайды. Сұрақ РЕТІ ортақ (ортақ matchSeed-пен seededShuffle), нұсқалар реті ӘР ОЙЫНШЫҒА БӨЛЕК (қолданыстағы per-player seed механикасы — көршінің экранынан көшіру пайдасыз). Екеуі де жауап бергенде (немесе дедлайн+1.5с) → екеуіне БІР МЕЗГІЛДЕ дұрыс жауап + ұпайлар ашылады (екеуі де құлыптаған соң ашу қауіпсіз) → ~2.5с үзіліс → келесі раунд. Сұрақтар раунд сайын жіберіледі (толық тізім алдын-ала берілмейді — анти-чит).
3. **Уақыт өкілеттігі — сервер**: раунд дедлайны абсолютті серверлік ms; клиент countdown-ды `deadline - (Date.now()+serverOffset)` арқылы салады (serverOffset hello/pong/round:start-тағы serverNow-дан). Жауап уақыты СЕРВЕРДЕ өлшенеді (durationMs тай-брейкке).
4. **Өмірлік цикл**: шақыру (in-memory, TTL 90с) → қарсыласқа WS invite:incoming (онлайн болса) + ӘРҚАШАН бот push → accept → 3с countdown → раундтар → соңы. Decline/timeout → айыппұл ЖОҚ. Eligibility: challengeEligibility + isTopStudent қайта пайдаланылады; күндік лимит: сол pair-per-day санағы (battles кестесі, кез келген mode) шақыру кезінде тексеріледі.
5. **Сақтау**: матч аяқталғанша ЕШТЕҢЕ жазылмайды. Соңында бір транзакция: INSERT battles (mode='online', status='completed', екі result, winner_id, expires_at=now()) + applyWhoEvents(completedPointsEvents(...)) — ұпай жүйесі асинхронды батлмен бірдей (win 20 / draw 10 / loss 4 + correct×1). Матч ортасында сервер құласа — ештеңе жазылмайды (қабылданған).
6. **Үзіліс/forfeit**: ойын кезінде байланыс үзілсе → таймер ТОҚТАТЫЛАДЫ (pause, қалған ms сақталады), қарсылас «қайта қосылуда...» баннерін көреді, 20с grace; үлгерсе — раунд қалған уақытымен жалғасады (snapshot қайта жіберіледі). Grace өтсе НЕМЕСЕ саналы match:leave → шыққан ойыншы АВТОМАТТЫ ЖЕҢІЛЕДІ (forfeit), ұпай қалыпты жазылады. Екеуі де үзілсе → матч жойылады, ештеңе жазылмайды.
7. **Presence**: registry Map<studentId, ws>; онлайн-батл пикерінде жасыл нүкте (WS presence:get). Офлайн оқушыға да шақыруға БОЛАДЫ (бот push 90с ішінде шақырады).
8. **Клиент архитектурасы**: WS App-деңгейлі OnlineProvider-де (таб ауысқанда табтар толық unmount болады — сокет табта өмір сүре алмайды). Матч UI = App-деңгейлі full-screen overlay (inset-0 z-50); шақыру-тост та App-деңгейде. BattlesTab тек pick+settings жасап, sendInvite() арқылы overlay-ге тапсырады.
9. **Матч-движок — таза state machine** (repo конвенциясы: тек pure-logic vitest тесттері): matchEngine.js Date.now()/IO-сыз, {state, effects} қайтарады; socket/таймер желімі handler.js-те жұқа әрі тестсіз.
10. Сұрақ саны [10,15,20], questionSeconds 15 — қайта пайдаланылады. Онлайн-раундта QuizPlay ҚОЛДАНЫЛМАЙДЫ — жаңа OnlineRound компоненті (QuizPlay-дің презентациялық маркупын көшіреді: сұрақ картасы, нұсқа батырмалары, flag 2-col grid, FlagImg, haptic).

## WS протокол (JSON {type, ...}; белгісіз type екі жақта да еленбейді)

**Клиент → Сервер:** `ping` · `presence:get` · `invite:send {toStudentId, config}` · `invite:cancel {inviteId}` · `invite:accept {inviteId}` · `invite:decline {inviteId}` · `round:answer {matchId, round, optionIndex}` · `match:leave {matchId}` · `match:state` (снапшот сұрау — reconnect/visibility-те).

**Сервер → Клиент:** `hello {studentId, serverNow, activeMatch}` · `pong {serverNow}` · `presence:list {online:[ids]}` · `invite:incoming {inviteId, from:{id,name,class_name}, config, expiresAt, serverNow}` (онлайн болса бірден; кейін қосылса hello-да қайта жеткізіледі) · `invite:sent {inviteId, expiresAt, serverNow}` · `invite:cancelled` · `invite:declined` · `invite:expired` · `invite:error {code}` (codes: self, busy_you, busy_target, not_eligible, daily_cap, already_pending, not_found, challenger_offline, bad_config) · `match:start {matchId, opponent, config, totalRounds, countdownEndsAt, serverNow}` · `round:start {matchId, round, total, question:{type,display,options}, deadline, serverNow}` (ойыншыға өз тілінде, өз нұсқа-ретімен) · `round:opponent_answered {round}` · `round:result {matchId, round, correctOption, yourAnswer, yourCorrect, opponentCorrect, scores:{you,opponent}, nextRoundAt, serverNow}` (индекстер per-player display) · `match:opponent_disconnected {graceEndsAt, serverNow}` · `match:opponent_reconnected {deadline, serverNow}` · `match:snapshot {phase, round, question?, deadline?, revealPayload?, scores, opponent, countdownEndsAt?, serverNow}` · `match:end {matchId, outcome:'win'|'loss'|'draw', reason:'completed'|'forfeit_opponent'|'forfeit_you', scores, yourPoints, battleId}` (DB commit-тен КЕЙІН ғана) · `match:none` · `error {code}`.

## Матч-движок спецификациясы (server/src/online/matchEngine.js — ТАЗА)

Константалар (export): `COUNTDOWN_MS=3000, REVEAL_MS=2500, ANSWER_GRACE_MS=1500, DISCONNECT_GRACE_MS=20000`.

State: `{matchId, config, totalRounds, order:[canonicalIdx] (seededShuffle matchSeed-пен), round, phase:'countdown'|'round_active'|'round_reveal'|'finished'|'aborted', phaseDeadline, paused, pauseRemainingMs, challengerId, opponentId, players:{[id]:{id, lang, seed, rendered (renderForPlayer нәтижесі canonicalIdx бойынша), correct (correctIndexes), score, durationMs, roundAnswer:null|{optionIndex,atMs}, connected, graceDeadline}}, result}`.

Effects: `{type:'send', to:id|'both', msg}` · `{type:'setTimer', name, at}` · `{type:'clearTimer', name}` · `{type:'persist', data}` · `{type:'end'}`. Таймер аттары: countdownEnd, roundDeadline, revealEnd, grace:<id>.

API (бәрі `now` параметрін алады, ішінде Date.now() ЖОҚ): `createMatch({matchId, challengerId, opponentId, playerMeta, questions, config, matchSeed, now})`, `applyAnswer(state, studentId, round, optionIndex, now)`, `applyTimer(state, timerName, now)`, `applyDisconnect / applyReconnect / applyLeave(state, studentId, now)`, `snapshotFor(state, studentId, now)` — бәрі `{state, effects}` (snapshotFor — msg).

Өтулер: createMatch → countdown (match:start both, setTimer countdownEnd). countdownEnd → startRound(0): round_active, deadline=now+15000, per-player round:start, setTimer roundDeadline at deadline+ANSWER_GRACE_MS. applyAnswer қорғандары (бәрі үнсіз еленбейді): phase≠round_active; round≠state.round; roundAnswer бар (қос жауап); now>deadline+grace. Қабылданса: {optionIndex, atMs: now-roundStartAt} жазылады, қарсыласқа round:opponent_answered (қосулы болса); екеуі де жауап берсе → finishRound. roundDeadline → жауапсыздарға {optionIndex:null, atMs:15000} → finishRound. finishRound: score/durationMs жинақталады, round_reveal, round:result екеуіне, setTimer revealEnd. revealEnd → келесі раунд НЕМЕСЕ finishMatch('completed'): outcome=resolveBattle({correct,durationMs}×2), phase finished, effects: persist → match:end both → end. applyDisconnect: connected=false; екіншісі де өшік → aborted (persist ЖОҚ, end); әйтпесе paused=true, pauseRemainingMs сақталады, фаза-таймер clearTimer, setTimer grace:<id> now+20000, қарсыласқа match:opponent_disconnected. applyReconnect: clearTimer grace, paused болса deadline=now+pauseRemainingMs қайта есептеледі + таймер қайта қойылады, өзіне snapshot, қарсыласқа match:opponent_reconnected. grace:<id> таймері немесе applyLeave → forfeit: result={outcome: қарсы жақ, reason:'forfeit'}, persist (мәжбүрлі outcome), match:end both, end.

## Миграция (server/migrations/004_battle_mode.sql)

```sql
ALTER TABLE battles ADD COLUMN mode TEXT NOT NULL DEFAULT 'async';
ALTER TABLE battles ADD CONSTRAINT battles_mode_check CHECK (mode IN ('async', 'online'));
```
(002-дегі constraint үлгісімен; sweep()/expireDueBattles тек status='awaiting_opponent' сүзетінін растау — completed online жолдарға (expires_at=now()) тимейді.)

## Task 1 — Сервер: миграция + persist + summarize.mode

**Файлдар:** жаңа `server/migrations/004_battle_mode.sql` (жоғарыда), жаңа `server/src/online/persist.js`; `server/src/routes/battles.js` өзгереді.
- battles.js: `applyWhoEvents`-ке `export` қосу (22-жол маңы); `summarize()`-ге `mode: b.mode || 'async'` қосу.
- persist.js: `persistOnlineBattle({challengerId, opponentId, config, questions, challengerResult, opponentResult, outcome})` → withTransaction: INSERT battles (status='completed', mode='online', winner_id outcome бойынша, expires_at=now(), результаттар {correct, durationMs} — асинхронды жолдармен бірдей пішін) RETURNING id → completedPointsEvents(outcome, chR, opR) → applyWhoEvents → `{battleId, events}` қайтарады.
- **Тест:** `server/tests/battleSummarize.test.js` кеңейту — mode:'online' completed жол дұрыс summarize болады (mode өтеді, result verbatim), ескі жолдар 'async' дефолт.

## Task 2 — Сервер: matchEngine.js + толық тесттер (таза)

**Файлдар:** жаңа `server/src/online/matchEngine.js` (жоғарыдағы спецификация ДӘЛ), жаңа `server/tests/matchEngine.test.js`.
- renderForPlayer/correctIndexes quiz.js-тен, seeded shuffle random.js-тен (нақты export атын имплементер растайды).
- **Тест матрицасы:** 3-раундтық толық happy-path (applyTimer/applyAnswer тізбегі); қос жауап еленбейді; ескі раунд жауабы еленбейді; deadline+1400 қабылданады / deadline+1600 еленбейді; екеуі де timeout раунд (durationMs += 15000, ұпай жоқ); соңғы reveal → persist эффектісі дұрыс resolveBattle outcome-мен, тең ұпайда durationMs тай-брейк; disconnect → pause (phaseDeadline қатып қалады), reconnect → қалған уақыт дұрыс + snapshot + opponent_reconnected; grace бітті → forfeit persist мәжбүрлі outcome-мен; applyLeave → forfeit; екеуі де disconnect → aborted, persist ЖОҚ; нұсқа-рет тәуелсіздігі (бір канондық сұраққа A мен B-ның correctOption-ы әртүрлі seed-те әртүрлі).

## Task 3 — Сервер: WS транспорт + presence

**Файлдар:** `server/package.json` (+ws), `server/src/index.js`, `server/src/authMiddleware.js`; жаңа `server/src/online/registry.js`, `server/src/online/wsServer.js`.
- index.js: `const server = app.listen(port, ...)` — серверді ұстап, wsServer-ге беру.
- authMiddleware.js: header-логиканы `export async function resolveStudentFromAuthToken(token)`-ға бөліп шығару ('tma <initData>' | 'dev <id>'; барлық қазіргі тексерістер: validateInitData, DEV_AUTH gate, студент іздеу, admin auto-provision) — middleware соны шақырады (мінез-құлық өзгермейді).
- wsServer.js: `new WebSocketServer({noServer:true})`; `server.on('upgrade')`: pathname≠'/ws' → destroy; `auth` query-параметрін decodeURIComponent → resolveStudentFromAuthToken; сәтсіз/approved емес → 401 жазып destroy; сәтті → handleUpgrade, ws.student. req.url ЛОГТАЛМАЙДЫ. Heartbeat: сервер ws.ping() 25с сайын, pong жоқ → terminate; `{type:'ping'}` → pong {serverNow}; presence:get → presence:list; ашылғанда hello.
- registry.js: `sockets Map<studentId, ws>` (register ескі сокетті 4001 кодымен жабады — екінші құрылғы), unregister (тек ағымдағы ws болса), isOnline, onlineIds; + Task 4 үшін: invites Map, matches Map<matchId,{state,timers}>, matchByStudent Map.
- Бұзық JSON / белгісіз type → еленбейді.

## Task 4 — Сервер: handler — шақырулар + матч-оркестрация

**Файлдар:** жаңа `server/src/online/handler.js`; `server/src/messages.js` + `server/tests/messages.test.js` (onlineInvite builder-лері).
- **invite:send**: parseGameConfig (bad_config); тәртіппен: self / busy_you (жіберуші матчта) / already_pending (шығыс шақыруы бар) / busy_target / not_eligible (рөлдер + isTopStudent → challengeEligibility) / daily_cap — battles.js-тегі pair-per-Almaty-day санақ SQL-ін `countBattlesTodayBetween(aId,bId)` етіп export-тап қайта пайдалану (көшірмеу!). Өтсе: invite {id: randomUUID, fromId, toId, config, expiresAt: now+90000} + TTL таймер; invite:sent; онлайн болса invite:incoming; ӘРҚАШАН notify(target, M[lang].onlineInvite(senderName)). hello-да сол студентке кезектегі invite:incoming қайта жеткізіледі.
- **invite:accept**: жоқ/мерзімі өткен → not_found; accepter≠toId → еленбейді; жіберуші офлайн → challenger_offline + invite өшеді (айыппұлсыз); біреуі матчта → busy_*. Сәтті: invite өшеді; екі ойыншыға қатысты БАРЛЫҚ басқа кезектегі шақырулар expired етіледі; generateQuestions(config) БІР РЕТ; matchSeed/seedA/seedB — тәуелсіз кездейсоқ int; createMatch; matches/matchByStudent тіркеу; effects іске асады.
- **Effect-раннер** (жалғыз stateful желім): send → registry арқылы ws.send (ашық болса); setTimer/clearTimer → матчтың timers Map-індегі setTimeout(() => runEffects(applyTimer(state, name, Date.now()))); persist → await persistOnlineBattle → battleId + per-player points (events-тен) кезектегі match:end-терге қосылады, содан кейін жіберіледі; DB қатесі → error {code:'persist_failed'} + end; end → таймерлер тазаланады, matches/matchByStudent-тен өшеді.
- Socket close → матчта болса applyDisconnect; hello кезінде matchByStudent-те болса applyReconnect; match:state → snapshot немесе match:none; round:answer/match:leave → engine.
- **Edge:** өзара A↔B шақырулар — екеуі де кезекте, бірінші accept матч бастап, кері шақыруды expired етеді; бір адамға бір мезгілде екі accept — Node бір ағынды, екіншісі busy көреді; шақыру кезінде жіберуші үзілсе — invite TTL-мен өмір сүреді, accept challenger_offline береді; сервер рестарт — клиенттер match:none алады (Task 6 өңдейді); бөтен матчқа жауап → еленбейді.

## Task 5 — Клиент: socket + OnlineProvider (инертті)

**Файлдар:** жаңа `tma/src/online/socket.js`, `tma/src/online/OnlineProvider.jsx`; `tma/src/App.jsx`, `tma/src/api.js` (немесе telegram.js — auth-токен құрушыны `getAuthToken()` етіп export), `tma/vite.config.js`.
- vite.config.js: `proxy: { '/api': 'http://localhost:3001', '/ws': { target: 'ws://localhost:3001', ws: true } }`.
- socket.js (модуль-синглтон): connect(token, {onMessage, onStatus}), send(obj) (жабық болса үнсіз тасталады), disconnect. URL: `${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws?auth=${encodeURIComponent(token)}`. Reconnect: экспоненциалды backoff 1→2→4→8→15с cap ±20% jitter; app-деңгейлі ping 25с, 10с ішінде pong жоқ → force close → reconnect. serverOffset = serverNow − Date.now() (hello/pong/әр timed хабарламадан жаңарады); serverNowMs() export.
- OnlineProvider: approved қолданушыға қосылады; context: {wsStatus, onlineIds, refreshPresence, sendInvite(toId, config), cancelInvite, acceptInvite, declineInvite, sendAnswer, leaveMatch, online}. Reducer state: {overlay:'idle'|'waiting'|'countdown'|'round'|'reveal'|'end'|'lost', invite, incomingInvite, match:{matchId, opponent, round, total, question, deadline, revealPayload, scores, opponentDisconnected, endPayload}, lastError} — кіріс хабарламаларға таза switch (match:snapshot кез келген фазаны қалпына келтіреді; overlay≠idle кезінде match:none → 'lost').
- **Visibility (Telegram-да маңызды):** document visibilitychange — көрінген кезде: сокет OPEN емес → backoff reset + бірден reconnect; OPEN → match:state жіберу (ұйықтап қалған телефон кейсі).
- App.jsx: approved бұтақты `<OnlineProvider me lang>`-пен орау. UI өзгеріссіз — commit инертті (devtools-пен /ws қосылып, hello/presence жұмысын тексеру).

## Task 6 — Клиент: overlay UI + шақыру-тост + i18n (әлі инертті)

**Файлдар:** жаңа `tma/src/online/OnlineMatchOverlay.jsx`, `tma/src/online/OnlineRound.jsx`, `tma/src/online/InviteToast.jsx`; `tma/src/App.jsx` (провайдер ішінде, таб-conditional-дан ТЫС: `<InviteToast/>` + `<OnlineMatchOverlay/>`), `tma/src/i18n.js` (төмендегі кесте).
- OnlineMatchOverlay (fixed inset-0 z-50, overlay≠idle кезінде): waiting (шақыру жіберілді, TTL countdown, Болдырмау) / countdown (3-2-1, қарсылас аты, ⚡) / round+reveal (OnlineRound) / end (нәтиже, есеп you:opp, +ұпай, Жабу) / lost (үзілді, Жабу).
- OnlineRound: QuizPlay-дің презентациялық маркупын көшіреді (сұрақ картасы, нұсқа батырма кластары, flag-типтерге 2-col grid, FlagImg, haptic) бірақ өзін-өзі жылжытпайды: таймер-бар = deadline − (Date.now()+serverOffset), 250мс tick, ≥0 clamp; тап → UI бірден құлыпталады + sendAnswer + haptic('light'); round:opponent_answered → «Қарсылас жауап берді» чипі; round:result → өз таңдауы қызыл/жасыл + дұрысы жасыл + haptic('heavy' қатеде), жүгіру есебі; opponentDisconnected → баннер + қатқан таймер. Шығу батырмасы → confirm (onlineLeaveConfirm) → leaveMatch.
- Edge: құлыптан кейінгі таптар еленбейді; reveal ерте келсе (қарсылас жылдам + өзі timeout) бірден көрсету; end жабылғанда қолданушы тұрған табқа қайтады (overlay таб-күйге тимейді).
- **i18n (екі тілде де):** onlineLabel ('Онлайн'/'Онлайн'), onlineInviteSent ('Шақыру жіберілді'/'Приглашение отправлено'), onlineWaitingAccept ('Қарсыласты күтеміз…'/'Ждём соперника…'), onlineInviteIncoming ('сені онлайн жекпе-жекке шақырады!'/'вызывает тебя на онлайн-батл!'), onlineAccept ('Қабылдау'/'Принять'), onlineDecline ('Бас тарту'/'Отклонить'), onlineCancel ('Болдырмау'/'Отменить'), onlineInviteDeclined ('Қарсылас шақыруды қабылдамады'/'Соперник отклонил вызов'), onlineInviteExpired ('Шақырудың мерзімі өтті'/'Приглашение истекло'), onlineOpponentBusy ('Қарсылас қазір бос емес'/'Соперник сейчас занят'), onlineGetReady ('Дайындал!'/'Приготовься!'), onlineOpponentAnswered ('Қарсылас жауап берді'/'Соперник ответил'), onlineOpponentThinking ('Қарсылас ойлануда…'/'Соперник думает…'), onlineOpponentReconnecting ('Қарсыластың байланысы үзілді, күтеміз…'/'Соперник потерял связь, ждём…'), onlineOpponentLeft ('Қарсылас ойыннан шықты — сен жеңдің!'/'Соперник покинул игру — победа за тобой!'), onlineYouLeft ('Сен ойыннан шықтың — жеңіліс саналды'/'Ты покинул игру — засчитано поражение'), onlineLeave ('Шығу'/'Выйти'), onlineLeaveConfirm ('Шығасың ба? Бұл жеңіліс болып саналады'/'Выйти? Это будет засчитано как поражение'), onlineConnectionLost ('Байланыс үзілді, қайта қосылуда…'/'Связь потеряна, переподключение…'), onlineMatchLost ('Ойын үзіліп қалды'/'Матч был прерван'), onlineNow ('желіде'/'в сети'). Жеңіс/жеңіліс/тең мәтіндері — қолданыстағы battleWon/battleLost/battleDraw кілттері қайта пайдаланылады.
- Бот хабары (Task 4-те): `M.kk.onlineInvite(name)` → `⚡ ${name} сені онлайн жекпе-жекке шақырды! 90 секунд ішінде қосыл!`; ru → `⚡ ${name} вызывает тебя на онлайн-батл! Зайди в приложение в течение 90 секунд!`.

## Task 7 — Клиент: кіру нүктесі + жасыл нүктелер + тарих белгісі (функция қосылады)

**Файлдар:** `tma/src/screens/BattlesTab.jsx`, `tma/src/i18n.js` (қалғандары).
- Өшірулі батырманы (573-579) белсенді етіп → локал mode='online' + қолданыстағы pickOpponent фазасы (scope чиптері, іздеу, мұғалім 🔒 гейті сол күйінде); кіргенде refreshPresence() → onlineIds-тегі оқушыларға жасыл нүкте (bg-green-500 rounded-full); офлайн да шақырылады.
- settings фазасы өзгеріссіз қайта пайдаланылады; online режимде confirm → useOnline().sendInvite(opponentId, config) (throwBattle емес) → overlay 'waiting' → тапсыру аяқталды (таб unmount енді зиянсыз).
- invite:error кодтарын хабарларға өзгерту: daily_cap → қолданыстағы лимит-хабар, not_eligible → қолданыстағы 403-хабар, busy_target → onlineOpponentBusy, challenger_offline/not_found → onlineInviteExpired.
- Тарих: mode==='online' жолдарға ⚡ + t.onlineLabel белгісі (summarize Task 1-ден mode береді).
- Edge: waiting кезінде қайта шақыру ағынына кіру — overlay≠idle кезде UI жасырылады (сервер де already_pending қайтарады). Онлайн end-экранында реванш — v1-ден тыс (тек Жабу).

## Процесс және тексеру

- Бранч `feature/v4-online-battle`, субагенттермен Task 1→7 (әр қадам жүйені жұмыс күйінде қалдырады: батырма Task 7-ге дейін өшірулі — аралық коммиттер инертті), әр тапсырмаға ревью, финалдық бранч-ревью, merge → main, push, `railway up --service geo-server` (миграция 004 автоматты).
- Локал: `server npm test` (қолданыстағылар + matchEngine матрицасы), `tma npm run build`.
- **Қолмен e2e (dev):** DEV_AUTH=1 сервер 3001 + vite dev (ws:true proxy); екі терезе (қалыпты + инкогнито) екі түрлі approved dev id-мен; жасыл нүкте → шақыру → тост → accept → 3-2-1 → 10-сұрақтық матч (Network-те WS фреймдер); disconnect-дрилл (devtools offline: <20с → жалғасады, >20с → forfeit); таб жабу → қарсылас жеңеді; leave-батырма + confirm; сервер рестарт ортасында → екеуі match:none → 'lost', DB-да жол жоқ; `SELECT mode, status, winner_id... FROM battles` + points тексеру; 3 матчтан кейін 4-ші шақыруға daily_cap.
- Деплойдан кейін: екі телефонмен нақты матч; бот push-тың офлайн қарсыласқа жетуін тексеру.

## Ескертулер (қабылданған шешімдер)

- Раунд-соңы reveal қауіпсіз: екеуі де құлыптағаннан кейін ғана ашылады; нұсқа реті бөлек болғандықтан экраннан көшіру де пайдасыз.
- Forfeit = автоматты жеңіліс (rage-quit-ті тежейді); шақырудан бас тарту айыппұлсыз (офлайн болу жазаланбайды).
- Ұпай жүйесі асинхронды батлмен бірдей + ортақ күндік лимит (3/күн/қарсылас, екі режим қосылып) — ұпай-фермаға тосқауыл.
- Сервер рестарт мид-матч → матч жоғалады, ұпай жазылмайды (қарапайымдылық үшін қабылданған; Railway рестарттары сирек).
- pg pool max 10 — WS қосылымдар pool-ды ұстамайды (тек қысқа сұраныстар), мектеп масштабында жеткілікті.
