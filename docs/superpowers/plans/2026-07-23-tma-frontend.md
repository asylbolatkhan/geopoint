# GeoVictorina TMA Frontend + Deploy Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `tma/` React Mini App (student-facing UI for the Plan-1 backend) plus the small server additions it needs (profile endpoint, static serving), and prepare Railway deployment materials.

**Architecture:** `tma/` is a standalone Vite+React+Tailwind package (same stack/versions as the root web app) importing country data via `@shared` alias. It talks to the Plan-1 API with `Authorization: tma <initData>` (dev fallback `dev <id>`). In production the server serves `tma/dist` statically, so one Railway service = API + bot + Mini App. The root web app remains untouched.

**Tech Stack:** React 18, Vite 5, Tailwind 3 (exact versions from root package.json), Telegram WebApp JS SDK (script tag, no npm dep).

## Global Constraints

- The root web app must keep building (`npm run build` at repo root) — no root files are modified by this plan except `README.md` (docs only).
- The server API contract is FIXED by Plan 1 — the frontend adapts to the actual responses (snake_case where the API uses it: `class_name`, `month_points`, `last_active`; stats continents array is `[{continent, asked, missed, accuracy}]`). Never modify Plan-1 route responses except the NEW `/api/profile` endpoint added here.
- Clients never see correct answers before submitting: QuizPlay gives NO per-question correct/wrong feedback. Solo shows a post-submit review using `correctOptionIndexes` from the submit response; battles show only counts.
- Answers are submitted as an array indexed by each question's **canonical `index` field** (not display order), each element `null` or option index 0–3.
- Every user-visible string lives in `tma/src/i18n.js` with both `kk` and `ru` — no hardcoded UI text in components. Language = `student.lang` once registered; before that, Telegram `language_code` (`ru` → ru, everything else → kk).
- Design language (match the existing web app): bg `slate-900` (#0f172a), cards `slate-800`/`slate-800/50` with `border-slate-700`, accent sky (#38bdf8, `sky-400/500`), success green (`green-500`, #22c55e), danger `red-500`, text `slate-100`/`slate-400`. Rounded corners `rounded-xl`/`rounded-2xl`. Mobile-first, single column, bottom tab bar. Flags via `https://flagcdn.com/w160/<iso>.png` (question display: `w160`; option grid: `w160`; small list icons: `w80`).
- Battle question types offered in the create-battle UI and solo setup: the same 6 types as the web app (`country-capital`, `capital-country`, `country-flag`, `flag-country`, `flag-capital`, `capital-flag`); continents: the 6 keys of `CONTINENTS` plus "all".
- Solo counts UI: 10/15/20/all; battle counts: 10/15/20 (server rejects 'all' for battles). Battle timer fixed 15s/question (from create response `questionSeconds`); solo timer options: none/10/15/20/30 seconds (client-side only).
- After each task: `cd tma && npm run build` must pass (and server tasks: `cd server && npm test` stays 30/30 green + module-load check). Commit after every task with the message given.
- Windows environment; use POSIX Bash tool syntax for commands.

## File Structure (end state)

```
server/src/routes/profile.js        # NEW: GET /api/profile
server/src/index.js                 # + profile mount, + static tma/dist serving + SPA fallback
server/package.json                 # + start:prod script
tma/
├── package.json  vite.config.js  postcss.config.js  tailwind.config.js  index.html
└── src/
    ├── main.jsx  index.css  App.jsx
    ├── api.js  telegram.js  i18n.js
    ├── components/
    │   ├── QuizPlay.jsx   # core play component (used by solo AND battles)
    │   ├── FlagImg.jsx  TabBar.jsx  Loader.jsx  Card.jsx
    └── screens/
        ├── RegisterScreen.jsx  PendingScreen.jsx
        ├── PlayTab.jsx  BattlesTab.jsx  RatingTab.jsx  ProfileTab.jsx  AdminTab.jsx
DEPLOY.md                           # Railway + BotFather guide (Kazakh)
README.md                           # + short section pointing to server/README + DEPLOY
```

---

### Task 1: Server — profile endpoint, static serving, start:prod

**Files:**
- Create: `server/src/routes/profile.js`
- Modify: `server/src/index.js` (mount profile; serve tma/dist; SPA fallback), `server/package.json` (start:prod)

**Interfaces:**
- Consumes: `query` (`../db.js`), `requireApproved`, `monthKey` (`../points.js`).
- Produces: `GET /api/profile` (requireApproved) → `{ monthPoints, totalPoints, battles: { wins, losses, draws }, soloGames, accuracy }` where accuracy = rounded % over completed solo games (0 when none). Static serving: when `tma/dist` exists, all non-`/api` GETs serve the SPA.

- [ ] **Step 1: Create `server/src/routes/profile.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';

export const profileRouter = Router();
profileRouter.use(requireApproved);

profileRouter.get('/', async (req, res, next) => {
  try {
    const sid = req.student.id;
    const [points, battles, solo] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(amount), 0)::int AS total,
                COALESCE(SUM(amount) FILTER (WHERE month_key = $2), 0)::int AS month
         FROM points_events WHERE student_id = $1`,
        [sid, monthKey()]
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE winner_id = $1)::int AS wins,
                COUNT(*) FILTER (WHERE winner_id IS NULL)::int AS draws,
                COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id <> $1)::int AS losses
         FROM battles
         WHERE status = 'completed' AND (challenger_id = $1 OR opponent_id = $1)`,
        [sid]
      ),
      query(
        `SELECT COUNT(*)::int AS games,
                COALESCE(ROUND(AVG(correct_count::numeric / NULLIF(total, 0)) * 100), 0)::int AS accuracy
         FROM solo_games WHERE student_id = $1 AND status = 'completed'`,
        [sid]
      ),
    ]);
    res.json({
      monthPoints: points.rows[0].month,
      totalPoints: points.rows[0].total,
      battles: battles.rows[0],
      soloGames: solo.rows[0].games,
      accuracy: solo.rows[0].accuracy,
    });
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount + static serving in `server/src/index.js`**

Add imports at top:

```js
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { profileRouter } from './routes/profile.js';
```

Mount after the admin router mount:

```js
app.use('/api/profile', profileRouter);
```

After ALL `/api` mounts and BEFORE the error-handling middleware, add:

```js
// Mini App статикасы (production-да tma/dist бар болса)
const tmaDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tma/dist');
if (fs.existsSync(tmaDist)) {
  app.use(express.static(tmaDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(tmaDist, 'index.html')));
}
```

- [ ] **Step 3: Add start:prod to `server/package.json` scripts**

```json
    "start:prod": "node scripts/migrate.js && node src/index.js",
```

- [ ] **Step 4: Verify**

Run: `cd server && node -e "import('./src/routes/profile.js').then(() => console.log('ok'))" && npm test`
Expected: `ok`, 30/30 pass. Boot check: `cd server && node -e "process.env.PORT=3996; import('./src/index.js').then(() => setTimeout(async () => { const r = await fetch('http://localhost:3996/api/health'); console.log(await r.json()); process.exit(0); }, 500))"` → `{ ok: true }` (Windows teardown assertion after output is noise).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): profile endpoint, tma static serving, start:prod"
```

---

### Task 2: TMA scaffold (configs, api, telegram, i18n, boot shell)

**Files:**
- Create: `tma/package.json`, `tma/vite.config.js`, `tma/postcss.config.js`, `tma/tailwind.config.js`, `tma/index.html`, `tma/.env.example`, `tma/src/main.jsx`, `tma/src/index.css`, `tma/src/telegram.js`, `tma/src/api.js`, `tma/src/i18n.js`, `tma/src/App.jsx` (boot shell only), `tma/src/components/Loader.jsx`

**Interfaces:**
- Produces (used by ALL later tasks — exact signatures):
  - `api(path, {method, body}?)` → parsed JSON; throws `ApiError` with `.status` and `.code` (server `error` field).
  - `initTelegram()`, `getAuthHeader()` → `'tma <initData>'` | `'dev <id>'` | `''`, `tgUserLang()` → `'kk'|'ru'`, `haptic(style?)`.
  - `T` from i18n.js: `T[lang].<key>`; helper `useT(lang)` returns the lang table.
  - `<Loader />` full-screen spinner.

- [ ] **Step 1: Create `tma/package.json`**

```json
{
  "name": "geo-tma",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "vite": "^5.1.4"
  }
}
```

Run `cd tma && npm install`.

- [ ] **Step 2: Create `tma/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(root, '../shared') } },
  server: {
    fs: { allow: [path.resolve(root, '..')] },
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

- [ ] **Step 3: Create `tma/postcss.config.js` and `tma/tailwind.config.js`**

`postcss.config.js` — copy the root file's content exactly. `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: Create `tma/index.html`**

```html
<!DOCTYPE html>
<html lang="kk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>ГеоВикторина</title>
    <!-- SRI қасақана жоқ: Telegram бұл скриптті өзі жаңартып отырады, хэш бекітсек
         жаңартуда қосымша сынады. Ресми Mini Apps құжаттамасы осылай қосуды талап етеді. -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `tma/src/index.css`** — same as root `src/index.css` (the three `@tailwind` directives + body styles with `background-color: #0f172a`, user-select rules), plus:

```css
html, body, #root { min-height: 100%; }
```

- [ ] **Step 6: Create `tma/src/telegram.js`**

```js
const tg = window.Telegram?.WebApp ?? null;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#0f172a');
    tg.setBackgroundColor('#0f172a');
  } catch { /* ескі клиенттер қолдамауы мүмкін */ }
}

export function getAuthHeader() {
  if (tg?.initData) return `tma ${tg.initData}`;
  const devId = import.meta.env.VITE_DEV_TG_ID;
  return devId ? `dev ${devId}` : '';
}

export function tgUserLang() {
  return tg?.initDataUnsafe?.user?.language_code === 'ru' ? 'ru' : 'kk';
}

export function haptic(style = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(style); } catch { /* elective */ }
}
```

- [ ] **Step 7: Create `tma/src/api.js`**

```js
import { getAuthHeader } from './telegram';

export class ApiError extends Error {
  constructor(status, code) {
    super(code || `http_${status}`);
    this.status = status;
    this.code = code || null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      authorization: getAuthHeader(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* json емес жауап */ }
  if (!res.ok) throw new ApiError(res.status, json?.error);
  return json;
}
```

- [ ] **Step 8: Create `tma/src/i18n.js`** — full kk/ru tables. Keys (every key present in BOTH langs; kk values shown, implementer writes natural ru equivalents):

```js
export const T = {
  kk: {
    appName: 'ГеоВикторина',
    loading: 'Жүктелуде…',
    errorGeneric: 'Қате шықты. Қайталап көріңіз.',
    retry: 'Қайталау',
    notInTelegram: 'Қосымшаны Telegram ішінен ашыңыз.',
    // Тіркелу
    registerTitle: 'Тіркелу',
    yourName: 'Аты-жөнің',
    namePlaceholder: 'Мысалы: Айдос Серікұлы',
    yourClass: 'Сыныбың',
    language: 'Тіл',
    send: 'Жіберу',
    registerHint: 'Мұғалім растағаннан кейін ойнай аласың',
    // Күту
    pendingTitle: 'Өтінім жіберілді ⏳',
    pendingText: 'Мұғалім растағанша күте тұр. Расталған кезде ботқа хабарлама келеді.',
    checkStatus: 'Тексеру',
    // Табтар
    tabPlay: 'Ойнау', tabBattles: 'Батлдар', tabRating: 'Рейтинг', tabProfile: 'Профиль', tabAdmin: 'Басқару',
    // Ойын баптау
    continent: 'Құрлық',
    continents: { europe: 'Еуропа', asia: 'Азия', northamerica: 'Солт. Америка', southamerica: 'Оңт. Америка', africa: 'Африка', oceania: 'Океания', all: 'Барлығы' },
    questionTypes: 'Сұрақ түрлері',
    typeNames: {
      'country-capital': 'Ел → Астана', 'capital-country': 'Астана → Ел',
      'country-flag': 'Ел → Ту', 'flag-country': 'Ту → Ел',
      'flag-capital': 'Ту → Астана', 'capital-flag': 'Астана → Ту',
    },
    questionCount: 'Сұрақ саны', all: 'Барлығы',
    timer: 'Таймер', noTimer: 'Шексіз', sec: 'сек',
    start: 'Бастау',
    // Ойын
    question: 'Сұрақ', timeUp: 'Уақыт бітті',
    result: 'Нәтиже', correctAnswers: 'Дұрыс жауаптар', earnedPoints: 'Жиналған ұпай',
    dailyCapNote: 'Жаттығудан күніне ең көп 30 ұпай жиналады',
    review: 'Қателерді қарау', playAgain: 'Тағы ойнау', done: 'Дайын',
    yourAnswer: 'Сенің жауабың', rightAnswer: 'Дұрыс жауап', skipped: 'Жауапсыз',
    // Батлдар
    newBattle: 'Батл тастау ⚔️',
    onlineBattle: 'Онлайн батл', comingSoon: 'Жақын арада 🔒',
    chooseOpponent: 'Қарсылас таңда', myClass: 'Менің сыныбым', allSchool: 'Бүкіл мектеп',
    searchName: 'Аты бойынша іздеу…',
    battleSettings: 'Батл параметрлері', throwBattle: 'Тастау',
    battleActive: 'Белсенді', battleHistory: 'Тарих',
    yourTurn: 'Сенің кезегің!', waitingOpponent: 'Қарсыласты күтудеміз',
    battleWon: 'Жеңіс! 🏆', battleLost: 'Жеңіліс 😔', battleDraw: 'Тең ойын 🤝',
    expired: 'Мерзімі өтті', declined: 'Қабылданбады',
    accept: 'Ойнау', declineBtn: 'Қабылдамау',
    declineConfirm: 'Қабылдамасаң −10 ұпай жазылады. Сенімдісің бе?',
    yes: 'Иә', cancel: 'Болдырмау',
    vs: 'қарсы', youLabel: 'Сен',
    dailyLimitError: 'Бұл қарсыласқа бүгін 3 батл тасталды. Ертең қайталап көр.',
    battleClosedError: 'Бұл батл жабылып қойған.',
    hoursLeft: 'сағат қалды',
    // Рейтинг
    scopeClass: 'Сынып', scopeSchool: 'Мектеп', scopeClasses: 'Сыныптар',
    thisMonth: 'Осы ай', allTime: 'Барлық уақыт',
    points: 'ұпай', students: 'оқушы', avgPoints: 'орташа ұпай',
    emptyBoard: 'Әзірге ешкім ұпай жинамаған',
    // Профиль
    monthPoints: 'Осы айдағы ұпай', totalPoints: 'Барлық ұпай',
    wins: 'Жеңіс', losses: 'Жеңіліс', draws: 'Тең',
    soloGames: 'Жаттығулар', accuracy: 'Дәлдік',
    // Админ
    adminPending: 'Өтінімдер', adminStudents: 'Оқушылар', adminClasses: 'Сыныптар', adminStats: 'Статистика',
    approve: 'Қабылдау', reject: 'Қабылдамау', delete: 'Өшіру', save: 'Сақтау',
    noPending: 'Жаңа өтінім жоқ',
    addClass: 'Сынып қосу', className: 'Сынып атауы (мыс. 7Ә)',
    classNotEmpty: 'Бұл сыныпта оқушылар бар — алдымен оларды көшіріңіз',
    pointsJournal: 'Ұпай журналы', deleteEvent: 'Жазбаны өшіру',
    deleteStudentConfirm: 'Оқушыны өшірсеңіз, барлық ұпайы рейтингтен алынады. Өшіру?',
    statContinents: 'Құрлық бойынша қиындық', statMissed: 'Ең көп қателесетін елдер',
    statInactive: 'Соңғы 7 күнде ойнамағандар', games: 'ойын', asked: 'сұралды', missed: 'қате',
    changeClass: 'Сыныбын өзгерту',
    reasonNames: {
      battle_win: 'Батл жеңісі', battle_draw: 'Батл тең', battle_loss: 'Батл жеңілісі',
      battle_correct: 'Батл: дұрыс жауаптар', battle_expired_bonus: 'Батл: жауапсыз (бонус)',
      battle_expired_penalty: 'Батл: жауапсыз (айыппұл)', solo_correct: 'Жаттығу',
    },
  },
  ru: { /* дәл сол кілттер орысша — толық жазылады, TODO қалдырмау */ },
};

export function useT(lang) {
  return T[lang] ?? T.kk;
}
```

The implementer MUST fill the `ru` table completely with natural Russian equivalents of every kk key (no placeholders).

- [ ] **Step 9: Create `tma/src/components/Loader.jsx`**

```jsx
export default function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
```

- [ ] **Step 10: Create boot-shell `tma/src/App.jsx` and `tma/src/main.jsx`**

`main.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTelegram } from './telegram';
import './index.css';

initTelegram();
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`App.jsx` (boot shell for this task; Task 3 replaces the TODO branches):

```jsx
import { useEffect, useState } from 'react';
import { api } from './api';
import { tgUserLang } from './telegram';
import { useT } from './i18n';
import Loader from './components/Loader';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=жүктелуде, null=тіркелмеген
  const [error, setError] = useState(false);
  const lang = me?.lang ?? tgUserLang();
  const t = useT(lang);

  const load = () => {
    setError(false);
    api('/me')
      .then((r) => setMe(r.student))
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-100 p-6">
        <p>{t.errorGeneric}</p>
        <button onClick={load} className="px-6 py-2 rounded-xl bg-sky-500 font-semibold">{t.retry}</button>
      </div>
    );
  }
  if (me === undefined) return <Loader />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      {t.appName} — {me === null ? 'register' : me.status}
    </div>
  );
}
```

- [ ] **Step 11: Create `tma/.env.example`**

```
# Браузерде тексеру үшін (сервер DEV_AUTH=1 болғанда): VITE_DEV_TG_ID=100
VITE_DEV_TG_ID=
```

- [ ] **Step 12: Verify** — `cd tma && npm run build` → succeeds. Root still fine: `npm run build` at repo root → succeeds.

- [ ] **Step 13: Commit**

```bash
git add tma .gitignore
git commit -m "feat(tma): scaffold mini app (vite, tailwind, api client, i18n)"
```

---

### Task 3: Auth flow — Register, Pending, tab shell

**Files:**
- Create: `tma/src/screens/RegisterScreen.jsx`, `tma/src/screens/PendingScreen.jsx`, `tma/src/components/TabBar.jsx`, `tma/src/components/Card.jsx`
- Modify: `tma/src/App.jsx` (full state machine)

**Interfaces:**
- Consumes: `GET /api/me` → `{student|null}` (student: `{id,name,class_id,status,role,lang}`), `GET /api/classes` → `{classes:[{id,name}]}`, `POST /api/register {name, classId, lang}` → `{student}` (400 bad_name/bad_class/bad_lang, 409).
- Produces: `App` renders: no auth header (`getAuthHeader() === ''`) → notInTelegram message; `me === null` → RegisterScreen (`onRegistered(student)` lifts state); `status 'pending'` → PendingScreen (re-checks `/me` on button + every 20s via interval); `status 'approved'` → tab layout. `TabBar` props: `{tabs: [{key, label, icon}], active, onChange}` fixed to bottom, `pb-safe`. `Card` = styled container `bg-slate-800/60 border border-slate-700 rounded-2xl p-4`.

**Behavior spec (implementer writes the JSX following the design language):**
- RegisterScreen: app title header; name input (`bg-slate-800 border-slate-700 rounded-xl px-4 py-3`, maxLength 60); class picker — chip grid of classes from `/api/classes` (selected chip `bg-sky-500 text-white`, else `bg-slate-800 border-slate-700`); lang toggle (Қазақша / Русский chips) defaulting to `tgUserLang()`; submit button disabled until name.trim() and class chosen; on 409 just re-fetch `/me`; on error show `t.errorGeneric` inline. All strings via `useT(langChoice)` — the toggle switches the whole screen's language live.
- PendingScreen: big emoji + `pendingTitle` + `pendingText`, `checkStatus` button; auto-poll `/me` every 20s (clear interval on unmount); when approved → lift state.
- Tab shell in App: tabs Play/Battles/Rating/Profile (+ Admin as FIFTH tab when `me.role === 'admin'`); icons as inline emoji (🎮 ⚔️ 🏆 👤 🛠); content area `pb-20` so TabBar doesn't cover it. Placeholder `<Card>` content for tabs built in later tasks. Admin with `class_id === null` sees Admin tab first/default.

- [ ] **Step 1: Build the three components + App rewrite per spec**
- [ ] **Step 2: Verify** — `cd tma && npm run build` passes.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): registration, pending and tab shell"`

---

### Task 4: QuizPlay + FlagImg components

**Files:**
- Create: `tma/src/components/QuizPlay.jsx`, `tma/src/components/FlagImg.jsx`

**Interfaces:**
- `FlagImg({ iso, size })` — sizes: `'lg'` (question display, `w-40`), `'md'` (option, `w-24`), `'sm'` (list icon, `w-10`); img src `https://flagcdn.com/w160/${iso}.png` (sm: `w80`), `rounded-md shadow`, alt="".
- `QuizPlay({ questions, questionSeconds, lang, onFinish })` — `questions` is the server-rendered array (`{index, type, display:{displayType,value}, options:[4]}` in display order). `questionSeconds` null → no timer. Calls `onFinish(answers, durationMs)` exactly once after the last question: `answers` is an array sized `questions.length` indexed by canonical `q.index`, elements option-index or null; `durationMs` = accumulated answering time.

- [ ] **Step 1: Create `tma/src/components/FlagImg.jsx`** (per interface; follow the web app's FlagImage pattern).

- [ ] **Step 2: Create `tma/src/components/QuizPlay.jsx`** — complete logic:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { haptic } from '../telegram';
import FlagImg from './FlagImg';

export default function QuizPlay({ questions, questionSeconds, lang, onFinish }) {
  const t = useT(lang);
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(questionSeconds ?? null);
  const [picked, setPicked] = useState(null); // осы сұрақта басылған нұсқа
  const answersRef = useRef(Array(questions.length).fill(null));
  const startRef = useRef(Date.now());       // ағымдағы сұрақтың басталуы
  const durationRef = useRef(0);
  const doneRef = useRef(false);

  const q = questions[idx];
  const isFlagOptions = q.type === 'country-flag' || q.type === 'capital-flag';

  const advance = (chosen) => {
    if (picked !== null) return; // қос басудан қорғау
    setPicked(chosen ?? -1);
    answersRef.current[q.index] = chosen;
    durationRef.current += Date.now() - startRef.current;
    setTimeout(() => {
      if (idx + 1 >= questions.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onFinish(answersRef.current, durationRef.current);
        }
      } else {
        setIdx(idx + 1);
        setPicked(null);
        setSecondsLeft(questionSeconds ?? null);
        startRef.current = Date.now();
      }
    }, 250);
  };

  useEffect(() => {
    if (questionSeconds == null || picked !== null) return undefined;
    if (secondsLeft <= 0) { advance(null); return undefined; }
    const id = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(id);
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-slate-400 text-sm">
        <span>{t.question} {idx + 1}/{questions.length}</span>
        {questionSeconds != null && (
          <span className={secondsLeft <= 5 ? 'text-red-400 font-bold' : ''}>⏱ {secondsLeft}</span>
        )}
      </div>
      <div className="flex items-center justify-center min-h-[120px]">
        {q.display.displayType === 'flag'
          ? <FlagImg iso={q.display.value} size="lg" />
          : <p className="text-2xl font-bold text-center text-slate-100">{q.display.value}</p>}
      </div>
      <div className={isFlagOptions ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => { haptic(); advance(i); }}
            disabled={picked !== null}
            className={`rounded-xl border p-3 text-slate-100 font-medium transition-colors ${
              picked === i ? 'bg-sky-500 border-sky-400' : 'bg-slate-800 border-slate-700 active:bg-slate-700'
            }`}
          >
            {isFlagOptions ? <FlagImg iso={opt} size="md" /> : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Note: NO correct/wrong feedback here by design — the client does not know the answer.

- [ ] **Step 2: Verify** — `cd tma && npm run build` passes.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): quiz play and flag components"`

---

### Task 5: PlayTab (solo flow)

**Files:**
- Create: `tma/src/screens/PlayTab.jsx`
- Modify: `tma/src/App.jsx` (render PlayTab in the play tab)

**Interfaces:**
- Consumes: `POST /api/solo/start {continents, questionTypes, count}` → `{gameId, total, questions}`; `POST /api/solo/:id/submit {answers, durationMs}` → `{correct, total, points, correctOptionIndexes}`; `QuizPlay`.
- Produces: self-contained tab component `PlayTab({ lang })`.

**Behavior spec:**
- Local phases: `setup` → `playing` → `result`.
- Setup: continent chip grid (single select incl. `all`); question-type chips (multi-select, at least one; default all 6); count chips 10/15/20/`all`; timer chips (`noTimer`/10/15/20/30); Start button → POST start (spinner state, on error `errorGeneric` + retry).
- Playing: render `QuizPlay` with server questions and chosen timer (null when no timer); on finish → POST submit; guard double-submit.
- Result: big `correct/total`; `+points ұпай` (accent green); when `points < correct` show `dailyCapNote` hint (`text-slate-400 text-sm`); buttons: `review` (toggles list), `playAgain` (→ setup). Review list: for each question (display order), show question display value (flag `sm` or text), the student's answer vs correct answer using `correctOptionIndexes` — correct rows green border, wrong red, unanswered `skipped`; option label lookup from the question's own `options` array.
- All strings from i18n.

- [ ] **Step 1: Implement per spec** (`useState` phases; keep component under ~200 lines; extract small subcomponents inside the file if needed).
- [ ] **Step 2: Verify** — `cd tma && npm run build`.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): solo play tab"`

---

### Task 6: BattlesTab

**Files:**
- Create: `tma/src/screens/BattlesTab.jsx`
- Modify: `tma/src/App.jsx` (render in battles tab)

**Interfaces:**
- Consumes: `GET /api/battles` → `{battles:[{id, role, other:{name,class_name}, status, mySubmitted, myCorrect, theirCorrect, winner, total, createdAt, expiresAt}]}`; `GET /api/battles/:id` → `{battle}` or `{battle, total, questionSeconds, questions}`; `POST /api/battles {opponentId, config}` → `{battle, total, questionSeconds, questions}` (429 daily_limit); `POST /api/battles/:id/submit {answers, durationMs}` → `{correct, total, status, winner?}` (409 battle_closed/already_submitted); `POST /api/battles/:id/decline`; `GET /api/students?classId=&q=` → `{students:[{id,name,class_name}]}`; `GET /api/classes`; `QuizPlay`.
- Produces: `BattlesTab({ lang, me })`.

**Behavior spec:**
- Local phases: `list` → `pickOpponent` → `settings` → `playing` → `finished`; plus opening an existing battle from the list (→ `playing` if questions returned, else detail card).
- List: "Батл тастау ⚔️" primary button (full-width `bg-sky-500 rounded-xl py-3 font-bold`); directly under it the disabled "Онлайн батл" button (`bg-slate-800 text-slate-500` + `comingSoon` badge, not clickable); then two sections: `battleActive` (status `awaiting_opponent`) and `battleHistory` (everything else, max 20 shown). Each row (Card): `⚔️ {other.name} · {other.class_name}`, status line — for active: my role + whether it's my turn (`!mySubmitted` → `yourTurn` accent-sky; else `waitingOpponent` + hours left = ceil((expiresAt − now)/3600000) + `hoursLeft`); for history: result badge (`battleWon` green / `battleLost` red / `battleDraw` slate / `expired`/`declined` slate-500) + score `myCorrect:theirCorrect` when completed. Tapping an active battle where `!mySubmitted` → GET /:id → playing; if opponent & !mySubmitted also offer `declineBtn` (small red-outline button in the row) with `declineConfirm` confirm (t.yes/t.cancel) → POST decline → refresh list.
- pickOpponent: toggle chips `myClass`/`allSchool` (myClass passes `classId=me.class_id`), search input (`q`, debounced 300ms), student rows → tap selects → `settings`.
- settings: continent single-select, types multi, count 10/15/20 (no 'all'), note that timer is fixed 15s (`t.timer`: `15 {t.sec}`); `throwBattle` button → POST; on 429 show `dailyLimitError`; success → `playing` with returned questions.
- playing: `QuizPlay` with `questionSeconds` from response; onFinish → POST submit; on 409 show `battleClosedError` + back to list; success → `finished`.
- finished: if `status === 'awaiting_opponent'` → `waitingOpponent` card with my score `correct/total`; if completed → result banner by `winner` (`me`→battleWon, `them`→battleLost, `draw`→battleDraw) + score; `done` button → refresh list.
- Refresh list on every return to `list` phase.

- [ ] **Step 1: Implement per spec** (this is the largest screen — extract row/section subcomponents in-file; keep total under ~300 lines).
- [ ] **Step 2: Verify** — `cd tma && npm run build`.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): battles tab with async battle flow"`

---

### Task 7: RatingTab + ProfileTab

**Files:**
- Create: `tma/src/screens/RatingTab.jsx`, `tma/src/screens/ProfileTab.jsx`
- Modify: `tma/src/App.jsx` (render both)

**Interfaces:**
- Consumes: `GET /api/leaderboard?scope=&month=` → `{rows}` (students: `{id,name,class_name,points,rank}`; classes: `{id,name,students,avgPoints,rank}`); `GET /api/leaderboard/months` → `{months}`; `GET /api/profile` → `{monthPoints,totalPoints,battles:{wins,losses,draws},soloGames,accuracy}`.
- Produces: `RatingTab({ lang, me })`, `ProfileTab({ lang, me })`.

**Behavior spec:**
- RatingTab: scope segmented control (`scopeClass`/`scopeSchool`/`scopeClasses`); period selector: `thisMonth` (default, omits month param), `allTime` (`month=all`), plus archive months from `/months` (excluding current) shown in a horizontal scroll chip row as `YYYY-MM`. Rows: rank medal 🥇🥈🥉 for 1–3 else number; name + class_name (students) or name + `{students} {t.students}` (classes); right-aligned points / `avgPoints`. Highlight the caller's own row (`me.id`) with `border-sky-500`. Empty state `emptyBoard`. Refetch on scope/period change; simple in-component cache not required.
- ProfileTab: header with `me.name` + class name (from me — NOTE: `/api/me` student has `class_id` but not class name; show name only) ; stat grid Cards: monthPoints (accent-sky big), totalPoints, wins/losses/draws row, soloGames, accuracy `%`. Fetch `/api/profile` on mount with loader/error-retry.

- [ ] **Step 1: Implement both per spec.**
- [ ] **Step 2: Verify** — `cd tma && npm run build`.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): rating and profile tabs"`

---

### Task 8: AdminTab

**Files:**
- Create: `tma/src/screens/AdminTab.jsx`
- Modify: `tma/src/App.jsx` (render for role admin)

**Interfaces:**
- Consumes (all under `/api/admin`): `GET /pending`, `POST /students/:id/approve {classId?}`, `POST /students/:id/reject`, `GET /students` (rows include `month_points`), `PATCH /students/:id {classId}`, `DELETE /students/:id`, `GET /students/:id/points` → `{events:[{id,amount,reason,ref_id,month_key,created_at}]}`, `DELETE /points/:eventId`, `GET /classes` (with `students` counts), `POST /classes {name}`, `DELETE /classes/:id` (409 not_empty), `GET /stats` → `{students:[{id,name,class_name,games,accuracy,month_points,last_active}], continents:[{continent,asked,missed,accuracy}], missed:[{countryId,misses}], inactive7d:[{id,name,class_name}]}`.
- Also `COUNTRY_BY_ID` from `@shared/data/index.js` to render missed-country names in the teacher's lang.
- Produces: `AdminTab({ lang })`.

**Behavior spec:**
- Section switcher (segmented control): `adminPending` (badge with count) / `adminStudents` / `adminClasses` / `adminStats`.
- Pending: rows name + chosen class + created date; class re-pick dropdown (select of classes) inline; `approve` (green) / `reject` (red-outline). Empty → `noPending`.
- Students: rows name · class · `month_points t.points`; tap row expands: `changeClass` (class select + `save` → PATCH), `pointsJournal` (loads `/students/:id/points` — rows `reasonNames[reason]`, amount signed and colored, date; each row has ✕ → confirm → DELETE /points/:eventId → reload), `delete` (confirm `deleteStudentConfirm` → DELETE student → reload).
- Classes: list name + `{students} {t.students}`; ✕ deletes (409 → `classNotEmpty` toast/inline); add form (input + `addClass` button → POST).
- Stats: three Cards — continents table (`t.continents[continent]`, accuracy% with red<60/yellow<80/green coloring, `asked`); missed top list (flag `sm` + country name in teacher lang via COUNTRY_BY_ID + count); inactive7d name list. Students overview table on top: name, games, accuracy, month_points (compact text-sm).
- Every mutating action optimistically disables its button while in flight; errors show `errorGeneric` inline.

- [ ] **Step 1: Implement per spec** (largest data screen; in-file subcomponents; ~300 lines budget).
- [ ] **Step 2: Verify** — `cd tma && npm run build`.
- [ ] **Step 3: Commit** — `git add tma && git commit -m "feat(tma): admin tab"`

---

### Task 9: Deploy guide + docs + final verification

**Files:**
- Create: `DEPLOY.md` (Kazakh, for the teacher)
- Modify: `README.md` (root — append short project-structure section), `server/README.md` (add production section)

**Interfaces:** none (docs) — but DEPLOY.md must use the REAL values from this repo: build command `npm ci --prefix tma && npm run build --prefix tma && npm ci --prefix server`, start command `npm run start:prod --prefix server`, env vars `DATABASE_URL, BOT_TOKEN, ADMIN_TG_ID, WEBAPP_URL, SCHOOL_NAME, SEED_CLASSES, NODE_ENV=production` (DEV_AUTH left unset), seed command `npm run seed --prefix server` (one-off).

- [ ] **Step 1: Write `DEPLOY.md`** in Kazakh with these sections (concrete, step-by-step, teacher-friendly):
  1. **BotFather:** /newbot → атау мен username таңдау → токенді сақтау. Ботты кейін баптау: Bot Settings → Configure Mini App / Menu Button → деплойдан кейінгі URL.
  2. **Railway — жаңа сервис:** сол geopoint GitHub репозиторийінен жаңа сервис жасау; Settings → Build Command / Start Command (дәл жоғарыдағы мәндер); PostgreSQL плагинін қосу; Variables: тізімі + әрқайсысының түсіндірмесі (ADMIN_TG_ID — өз Telegram ID-ін @userinfobot арқылы білу).
  3. **Алғашқы іске қосу:** deploy logs-та `migrations up to date` көру; бір реттік seed (Railway shell немесе локал: `DATABASE_URL=... npm run seed --prefix server` + SEED_CLASSES); WEBAPP_URL-ды сервис доменіне қою, redeploy.
  4. **Тексеру:** ботты ашу → админ ретінде кіру → сынып қосу → тест-оқушы тіркеу (екінші аккаунт/әріптес) → растау → жаттығу → батл → рейтинг.
  5. **Ақаулар:** бот үнсіз (BOT_TOKEN тексеру), 401 (Telegram ішінен ашпау), DB қате (DATABASE_URL).
- [ ] **Step 2: Append to root `README.md`** a short «Құрылым» section: web (түбір) / tma / server / shared + сілтемелер server/README.md, DEPLOY.md. Create README.md if absent.
- [ ] **Step 3: server/README.md** — add "Production (Railway)" section referencing DEPLOY.md and start:prod.
- [ ] **Step 4: Final verification** — `cd tma && npm run build` && root `npm run build` && `cd server && npm test` all green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs: deployment guide and project structure"`

---

## Self-Review Notes (applied)

- Spec coverage vs design doc: registration/pending (T3), solo with review + cap note (T5), async battles incl. decline w/ penalty warning + «Онлайн батл 🔒» disabled button (T6), ratings class/school/classes + month archive (T7), profile (T1+T7), admin approve/roster/journal/stats incl. continents+missed+inactive (T8), deploy+BotFather (T9).
- API field-name fidelity checked against Plan-1 ACTUAL responses (snake_case class_name/month_points/last_active; continents asked/missed/accuracy) — recorded in Global Constraints.
- QuizPlay never shows correctness mid-game (constraint from spec); solo review uses post-submit correctOptionIndexes only.
- Deferred (recorded): real-time online battle; play-window server enforcement for battles (durationMs clamped server-side in Plan 1; full enforcement needs started_at tracking — future work).
