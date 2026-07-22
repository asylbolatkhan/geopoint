# GeoVictorina TMA Backend Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared country data, then build the complete backend (Express API + PostgreSQL + grammY Telegram bot) for the GeoVictorina Telegram Mini App per the approved spec at `docs/superpowers/specs/2026-07-22-telegram-mini-app-design.md`.

**Architecture:** Monorepo folders: existing web app stays at repo root (only its data imports become re-export shims pointing to new `shared/`); new `server/` is a standalone npm package (ESM) with pure-logic modules (quiz generation, battle resolution, points) fully unit-tested with vitest, thin Express routes over `pg`, and a grammY bot (long polling) for notifications. Plan 2 (separate document, written later) covers the `tma/` React frontend and Railway deployment.

**Tech Stack:** Node.js ≥ 20 (ESM, no TypeScript), Express 4, pg 8, grammY, dotenv, vitest.

## Global Constraints

- The existing web app must keep working: `npm run build` at repo root must pass after every task that touches root files. Its UI/behavior must not change.
- All point values and battle rules live ONLY in `server/src/config.js` (spec: teacher can tweak them in one place). Never hardcode point amounts elsewhere.
- Point values (from spec): battle win +20, draw +10 each, loss +4, each correct battle answer +1 (both sides), expired/declined battle: submitted side +10 / idle side −10, solo correct answer +1 with daily cap 30. Battle expiry 48h, max 3 battles per day per (challenger, opponent) pair, battle question counts 10/15/20, battle per-question timer 15s.
- Correct answers must never be sent to the client before submission. Clients receive rendered questions (display + option labels) and submit option indexes; the server recomputes correctness.
- All user-facing bot message strings exist in both `kk` and `ru` (in `server/src/messages.js`), chosen by the student's `lang`.
- Timezone for month keys and daily caps: `Asia/Almaty`.
- Server package uses `"type": "module"`; imports of `shared/` use relative paths (`../../shared/...`).
- Commit after every task with the message given in the task.

## File Structure (end state of this plan)

```
shared/
├── shuffle.js                  # moved from src/utils/shuffle.js
├── quizEngine.js               # moved from src/utils/quizEngine.js
└── data/
    ├── europe.js ... oceania.js   # moved from src/data/
    └── index.js                # NEW: CONTINENTS map, getCountries(), COUNTRY_BY_ID
src/data/*.js, src/utils/{shuffle,quizEngine}.js   # become one-line re-export shims
server/
├── package.json
├── .env.example
├── migrations/001_init.sql
├── scripts/{migrate.js, seed.js, smoke.js}
├── src/
│   ├── index.js                # entry: express + bot + expiry sweeper
│   ├── config.js               # POINTS, BATTLE constants
│   ├── db.js                   # pg pool, query(), withTransaction()
│   ├── random.js               # mulberry32, seededShuffle
│   ├── quiz.js                 # generateQuestions, renderForPlayer, correctIndexes, scoreAnswers, parseGameConfig
│   ├── battleLogic.js          # resolveBattle, completedPointsEvents, unansweredPointsEvents
│   ├── points.js               # monthKey, awardPoints
│   ├── telegramAuth.js         # validateInitData
│   ├── authMiddleware.js       # auth, requireApproved, requireAdmin
│   ├── messages.js             # kk/ru bot message templates
│   ├── bot.js                  # grammY bot, notify(), notifyAdmins(), startBot()
│   └── routes/
│       ├── auth.js             # /me /register /classes /students
│       ├── solo.js             # /solo/start /solo/:id/submit
│       ├── battles.js          # create/list/get/submit/decline + expireDueBattles
│       ├── leaderboard.js      # /leaderboard /leaderboard/months
│       └── admin.js            # pending/students/points/stats/classes
└── tests/
    ├── random.test.js
    ├── quiz.test.js
    ├── battleLogic.test.js
    ├── points.test.js
    └── telegramAuth.test.js
```

---

### Task 1: Extract `shared/` and shim the web app

**Files:**
- Create: `shared/data/` (moved files), `shared/data/index.js`, `shared/shuffle.js`, `shared/quizEngine.js`
- Modify: `src/data/europe.js`, `src/data/asia.js`, `src/data/northamerica.js`, `src/data/southamerica.js`, `src/data/africa.js`, `src/data/oceania.js`, `src/utils/shuffle.js`, `src/utils/quizEngine.js` (all become shims)
- Note: `src/data/translations.js` stays in `src/data/` (web-only UI strings — do NOT move).

**Interfaces:**
- Produces: `shared/data/index.js` exports `CONTINENTS` (object: `{europe, asia, northamerica, southamerica, africa, oceania}` → arrays of `{id, name:{kk,ru}, capital:{kk,ru}}`), `getCountries(continents)` (`'all'` or array of keys → deduped country array), `COUNTRY_BY_ID` (Map id→country). `shared/shuffle.js` exports `shuffle(array)`. `shared/quizEngine.js` exports `generateQuiz(config, allCountries, language)` (unchanged behavior).

- [ ] **Step 1: Move files with git mv**

```bash
mkdir -p shared/data
git mv src/data/europe.js src/data/asia.js src/data/northamerica.js src/data/southamerica.js src/data/africa.js src/data/oceania.js shared/data/
git mv src/utils/shuffle.js shared/shuffle.js
git mv src/utils/quizEngine.js shared/quizEngine.js
```

- [ ] **Step 2: Fix internal import in `shared/quizEngine.js`**

Change its first line `import { shuffle } from './shuffle';` to:

```js
import { shuffle } from './shuffle.js';
```

(Explicit `.js` extension so plain Node — the server — can import it too. Vite accepts it fine.)

- [ ] **Step 3: Create web shims (exact original export names)**

`src/data/europe.js`:
```js
export { countries } from '../../shared/data/europe.js';
```
`src/data/asia.js`:
```js
export { asianCountries } from '../../shared/data/asia.js';
```
`src/data/northamerica.js`:
```js
export { northAmericanCountries } from '../../shared/data/northamerica.js';
```
`src/data/southamerica.js`:
```js
export { southAmericanCountries } from '../../shared/data/southamerica.js';
```
`src/data/africa.js`:
```js
export { africanCountries } from '../../shared/data/africa.js';
```
`src/data/oceania.js`:
```js
export { oceaniaCountries } from '../../shared/data/oceania.js';
```
`src/utils/shuffle.js`:
```js
export { shuffle } from '../../shared/shuffle.js';
```
`src/utils/quizEngine.js`:
```js
export { generateQuiz } from '../../shared/quizEngine.js';
```

**Important:** before writing each shim, open the moved file in `shared/data/` and confirm the exported const name matches the shim (e.g. `europe.js` exports `countries`, `asia.js` exports `asianCountries`). If a name differs, use the actual name.

- [ ] **Step 4: Create `shared/data/index.js`**

```js
import { countries as europe } from './europe.js';
import { asianCountries as asia } from './asia.js';
import { northAmericanCountries as northamerica } from './northamerica.js';
import { southAmericanCountries as southamerica } from './southamerica.js';
import { africanCountries as africa } from './africa.js';
import { oceaniaCountries as oceania } from './oceania.js';

export const CONTINENTS = { europe, asia, northamerica, southamerica, africa, oceania };

// continents: 'all' | array of CONTINENTS keys. Deduped by id (transcontinental countries).
export function getCountries(continents) {
  const keys = continents === 'all' ? Object.keys(CONTINENTS) : continents;
  const seen = new Set();
  return keys
    .flatMap((k) => CONTINENTS[k])
    .filter((c) => !seen.has(c.id) && seen.add(c.id));
}

export const COUNTRY_BY_ID = new Map(getCountries('all').map((c) => [c.id, c]));
```

- [ ] **Step 5: Verify the web app still builds**

Run: `npm run build` (repo root)
Expected: build succeeds with no unresolved-import errors.

- [ ] **Step 6: Quick runtime check**

Run: `node -e "import('./shared/data/index.js').then(m => console.log(m.getCountries('all').length, m.COUNTRY_BY_ID.get('kz').name.kk))"`
Expected: prints a number ≥ 190 and `Қазақстан`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract country data and quiz engine into shared/"
```

---

### Task 2: Server scaffold + seeded random

**Files:**
- Create: `server/package.json`, `server/src/config.js`, `server/src/random.js`, `server/.env.example`
- Modify: `.gitignore` (repo root)
- Test: `server/tests/random.test.js`

**Interfaces:**
- Produces: `config.js` exports `POINTS` and `BATTLE` (shapes below). `random.js` exports `mulberry32(seed)` (→ function returning floats in [0,1)) and `seededShuffle(array, seed)` (→ new shuffled array, deterministic per seed).

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "geo-server",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "migrate": "node scripts/migrate.js",
    "seed": "node scripts/seed.js",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "grammy": "^1.30.0",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

Run: `cd server && npm install`

- [ ] **Step 2: Ensure `.gitignore` covers server**

Check repo-root `.gitignore`; ensure these lines exist (append missing ones):

```
node_modules
dist
.env
```

- [ ] **Step 3: Create `server/src/config.js`**

```js
// Барлық ұпай ережелері осы жерде — өзгерту үшін тек осы файлды түзетіңіз.
export const POINTS = {
  battleWin: 20,
  battleDraw: 10,
  battleLoss: 4,
  battleCorrect: 1,          // батлдағы әр дұрыс жауап (екі жаққа да)
  battleExpiredBonus: 10,    // жауапсыз/қабылданбаған батл: ойнаған жаққа
  battleExpiredPenalty: -10, // жауапсыз/қабылданбаған батл: елемеген жаққа
  soloCorrect: 1,
  soloDailyCap: 30,          // жаттығудан күніне ең көп осынша ұпай
};

export const BATTLE = {
  expiryHours: 48,
  dailyPerOpponent: 3,
  questionSeconds: 15,
  counts: [10, 15, 20],
};

export const TIMEZONE = 'Asia/Almaty';
```

- [ ] **Step 4: Write failing tests `server/tests/random.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { seededShuffle } from '../src/random.js';

describe('seededShuffle', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(arr, 42)).toEqual(seededShuffle(arr, 42));
  });

  it('returns a permutation without mutating the input', () => {
    const copy = [...arr];
    const out = seededShuffle(arr, 7);
    expect(arr).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it('differs between seeds (for this input)', () => {
    expect(seededShuffle(arr, 1)).not.toEqual(seededShuffle(arr, 2));
  });
});
```

- [ ] **Step 5: Run tests, expect failure**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/random.js`.

- [ ] **Step 6: Create `server/src/random.js`**

```js
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(array, seed) {
  const rand = mulberry32(seed);
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

- [ ] **Step 7: Run tests, expect pass**

Run: `cd server && npm test` — Expected: 3 passed.

- [ ] **Step 8: Create `server/.env.example`**

```
DATABASE_URL=postgresql://user:pass@host:5432/geovictorina
BOT_TOKEN=
ADMIN_TG_ID=
WEBAPP_URL=https://example.up.railway.app
SCHOOL_NAME=Менің мектебім
SEED_CLASSES=
PORT=3001
DEV_AUTH=0
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): scaffold with config and seeded shuffle"
```

---

### Task 3: Quiz generation and scoring (server-side, language-neutral)

**Files:**
- Create: `server/src/quiz.js`
- Test: `server/tests/quiz.test.js`

**Interfaces:**
- Consumes: `shared/data/index.js` (`getCountries`, `COUNTRY_BY_ID`, `CONTINENTS`), `shared/shuffle.js`, `server/src/random.js` (`seededShuffle`), `server/src/config.js` (`BATTLE`).
- Produces:
  - `QUESTION_TYPES`: array of the 6 type ids.
  - `generateQuestions({continents, questionTypes, count})` → canonical array `[{countryId, type, wrongIds: [id,id,id]}]` (correct answer NOT marked in any rendered output).
  - `renderForPlayer(questions, lang, seed)` → array (in per-player shuffled ORDER) of `{index, type, display: {displayType:'flag'|'text', value}, options: [label×4]}` where `index` is the canonical position and option labels are localized strings, or ISO codes when the answer is a flag.
  - `correctIndexes(questions, seed)` → array (canonical order) of the correct option index per question, matching `renderForPlayer` option order for the same seed.
  - `scoreAnswers(questions, answers, seed)` → `{correct, detail: [bool×n], correctOptionIndexes}` where `answers` is canonical-order array of chosen option index or null.
  - `parseGameConfig(body, {allowAll=false})` → validated `{continents, questionTypes, count}` or `null`.

- [ ] **Step 1: Write failing tests `server/tests/quiz.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  QUESTION_TYPES, generateQuestions, renderForPlayer,
  correctIndexes, scoreAnswers, parseGameConfig,
} from '../src/quiz.js';
import { COUNTRY_BY_ID } from '../../shared/data/index.js';

const CONFIG = { continents: ['europe'], questionTypes: [...QUESTION_TYPES], count: 15 };

describe('generateQuestions', () => {
  const qs = generateQuestions(CONFIG);

  it('produces the requested count with valid shape', () => {
    expect(qs).toHaveLength(15);
    for (const q of qs) {
      expect(COUNTRY_BY_ID.has(q.countryId)).toBe(true);
      expect(QUESTION_TYPES).toContain(q.type);
      expect(q.wrongIds).toHaveLength(3);
      expect(q.wrongIds).not.toContain(q.countryId);
    }
  });

  it('never repeats a country within one quiz', () => {
    const ids = qs.map((q) => q.countryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('option labels are unique in BOTH languages', () => {
    for (const q of qs) {
      const canonical = { ...q };
      for (const lang of ['kk', 'ru']) {
        const [rendered] = renderForPlayer([canonical], lang, 1);
        expect(new Set(rendered.options).size).toBe(4);
      }
    }
  });
});

describe('renderForPlayer / correctIndexes', () => {
  const qs = generateQuestions(CONFIG);

  it('is deterministic and consistent between the two functions', () => {
    const rendered = renderForPlayer(qs, 'kk', 99);
    const correct = correctIndexes(qs, 99);
    for (const r of rendered) {
      const q = qs[r.index];
      const country = COUNTRY_BY_ID.get(q.countryId);
      const field = q.type.endsWith('-country') ? 'name'
        : q.type.endsWith('-flag') ? 'flag' : 'capital';
      const expectedLabel = field === 'flag' ? q.countryId : country[field].kk;
      expect(r.options[correct[r.index]]).toBe(expectedLabel);
    }
  });

  it('shuffles question order per player (different seeds)', () => {
    const a = renderForPlayer(qs, 'kk', 2).map((r) => r.index);
    const b = renderForPlayer(qs, 'kk', 3).map((r) => r.index);
    expect(a).not.toEqual(b);
  });

  it('does not leak the correct answer in the payload', () => {
    const rendered = renderForPlayer(qs, 'kk', 5);
    for (const r of rendered) {
      expect(r).not.toHaveProperty('countryId');
      expect(r).not.toHaveProperty('correct');
      expect(r).not.toHaveProperty('wrongIds');
    }
  });
});

describe('scoreAnswers', () => {
  const qs = generateQuestions({ ...CONFIG, count: 10 });

  it('scores all-correct and all-wrong properly', () => {
    const correct = correctIndexes(qs, 4);
    expect(scoreAnswers(qs, correct, 4).correct).toBe(10);
    const wrong = correct.map((c) => (c + 1) % 4);
    expect(scoreAnswers(qs, wrong, 4).correct).toBe(0);
  });

  it('treats null (unanswered) as wrong', () => {
    const answers = correctIndexes(qs, 4);
    answers[0] = null;
    answers[1] = null;
    expect(scoreAnswers(qs, answers, 4).correct).toBe(8);
  });
});

describe('parseGameConfig', () => {
  it('accepts valid config and rejects bad ones', () => {
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 10 })).toBeTruthy();
    expect(parseGameConfig({ continents: 'all', questionTypes: ['flag-country'], count: 20 })).toBeTruthy();
    expect(parseGameConfig({ continents: ['atlantis'], questionTypes: ['flag-country'], count: 10 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['bad-type'], count: 10 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 7 })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 'all' })).toBeNull();
    expect(parseGameConfig({ continents: ['asia'], questionTypes: ['flag-country'], count: 'all' }, { allowAll: true })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `cd server && npm test` — Expected: FAIL, `../src/quiz.js` not found.

- [ ] **Step 3: Create `server/src/quiz.js`**

```js
import { CONTINENTS, COUNTRY_BY_ID, getCountries } from '../../shared/data/index.js';
import { shuffle } from '../../shared/shuffle.js';
import { seededShuffle } from './random.js';
import { BATTLE } from './config.js';

export const QUESTION_TYPES = [
  'flag-country', 'country-flag', 'country-capital',
  'capital-country', 'flag-capital', 'capital-flag',
];

// Жауап қай өрістен алынады: name | capital | flag (flag = ел коды)
const ANSWER_FIELD = {
  'flag-country': 'name', 'capital-country': 'name',
  'country-flag': 'flag', 'capital-flag': 'flag',
  'country-capital': 'capital', 'flag-capital': 'capital',
};

function answerValue(country, field, lang) {
  return field === 'flag' ? country.id : country[field][lang];
}

export function parseGameConfig(body, { allowAll = false } = {}) {
  const { continents, questionTypes, count } = body || {};
  if (continents !== 'all') {
    if (!Array.isArray(continents) || continents.length === 0) return null;
    if (!continents.every((c) => Object.hasOwn(CONTINENTS, c))) return null;
  }
  if (!Array.isArray(questionTypes) || questionTypes.length === 0) return null;
  if (!questionTypes.every((t) => QUESTION_TYPES.includes(t))) return null;
  if (count === 'all') {
    if (!allowAll) return null;
  } else if (!BATTLE.counts.includes(count)) {
    return null;
  }
  return { continents, questionTypes, count };
}

export function generateQuestions({ continents, questionTypes, count }) {
  const all = getCountries(continents);
  const n = count === 'all' ? all.length : Math.min(count, all.length);
  const selected = shuffle(all).slice(0, n);

  return selected.map((country) => {
    const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    const field = ANSWER_FIELD[type];
    // Бұрыс нұсқалар: дұрыс жауаптан және бір-бірінен ЕКІ тілде де өзгеше болуы керек
    const wrong = [];
    for (const c of shuffle(all)) {
      if (wrong.length === 3) break;
      if (c.id === country.id) continue;
      const clashesCorrect = ['kk', 'ru'].some(
        (lang) => answerValue(c, field, lang) === answerValue(country, field, lang)
      );
      const clashesWrong = wrong.some((w) =>
        ['kk', 'ru'].some((lang) => answerValue(w, field, lang) === answerValue(c, field, lang))
      );
      if (!clashesCorrect && !clashesWrong) wrong.push(c);
    }
    return { countryId: country.id, type, wrongIds: wrong.map((c) => c.id) };
  });
}

function optionOrder(q, canonicalIndex, seed) {
  return seededShuffle([q.countryId, ...q.wrongIds], seed + canonicalIndex * 7919);
}

function displayFor(q, lang) {
  const country = COUNTRY_BY_ID.get(q.countryId);
  if (q.type === 'flag-country' || q.type === 'flag-capital') {
    return { displayType: 'flag', value: q.countryId };
  }
  if (q.type === 'country-capital' || q.type === 'country-flag') {
    return { displayType: 'text', value: country.name[lang] };
  }
  return { displayType: 'text', value: country.capital[lang] };
}

export function renderForPlayer(questions, lang, seed) {
  const order = seededShuffle(questions.map((_, i) => i), seed);
  return order.map((canonicalIndex) => {
    const q = questions[canonicalIndex];
    const field = ANSWER_FIELD[q.type];
    const ids = optionOrder(q, canonicalIndex, seed);
    return {
      index: canonicalIndex,
      type: q.type,
      display: displayFor(q, lang),
      options: ids.map((id) =>
        field === 'flag' ? id : COUNTRY_BY_ID.get(id)[field][lang]
      ),
    };
  });
}

export function correctIndexes(questions, seed) {
  return questions.map((q, i) => optionOrder(q, i, seed).indexOf(q.countryId));
}

// answers: canonical-order array of chosen option index | null
export function scoreAnswers(questions, answers, seed) {
  const correctOptionIndexes = correctIndexes(questions, seed);
  let correct = 0;
  const detail = questions.map((q, i) => {
    const ok = answers[i] === correctOptionIndexes[i];
    if (ok) correct++;
    return ok;
  });
  return { correct, detail, correctOptionIndexes };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd server && npm test` — Expected: all tests pass (random + quiz).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): language-neutral quiz generation and server-side scoring"
```

---

### Task 4: Battle resolution and points events

**Files:**
- Create: `server/src/battleLogic.js`
- Test: `server/tests/battleLogic.test.js`

**Interfaces:**
- Consumes: `POINTS` from `config.js`.
- Produces:
  - `resolveBattle(challenger, opponent)` where each is `{correct, durationMs}` → `'challenger' | 'opponent' | 'draw'`.
  - `completedPointsEvents(outcome, challenger, opponent)` → array of `{who: 'challenger'|'opponent', amount, reason}` including base outcome points and `battle_correct` per-answer points.
  - `unansweredPointsEvents(challengerSubmitted, opponentSubmitted)` → same shape; `[]` when both or neither submitted.
  - `declinePointsEvents()` → `[{who:'challenger', +bonus}, {who:'opponent', penalty}]` always.

- [ ] **Step 1: Write failing tests `server/tests/battleLogic.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  resolveBattle, completedPointsEvents, unansweredPointsEvents, declinePointsEvents,
} from '../src/battleLogic.js';
import { POINTS } from '../src/config.js';

const r = (correct, durationMs) => ({ correct, durationMs });
const find = (events, who, reason) =>
  events.find((e) => e.who === who && e.reason === reason);

describe('resolveBattle', () => {
  it('higher correct count wins', () => {
    expect(resolveBattle(r(8, 100), r(6, 50))).toBe('challenger');
    expect(resolveBattle(r(3, 100), r(6, 500))).toBe('opponent');
  });
  it('ties broken by lower duration', () => {
    expect(resolveBattle(r(7, 90_000), r(7, 120_000))).toBe('challenger');
    expect(resolveBattle(r(7, 120_000), r(7, 90_000))).toBe('opponent');
  });
  it('identical score and duration is a draw', () => {
    expect(resolveBattle(r(7, 90_000), r(7, 90_000))).toBe('draw');
  });
});

describe('completedPointsEvents', () => {
  it('win/loss + per-correct points', () => {
    const ev = completedPointsEvents('challenger', r(8, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_win').amount).toBe(POINTS.battleWin);
    expect(find(ev, 'opponent', 'battle_loss').amount).toBe(POINTS.battleLoss);
    expect(find(ev, 'challenger', 'battle_correct').amount).toBe(8 * POINTS.battleCorrect);
    expect(find(ev, 'opponent', 'battle_correct').amount).toBe(5 * POINTS.battleCorrect);
  });
  it('draw gives both draw points', () => {
    const ev = completedPointsEvents('draw', r(5, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_draw').amount).toBe(POINTS.battleDraw);
    expect(find(ev, 'opponent', 'battle_draw').amount).toBe(POINTS.battleDraw);
  });
  it('zero correct answers produce no battle_correct event', () => {
    const ev = completedPointsEvents('opponent', r(0, 1), r(5, 1));
    expect(find(ev, 'challenger', 'battle_correct')).toBeUndefined();
  });
});

describe('unansweredPointsEvents', () => {
  it('rewards the side that played, penalizes the idle side', () => {
    const ev = unansweredPointsEvents(true, false);
    expect(find(ev, 'challenger', 'battle_expired_bonus').amount).toBe(POINTS.battleExpiredBonus);
    expect(find(ev, 'opponent', 'battle_expired_penalty').amount).toBe(POINTS.battleExpiredPenalty);
  });
  it('is symmetric', () => {
    const ev = unansweredPointsEvents(false, true);
    expect(find(ev, 'opponent', 'battle_expired_bonus')).toBeTruthy();
    expect(find(ev, 'challenger', 'battle_expired_penalty')).toBeTruthy();
  });
  it('gives nothing when neither (or both) submitted', () => {
    expect(unansweredPointsEvents(false, false)).toEqual([]);
    expect(unansweredPointsEvents(true, true)).toEqual([]);
  });
});

describe('declinePointsEvents', () => {
  it('always bonus to challenger, penalty to decliner', () => {
    const ev = declinePointsEvents();
    expect(find(ev, 'challenger', 'battle_expired_bonus').amount).toBe(POINTS.battleExpiredBonus);
    expect(find(ev, 'opponent', 'battle_expired_penalty').amount).toBe(POINTS.battleExpiredPenalty);
  });
});
```

- [ ] **Step 2: Run tests, expect failure** — `cd server && npm test`

- [ ] **Step 3: Create `server/src/battleLogic.js`**

```js
import { POINTS } from './config.js';

// challenger/opponent: { correct, durationMs }
export function resolveBattle(challenger, opponent) {
  if (challenger.correct !== opponent.correct) {
    return challenger.correct > opponent.correct ? 'challenger' : 'opponent';
  }
  if (challenger.durationMs !== opponent.durationMs) {
    return challenger.durationMs < opponent.durationMs ? 'challenger' : 'opponent';
  }
  return 'draw';
}

export function completedPointsEvents(outcome, challenger, opponent) {
  const base =
    outcome === 'draw'
      ? [
          { who: 'challenger', amount: POINTS.battleDraw, reason: 'battle_draw' },
          { who: 'opponent', amount: POINTS.battleDraw, reason: 'battle_draw' },
        ]
      : outcome === 'challenger'
        ? [
            { who: 'challenger', amount: POINTS.battleWin, reason: 'battle_win' },
            { who: 'opponent', amount: POINTS.battleLoss, reason: 'battle_loss' },
          ]
        : [
            { who: 'challenger', amount: POINTS.battleLoss, reason: 'battle_loss' },
            { who: 'opponent', amount: POINTS.battleWin, reason: 'battle_win' },
          ];
  const events = [...base];
  if (challenger.correct > 0) {
    events.push({ who: 'challenger', amount: challenger.correct * POINTS.battleCorrect, reason: 'battle_correct' });
  }
  if (opponent.correct > 0) {
    events.push({ who: 'opponent', amount: opponent.correct * POINTS.battleCorrect, reason: 'battle_correct' });
  }
  return events;
}

export function unansweredPointsEvents(challengerSubmitted, opponentSubmitted) {
  if (challengerSubmitted === opponentSubmitted) return [];
  const submitted = challengerSubmitted ? 'challenger' : 'opponent';
  const idle = challengerSubmitted ? 'opponent' : 'challenger';
  return [
    { who: submitted, amount: POINTS.battleExpiredBonus, reason: 'battle_expired_bonus' },
    { who: idle, amount: POINTS.battleExpiredPenalty, reason: 'battle_expired_penalty' },
  ];
}

export function declinePointsEvents() {
  return [
    { who: 'challenger', amount: POINTS.battleExpiredBonus, reason: 'battle_expired_bonus' },
    { who: 'opponent', amount: POINTS.battleExpiredPenalty, reason: 'battle_expired_penalty' },
  ];
}
```

- [ ] **Step 4: Run tests, expect pass** — `cd server && npm test`

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): battle resolution and points event rules"
```

---

### Task 5: Telegram initData validation + month key

**Files:**
- Create: `server/src/telegramAuth.js`, `server/src/points.js` (monthKey only for now — awardPoints added in Task 6)
- Test: `server/tests/telegramAuth.test.js`, `server/tests/points.test.js`

**Interfaces:**
- Produces: `validateInitData(initData, botToken)` → Telegram user object (`{id, first_name, ...}`) or `null`. `monthKey(date?)` → `'YYYY-MM'` in Asia/Almaty.

- [ ] **Step 1: Write failing tests `server/tests/telegramAuth.test.js`**

```js
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateInitData } from '../src/telegramAuth.js';

const BOT_TOKEN = '12345:TEST_TOKEN';

function makeInitData(user, { authDate = Math.floor(Date.now() / 1000), token = BOT_TOKEN } = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAF');
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('validateInitData', () => {
  const user = { id: 777, first_name: 'Aybek' };

  it('accepts a correctly signed payload', () => {
    const result = validateInitData(makeInitData(user), BOT_TOKEN);
    expect(result).toMatchObject({ id: 777, first_name: 'Aybek' });
  });

  it('rejects payload signed with a different token', () => {
    const initData = makeInitData(user, { token: '999:OTHER' });
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects tampered payload', () => {
    const initData = makeInitData(user).replace('Aybek', 'Hacker');
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects stale auth_date (>24h)', () => {
    const initData = makeInitData(user, { authDate: Math.floor(Date.now() / 1000) - 90_000 });
    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(validateInitData('', BOT_TOKEN)).toBeNull();
    expect(validateInitData('hash=abc', BOT_TOKEN)).toBeNull();
  });
});
```

And `server/tests/points.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { monthKey } from '../src/points.js';

describe('monthKey (Asia/Almaty, UTC+5)', () => {
  it('formats as YYYY-MM', () => {
    expect(monthKey(new Date('2026-07-22T10:00:00Z'))).toBe('2026-07');
  });
  it('rolls over at the Almaty month boundary, not UTC', () => {
    // 31 Dec 19:30 UTC = 1 Jan 00:30 Almaty
    expect(monthKey(new Date('2025-12-31T19:30:00Z'))).toBe('2026-01');
    expect(monthKey(new Date('2025-12-31T18:30:00Z'))).toBe('2025-12');
  });
});
```

- [ ] **Step 2: Run tests, expect failure** — `cd server && npm test`

- [ ] **Step 3: Create `server/src/telegramAuth.js`**

```js
import crypto from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create `server/src/points.js` (monthKey part)**

```js
import { TIMEZONE } from './config.js';

export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}`;
}
```

- [ ] **Step 5: Run tests, expect pass** — `cd server && npm test`

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): initData validation and Almaty month keys"
```

---

### Task 6: Database layer, migration, seed

**Files:**
- Create: `server/src/db.js`, `server/migrations/001_init.sql`, `server/scripts/migrate.js`, `server/scripts/seed.js`
- Modify: `server/src/points.js` (add `awardPoints`)

**Interfaces:**
- Produces: `db.js` exports `pool`, `query(text, params)` → `pg` result, `withTransaction(async (client) => ...)` → runs fn with BEGIN/COMMIT/ROLLBACK, `client.query` inside. `points.js` adds `awardPoints(studentId, amount, reason, refId, client?)` → inserts a `points_events` row with current `monthKey()` (uses `client` if given, else pool).

- [ ] **Step 1: Create `server/src/db.js`**

```js
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Create `server/migrations/001_init.sql`**

```sql
CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  tg_user_id BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class_id INT REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  lang TEXT NOT NULL DEFAULT 'kk' CHECK (lang IN ('kk', 'ru')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE battles (
  id SERIAL PRIMARY KEY,
  challenger_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  opponent_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  questions JSONB NOT NULL,
  challenger_result JSONB,
  opponent_result JSONB,
  status TEXT NOT NULL DEFAULT 'awaiting_opponent'
    CHECK (status IN ('awaiting_opponent', 'completed', 'expired', 'declined')),
  winner_id INT REFERENCES students(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX battles_challenger_idx ON battles (challenger_id, created_at);
CREATE INDEX battles_opponent_idx ON battles (opponent_id, created_at);
CREATE INDEX battles_expiry_idx ON battles (status, expires_at);

CREATE TABLE solo_games (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  questions JSONB NOT NULL,
  answers JSONB,
  correct_count INT,
  total INT NOT NULL,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX solo_games_student_idx ON solo_games (student_id, created_at);

CREATE TABLE points_events (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  ref_id INT,
  month_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX points_events_month_idx ON points_events (month_key, student_id);
CREATE INDEX points_events_student_idx ON points_events (student_id, created_at);
```

- [ ] **Step 3: Create `server/scripts/migrate.js`**

```js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rows.length) continue;
    console.log('applying', file);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  console.log('migrations up to date');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Create `server/scripts/seed.js`**

```js
import 'dotenv/config';
import { pool } from '../src/db.js';

async function main() {
  const schoolName = process.env.SCHOOL_NAME || 'Менің мектебім';
  const existing = await pool.query('SELECT id FROM schools LIMIT 1');
  let schoolId;
  if (existing.rows.length) {
    schoolId = existing.rows[0].id;
    console.log('school already exists, id', schoolId);
  } else {
    const { rows } = await pool.query('INSERT INTO schools (name) VALUES ($1) RETURNING id', [schoolName]);
    schoolId = rows[0].id;
    console.log('created school', schoolName, 'id', schoolId);
  }
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
```

- [ ] **Step 5: Add `awardPoints` to `server/src/points.js`**

Append:

```js
import { query } from './db.js';

export async function awardPoints(studentId, amount, reason, refId = null, client = null) {
  const runner = client ?? { query };
  await runner.query(
    `INSERT INTO points_events (student_id, amount, reason, ref_id, month_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [studentId, amount, reason, refId, monthKey()]
  );
}
```

(Add the `import { query } from './db.js';` line at the top of the file with the existing imports.)

- [ ] **Step 6: Verify modules load and tests still pass**

Run: `cd server && node -e "import('./src/points.js').then(() => console.log('ok'))" && npm test`
Expected: `ok`, all tests pass. (No live DB needed — `pg.Pool` connects lazily.)

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): db layer, schema migration, seed script"
```

---

### Task 7: Express app, auth middleware, registration routes

**Files:**
- Create: `server/src/authMiddleware.js`, `server/src/messages.js`, `server/src/bot.js` (stub-safe), `server/src/routes/auth.js`, `server/src/index.js`

**Interfaces:**
- Consumes: `validateInitData`, `query`, config.
- Produces:
  - `authMiddleware.js`: `auth(req,res,next)` (sets `req.tgUser`, `req.student` — student may be null; auto-creates the admin row for `ADMIN_TG_ID`; 401 on bad signature), `requireApproved`, `requireAdmin`.
  - `bot.js`: `bot` (grammY `Bot` or `null` when no token), `notify(tgUserId, text)` (never throws), `notifyAdmins(text)`, `startBot()`. Later tasks import `notify`/`notifyAdmins`.
  - `messages.js`: `M` — `{kk: {...}, ru: {...}}` template functions listed below.
  - HTTP: `GET /api/health` → `{ok:true}` (no auth); `GET /api/me` → `{student}`; `GET /api/classes` → `{classes:[{id,name}]}`; `POST /api/register {name, classId, lang}` → `{student}` (409 if exists, 400 on bad input); `GET /api/students?classId=&q=` → `{students:[{id,name,class_name}]}` (approved only).
  - Client auth header: `Authorization: tma <initData>`; dev bypass `Authorization: dev <tgId>` allowed only when `DEV_AUTH=1` and `NODE_ENV !== 'production'`.

- [ ] **Step 1: Create `server/src/messages.js`**

```js
export const M = {
  kk: {
    start: 'ГеоВикторинаға қош келдің! 🌍 Ойынды ашу үшін төмендегі батырманы бас.',
    open: '🎮 Ашу',
    newPending: (name, className) => `🆕 Жаңа өтінім: ${name} (${className}). Растау үшін қосымшаны аш.`,
    approved: 'Қабылдандың! 🎉 Енді ойнай аласың.',
    rejected: 'Өкінішке қарай, өтінімің қабылданбады. Мұғаліміңе хабарлас.',
    challenged: (name) => `⚔️ ${name} саған батл тастады! Жауап беруге 48 сағат бар.`,
    battleWon: (name, my, their) => `🏆 Сен ${name}-мен батлда жеңдің! ${my}:${their}`,
    battleLost: (name, my, their) => `😔 ${name}-мен батлда жеңілдің. ${my}:${their}. Кек ал!`,
    battleDraw: (name, score) => `🤝 ${name}-мен батл тең аяқталды: ${score}:${score}`,
    battleDeclined: (name) => `❌ ${name} батлыңды қабылдамады. Саған +10 ұпай жазылды.`,
    battleExpired: (name) => `⏰ ${name} батлыңа 48 сағатта жауап бермеді. Саған +10 ұпай жазылды.`,
    battleExpiredIdle: (name) => `⏰ ${name} тастаған батлға жауап бермедің: −10 ұпай.`,
  },
  ru: {
    start: 'Добро пожаловать в ГеоВикторину! 🌍 Нажми кнопку ниже, чтобы открыть игру.',
    open: '🎮 Открыть',
    newPending: (name, className) => `🆕 Новая заявка: ${name} (${className}). Открой приложение, чтобы подтвердить.`,
    approved: 'Тебя приняли! 🎉 Теперь можно играть.',
    rejected: 'К сожалению, заявка отклонена. Обратись к своему учителю.',
    challenged: (name) => `⚔️ ${name} бросил(а) тебе баттл! У тебя 48 часов.`,
    battleWon: (name, my, their) => `🏆 Ты победил(а) в баттле с ${name}! ${my}:${their}`,
    battleLost: (name, my, their) => `😔 Поражение в баттле с ${name}. ${my}:${their}. Возьми реванш!`,
    battleDraw: (name, score) => `🤝 Баттл с ${name} закончился вничью: ${score}:${score}`,
    battleDeclined: (name) => `❌ ${name} отклонил(а) твой баттл. Тебе начислено +10 очков.`,
    battleExpired: (name) => `⏰ ${name} не ответил(а) на баттл за 48 часов. Тебе +10 очков.`,
    battleExpiredIdle: (name) => `⏰ Ты не ответил(а) на баттл от ${name}: −10 очков.`,
  },
};
```

- [ ] **Step 2: Create `server/src/bot.js`**

```js
import { Bot } from 'grammy';
import { query } from './db.js';
import { M } from './messages.js';

export const bot = process.env.BOT_TOKEN ? new Bot(process.env.BOT_TOKEN) : null;

function webAppKeyboard(lang = 'kk') {
  return {
    inline_keyboard: [[{ text: M[lang].open, web_app: { url: process.env.WEBAPP_URL || '' } }]],
  };
}

// Ешқашан лақтырмайды — хабарлама жетпесе де API жауап беруі керек
export async function notify(tgUserId, text, lang = 'kk') {
  if (!bot) return;
  try {
    await bot.api.sendMessage(tgUserId, text, { reply_markup: webAppKeyboard(lang) });
  } catch (e) {
    console.error('notify failed:', tgUserId, e.message);
  }
}

export async function notifyAdmins(textByLang) {
  if (!bot) return;
  try {
    const { rows } = await query(
      "SELECT tg_user_id, lang FROM students WHERE role = 'admin' AND status = 'approved'"
    );
    await Promise.all(rows.map((a) => notify(a.tg_user_id, textByLang(a.lang), a.lang)));
  } catch (e) {
    console.error('notifyAdmins failed:', e.message);
  }
}

export function startBot() {
  if (!bot) {
    console.log('BOT_TOKEN not set — bot disabled');
    return;
  }
  bot.command('start', async (ctx) => {
    const { rows } = await query('SELECT lang FROM students WHERE tg_user_id = $1', [ctx.from.id]);
    const lang = rows[0]?.lang || 'kk';
    await ctx.reply(M[lang].start, { reply_markup: webAppKeyboard(lang) });
  });
  bot.catch((err) => console.error('bot error:', err.message));
  bot.start(); // long polling; returns a promise that resolves on stop — intentionally not awaited
}
```

- [ ] **Step 3: Create `server/src/authMiddleware.js`**

```js
import { validateInitData } from './telegramAuth.js';
import { query } from './db.js';

export async function auth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    let tgUser = null;
    if (header.startsWith('tma ')) {
      tgUser = validateInitData(header.slice(4), process.env.BOT_TOKEN);
    } else if (
      header.startsWith('dev ') &&
      process.env.DEV_AUTH === '1' &&
      process.env.NODE_ENV !== 'production'
    ) {
      tgUser = { id: Number(header.slice(4)), first_name: 'Dev' + header.slice(4) };
    }
    if (!tgUser || !tgUser.id) return res.status(401).json({ error: 'unauthorized' });
    req.tgUser = tgUser;

    let { rows } = await query('SELECT * FROM students WHERE tg_user_id = $1', [tgUser.id]);
    let student = rows[0] || null;
    if (!student && String(tgUser.id) === process.env.ADMIN_TG_ID) {
      ({ rows } = await query(
        `INSERT INTO students (tg_user_id, name, class_id, status, role)
         VALUES ($1, $2, NULL, 'approved', 'admin') RETURNING *`,
        [tgUser.id, tgUser.first_name || 'Admin']
      ));
      student = rows[0];
    }
    req.student = student;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireApproved(req, res, next) {
  if (!req.student || req.student.status !== 'approved') {
    return res.status(403).json({ error: 'not_approved' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.student || req.student.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
```

- [ ] **Step 4: Create `server/src/routes/auth.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { notifyAdmins } from '../bot.js';
import { M } from '../messages.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  res.json({ student: req.student });
});

authRouter.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name FROM classes ORDER BY name');
    res.json({ classes: rows });
  } catch (e) { next(e); }
});

authRouter.post('/register', async (req, res, next) => {
  try {
    if (req.student) return res.status(409).json({ error: 'already_registered' });
    const { name, classId, lang } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
      return res.status(400).json({ error: 'bad_name' });
    }
    if (!['kk', 'ru'].includes(lang)) return res.status(400).json({ error: 'bad_lang' });
    const cls = await query('SELECT id, name FROM classes WHERE id = $1', [classId]);
    if (!cls.rows[0]) return res.status(400).json({ error: 'bad_class' });
    const { rows } = await query(
      'INSERT INTO students (tg_user_id, name, class_id, lang) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.tgUser.id, name.trim(), classId, lang]
    );
    notifyAdmins((adminLang) => M[adminLang].newPending(name.trim(), cls.rows[0].name));
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

authRouter.get('/students', requireApproved, async (req, res, next) => {
  try {
    const classId = req.query.classId ? Number(req.query.classId) : null;
    const q = req.query.q ? String(req.query.q) : null;
    const { rows } = await query(
      `SELECT s.id, s.name, c.name AS class_name
       FROM students s
       JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student' AND s.id <> $1
         AND ($2::int IS NULL OR s.class_id = $2)
         AND ($3::text IS NULL OR s.name ILIKE '%' || $3 || '%')
       ORDER BY c.name, s.name
       LIMIT 200`,
      [req.student.id, classId, q]
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Create `server/src/index.js`**

```js
import 'dotenv/config';
import express from 'express';
import { auth } from './authMiddleware.js';
import { authRouter } from './routes/auth.js';
import { startBot } from './bot.js';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', auth);
app.use('/api', authRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`geo-server listening on :${port}`));
startBot();
```

- [ ] **Step 6: Verify boot without DB/bot**

Run: `cd server && node -e "process.env.PORT=3999; import('./src/index.js').then(() => setTimeout(async () => { const r = await fetch('http://localhost:3999/api/health'); console.log(await r.json()); const u = await fetch('http://localhost:3999/api/me'); console.log(u.status); process.exit(0); }, 500))"`
Expected output: `{ ok: true }` then `401`.

- [ ] **Step 7: Run tests still green** — `cd server && npm test`

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): express app, telegram auth middleware, registration routes"
```

---

### Task 8: Solo game routes with daily cap

**Files:**
- Create: `server/src/routes/solo.js`
- Modify: `server/src/index.js` (mount router)

**Interfaces:**
- Consumes: `parseGameConfig`, `generateQuestions`, `renderForPlayer`, `scoreAnswers` (Task 3), `awardPoints`, `POINTS`, `TIMEZONE`, `requireApproved`.
- Produces HTTP:
  - `POST /api/solo/start` body `{continents, questionTypes, count}` (count may be `'all'`) → `{gameId, total, questions: renderForPlayer(...)}`. Seed = game id.
  - `POST /api/solo/:id/submit` body `{answers: [(int|null)×total in canonical index order], durationMs}` → `{correct, total, points, correctOptionIndexes}`. 404 unknown/foreign game, 409 already completed, 400 bad answers array. Points = correct × soloCorrect, capped so today's `solo_correct` sum (Almaty day) never exceeds `soloDailyCap`.

- [ ] **Step 1: Create `server/src/routes/solo.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { parseGameConfig, generateQuestions, renderForPlayer, scoreAnswers } from '../quiz.js';
import { awardPoints } from '../points.js';
import { POINTS, TIMEZONE } from '../config.js';

export const soloRouter = Router();
soloRouter.use(requireApproved);

soloRouter.post('/start', async (req, res, next) => {
  try {
    const config = parseGameConfig(req.body, { allowAll: true });
    if (!config) return res.status(400).json({ error: 'bad_config' });
    const questions = generateQuestions(config);
    const { rows } = await query(
      `INSERT INTO solo_games (student_id, config, questions, total)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.student.id, config, JSON.stringify(questions), questions.length]
    );
    const gameId = rows[0].id;
    res.json({
      gameId,
      total: questions.length,
      questions: renderForPlayer(questions, req.student.lang, gameId),
    });
  } catch (e) { next(e); }
});

soloRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const gameId = Number(req.params.id);
    const { answers, durationMs } = req.body || {};
    const { rows } = await query(
      'SELECT * FROM solo_games WHERE id = $1 AND student_id = $2',
      [gameId, req.student.id]
    );
    const game = rows[0];
    if (!game) return res.status(404).json({ error: 'not_found' });
    if (game.status === 'completed') return res.status(409).json({ error: 'already_submitted' });
    if (!Array.isArray(answers) || answers.length !== game.total) {
      return res.status(400).json({ error: 'bad_answers' });
    }
    const { correct, correctOptionIndexes } = scoreAnswers(game.questions, answers, gameId);
    await query(
      `UPDATE solo_games SET answers = $1, correct_count = $2, duration_ms = $3, status = 'completed'
       WHERE id = $4`,
      [JSON.stringify(answers), correct, Math.max(0, Number(durationMs) || 0), gameId]
    );
    // Күндік шек (Алматы уақытымен)
    const { rows: capRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM points_events
       WHERE student_id = $1 AND reason = 'solo_correct'
         AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [req.student.id, TIMEZONE]
    );
    const alreadyToday = Number(capRows[0].total);
    const points = Math.max(0, Math.min(correct * POINTS.soloCorrect, POINTS.soloDailyCap - alreadyToday));
    if (points > 0) await awardPoints(req.student.id, points, 'solo_correct', gameId);
    res.json({ correct, total: game.total, points, correctOptionIndexes });
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount in `server/src/index.js`**

Add import and mount after `authRouter`:

```js
import { soloRouter } from './routes/solo.js';
```
```js
app.use('/api/solo', soloRouter);
```

- [ ] **Step 3: Verify module load + tests green**

Run: `cd server && node -e "import('./src/routes/solo.js').then(() => console.log('ok'))" && npm test`
Expected: `ok`, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "feat(server): solo game endpoints with daily points cap"
```

---

### Task 9: Battle routes + expiry sweep

**Files:**
- Create: `server/src/routes/battles.js`
- Modify: `server/src/index.js` (mount router + hourly sweep interval)

**Interfaces:**
- Consumes: quiz functions, `resolveBattle`, `completedPointsEvents`, `unansweredPointsEvents`, `declinePointsEvents`, `awardPoints`, `notify`, `M`, `BATTLE`, `withTransaction`.
- Produces:
  - Seeds: challenger seed = `battle.id * 2`, opponent seed = `battle.id * 2 + 1`.
  - `POST /api/battles` body `{opponentId, config:{continents, questionTypes, count}}` → `{battle:{id, status, expiresAt, opponent:{id,name}}, total, questions}` (rendered for challenger). Errors: 400 bad config/opponent, 429 `daily_limit`.
  - `GET /api/battles` → `{battles:[...]}` mine, newest first, each `{id, role:'challenger'|'opponent', other:{name, class_name}, status, mySubmitted, myCorrect, theirCorrect, winner:'me'|'them'|'draw'|null, createdAt, expiresAt}`. Runs `expireDueBattles()` first.
  - `GET /api/battles/:id` → if caller hasn't submitted and status is `awaiting_opponent`: `{battle, total, questionSeconds, questions}` (rendered for caller); else `{battle}` summary as in list.
  - `POST /api/battles/:id/submit` body `{answers, durationMs}` → `{correct, total, status, winner?}`; completes battle when both submitted (points + both notified). 409 if already submitted / battle not awaiting.
  - `POST /api/battles/:id/decline` → opponent only, before submitting → status `declined`, decline points, challenger notified.
  - `expireDueBattles()` exported for the sweeper.

- [ ] **Step 1: Create `server/src/routes/battles.js`**

```js
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { parseGameConfig, generateQuestions, renderForPlayer, scoreAnswers } from '../quiz.js';
import {
  resolveBattle, completedPointsEvents, unansweredPointsEvents, declinePointsEvents,
} from '../battleLogic.js';
import { awardPoints } from '../points.js';
import { notify } from '../bot.js';
import { M } from '../messages.js';
import { BATTLE, TIMEZONE } from '../config.js';

export const battlesRouter = Router();
battlesRouter.use(requireApproved);

const challengerSeed = (battleId) => battleId * 2;
const opponentSeed = (battleId) => battleId * 2 + 1;

async function applyWhoEvents(client, events, battle) {
  for (const e of events) {
    const studentId = e.who === 'challenger' ? battle.challenger_id : battle.opponent_id;
    await awardPoints(studentId, e.amount, e.reason, battle.id, client);
  }
}

async function studentById(id) {
  const { rows } = await query('SELECT * FROM students WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function expireDueBattles() {
  const { rows } = await query(
    `UPDATE battles SET status = 'expired'
     WHERE status = 'awaiting_opponent' AND expires_at < now()
     RETURNING *`
  );
  for (const b of rows) {
    const events = unansweredPointsEvents(!!b.challenger_result, !!b.opponent_result);
    for (const e of events) {
      const studentId = e.who === 'challenger' ? b.challenger_id : b.opponent_id;
      await awardPoints(studentId, e.amount, e.reason, b.id);
    }
    const challenger = await studentById(b.challenger_id);
    const opponent = await studentById(b.opponent_id);
    if (challenger && opponent && b.challenger_result && !b.opponent_result) {
      notify(challenger.tg_user_id, M[challenger.lang].battleExpired(opponent.name), challenger.lang);
      notify(opponent.tg_user_id, M[opponent.lang].battleExpiredIdle(challenger.name), opponent.lang);
    }
  }
  return rows.length;
}

function summarize(b, myId) {
  const isChallenger = b.challenger_id === myId;
  const my = isChallenger ? b.challenger_result : b.opponent_result;
  const their = isChallenger ? b.opponent_result : b.challenger_result;
  return {
    id: b.id,
    role: isChallenger ? 'challenger' : 'opponent',
    other: { name: b.other_name, class_name: b.other_class },
    status: b.status,
    mySubmitted: !!my,
    myCorrect: my ? my.correct : null,
    theirCorrect: b.status === 'completed' && their ? their.correct : null,
    winner:
      b.status !== 'completed' ? null
        : b.winner_id === null ? 'draw'
        : b.winner_id === myId ? 'me' : 'them',
    total: b.total,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
  };
}

const listSql = `
  SELECT b.*, jsonb_array_length(b.questions) AS total,
         o.name AS other_name, oc.name AS other_class
  FROM battles b
  JOIN students o ON o.id = CASE WHEN b.challenger_id = $1 THEN b.opponent_id ELSE b.challenger_id END
  LEFT JOIN classes oc ON oc.id = o.class_id
  WHERE b.challenger_id = $1 OR b.opponent_id = $1`;

battlesRouter.post('/', async (req, res, next) => {
  try {
    const { opponentId } = req.body || {};
    const config = parseGameConfig(req.body?.config);
    if (!config) return res.status(400).json({ error: 'bad_config' });
    const opponent = await studentById(Number(opponentId));
    if (!opponent || opponent.status !== 'approved' || opponent.role !== 'student' ||
        opponent.id === req.student.id) {
      return res.status(400).json({ error: 'bad_opponent' });
    }
    const { rows: cntRows } = await query(
      `SELECT COUNT(*)::int AS n FROM battles
       WHERE challenger_id = $1 AND opponent_id = $2
         AND (created_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
      [req.student.id, opponent.id, TIMEZONE]
    );
    if (cntRows[0].n >= BATTLE.dailyPerOpponent) {
      return res.status(429).json({ error: 'daily_limit' });
    }
    const questions = generateQuestions(config);
    const { rows } = await query(
      `INSERT INTO battles (challenger_id, opponent_id, config, questions, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING *`,
      [req.student.id, opponent.id, config, JSON.stringify(questions), BATTLE.expiryHours]
    );
    const battle = rows[0];
    notify(opponent.tg_user_id, M[opponent.lang].challenged(req.student.name), opponent.lang);
    res.json({
      battle: {
        id: battle.id, status: battle.status, expiresAt: battle.expires_at,
        opponent: { id: opponent.id, name: opponent.name },
      },
      total: questions.length,
      questionSeconds: BATTLE.questionSeconds,
      questions: renderForPlayer(questions, req.student.lang, challengerSeed(battle.id)),
    });
  } catch (e) { next(e); }
});

battlesRouter.get('/', async (req, res, next) => {
  try {
    await expireDueBattles();
    const { rows } = await query(`${listSql} ORDER BY b.created_at DESC LIMIT 50`, [req.student.id]);
    res.json({ battles: rows.map((b) => summarize(b, req.student.id)) });
  } catch (e) { next(e); }
});

battlesRouter.get('/:id', async (req, res, next) => {
  try {
    await expireDueBattles();
    const { rows } = await query(`${listSql} AND b.id = $2`, [req.student.id, Number(req.params.id)]);
    const b = rows[0];
    if (!b) return res.status(404).json({ error: 'not_found' });
    const isChallenger = b.challenger_id === req.student.id;
    const myResult = isChallenger ? b.challenger_result : b.opponent_result;
    const summary = summarize(b, req.student.id);
    if (b.status === 'awaiting_opponent' && !myResult) {
      const seed = isChallenger ? challengerSeed(b.id) : opponentSeed(b.id);
      return res.json({
        battle: summary,
        total: b.total,
        questionSeconds: BATTLE.questionSeconds,
        questions: renderForPlayer(b.questions, req.student.lang, seed),
      });
    }
    res.json({ battle: summary });
  } catch (e) { next(e); }
});

battlesRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const battleId = Number(req.params.id);
    const { answers, durationMs } = req.body || {};
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]
      );
      const b = rows[0];
      if (!b || (b.challenger_id !== req.student.id && b.opponent_id !== req.student.id)) {
        return { code: 404, body: { error: 'not_found' } };
      }
      if (b.status !== 'awaiting_opponent') return { code: 409, body: { error: 'battle_closed', status: b.status } };
      const isChallenger = b.challenger_id === req.student.id;
      if (isChallenger ? b.challenger_result : b.opponent_result) {
        return { code: 409, body: { error: 'already_submitted' } };
      }
      if (!Array.isArray(answers) || answers.length !== b.questions.length) {
        return { code: 400, body: { error: 'bad_answers' } };
      }
      const seed = isChallenger ? challengerSeed(b.id) : opponentSeed(b.id);
      const { correct } = scoreAnswers(b.questions, answers, seed);
      const myResult = {
        answers, correct,
        durationMs: Math.max(0, Number(durationMs) || 0),
        submittedAt: new Date().toISOString(),
      };
      const col = isChallenger ? 'challenger_result' : 'opponent_result';
      await client.query(`UPDATE battles SET ${col} = $1 WHERE id = $2`, [JSON.stringify(myResult), b.id]);

      const otherResult = isChallenger ? b.opponent_result : b.challenger_result;
      if (!otherResult) {
        return { code: 200, body: { correct, total: b.questions.length, status: 'awaiting_opponent' } };
      }
      const cRes = isChallenger ? myResult : b.challenger_result;
      const oRes = isChallenger ? b.opponent_result : myResult;
      const outcome = resolveBattle(cRes, oRes);
      const winnerId =
        outcome === 'draw' ? null : outcome === 'challenger' ? b.challenger_id : b.opponent_id;
      await client.query(
        `UPDATE battles SET status = 'completed', winner_id = $1 WHERE id = $2`,
        [winnerId, b.id]
      );
      await applyWhoEvents(client, completedPointsEvents(outcome, cRes, oRes), b);
      return {
        code: 200,
        body: { correct, total: b.questions.length, status: 'completed',
                winner: winnerId === null ? 'draw' : winnerId === req.student.id ? 'me' : 'them' },
        completed: { battle: b, cRes, oRes, winnerId },
      };
    });

    if (result.completed) {
      const { battle, cRes, oRes, winnerId } = result.completed;
      const challenger = await studentById(battle.challenger_id);
      const opponent = await studentById(battle.opponent_id);
      const pairs = [
        [challenger, opponent, cRes.correct, oRes.correct],
        [opponent, challenger, oRes.correct, cRes.correct],
      ];
      for (const [me, other, my, their] of pairs) {
        const t = M[me.lang];
        const text =
          winnerId === null ? t.battleDraw(other.name, my)
            : winnerId === me.id ? t.battleWon(other.name, my, their)
            : t.battleLost(other.name, my, their);
        notify(me.tg_user_id, text, me.lang);
      }
    }
    res.status(result.code).json(result.body);
  } catch (e) { next(e); }
});

battlesRouter.post('/:id/decline', async (req, res, next) => {
  try {
    const battleId = Number(req.params.id);
    const outcome = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM battles WHERE id = $1 FOR UPDATE', [battleId]);
      const b = rows[0];
      if (!b || b.opponent_id !== req.student.id) return { code: 404, body: { error: 'not_found' } };
      if (b.status !== 'awaiting_opponent' || b.opponent_result) {
        return { code: 409, body: { error: 'battle_closed', status: b.status } };
      }
      await client.query(`UPDATE battles SET status = 'declined' WHERE id = $1`, [b.id]);
      await applyWhoEvents(client, declinePointsEvents(), b);
      return { code: 200, body: { status: 'declined' }, battle: b };
    });
    if (outcome.battle) {
      const challenger = await studentById(outcome.battle.challenger_id);
      notify(challenger.tg_user_id, M[challenger.lang].battleDeclined(req.student.name), challenger.lang);
    }
    res.status(outcome.code).json(outcome.body);
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount + sweeper in `server/src/index.js`**

Add:

```js
import { battlesRouter, expireDueBattles } from './routes/battles.js';
```
```js
app.use('/api/battles', battlesRouter);
```
And after `app.listen(...)`:

```js
setInterval(() => {
  expireDueBattles().catch((e) => console.error('expiry sweep failed:', e.message));
}, 30 * 60 * 1000);
```

- [ ] **Step 3: Verify module load + tests green**

Run: `cd server && node -e "import('./src/routes/battles.js').then(() => console.log('ok'))" && npm test`
Expected: `ok`, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "feat(server): async battle endpoints with expiry sweep"
```

---

### Task 10: Leaderboard routes

**Files:**
- Create: `server/src/routes/leaderboard.js`
- Modify: `server/src/index.js` (mount)

**Interfaces:**
- Consumes: `query`, `monthKey`, `requireApproved`.
- Produces HTTP:
  - `GET /api/leaderboard?scope=class|school|classes&month=<YYYY-MM|all>` (defaults: `scope=class`, `month=` current `monthKey()`).
    - `scope=class` → students of caller's class; `scope=school` → all students; both return `{rows:[{id, name, class_name, points, rank}]}` (rank 1-based, ties share order by points desc then name).
    - `scope=classes` → `{rows:[{id, name, students, avgPoints, rank}]}` (sum of class points / student count, 2 decimals).
  - `GET /api/leaderboard/months` → `{months:['2026-07', ...]}` distinct, newest first.
  - Admins are excluded from all boards.

- [ ] **Step 1: Create `server/src/routes/leaderboard.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireApproved } from '../authMiddleware.js';
import { monthKey } from '../points.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireApproved);

leaderboardRouter.get('/months', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT DISTINCT month_key FROM points_events ORDER BY month_key DESC'
    );
    res.json({ months: rows.map((r) => r.month_key) });
  } catch (e) { next(e); }
});

leaderboardRouter.get('/', async (req, res, next) => {
  try {
    const scope = ['class', 'school', 'classes'].includes(req.query.scope)
      ? req.query.scope : 'class';
    const month = req.query.month === 'all' ? null : (req.query.month || monthKey());
    if (month !== null && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'bad_month' });
    }

    if (scope === 'classes') {
      const { rows } = await query(
        `SELECT c.id, c.name, COUNT(DISTINCT s.id)::int AS students,
                ROUND(COALESCE(SUM(p.amount), 0)::numeric / GREATEST(COUNT(DISTINCT s.id), 1), 2)::float AS "avgPoints"
         FROM classes c
         JOIN students s ON s.class_id = c.id AND s.status = 'approved' AND s.role = 'student'
         LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
         GROUP BY c.id
         ORDER BY "avgPoints" DESC, c.name`,
        [month]
      );
      return res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
    }

    const classFilter = scope === 'class' ? req.student.class_id : null;
    const { rows } = await query(
      `SELECT s.id, s.name, c.name AS class_name, COALESCE(SUM(p.amount), 0)::int AS points
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN points_events p ON p.student_id = s.id AND ($1::text IS NULL OR p.month_key = $1)
       WHERE s.status = 'approved' AND s.role = 'student'
         AND ($2::int IS NULL OR s.class_id = $2)
       GROUP BY s.id, c.name
       ORDER BY points DESC, s.name
       LIMIT 100`,
      [month, classFilter]
    );
    res.json({ rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount in `server/src/index.js`**

```js
import { leaderboardRouter } from './routes/leaderboard.js';
```
```js
app.use('/api/leaderboard', leaderboardRouter);
```

- [ ] **Step 3: Verify module load + tests green**

Run: `cd server && node -e "import('./src/routes/leaderboard.js').then(() => console.log('ok'))" && npm test`

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "feat(server): class/school/classes leaderboards with month archive"
```

---

### Task 11: Admin routes

**Files:**
- Create: `server/src/routes/admin.js`
- Modify: `server/src/index.js` (mount)

**Interfaces:**
- Consumes: `query`, `requireAdmin`, `notify`, `M`, `monthKey`.
- Produces HTTP (all under `requireAdmin`):
  - `GET /api/admin/pending` → `{students:[{id, name, class_id, class_name, tg_user_id, created_at}]}`
  - `POST /api/admin/students/:id/approve` body `{classId?}` → `{student}`; sets status approved (and class if given); notifies student.
  - `POST /api/admin/students/:id/reject` → `{ok:true}`; deletes the row (student may re-register); notifies.
  - `GET /api/admin/students` → all approved students with class + month points.
  - `PATCH /api/admin/students/:id` body `{classId}` → `{student}`.
  - `DELETE /api/admin/students/:id` → `{ok:true}` (cascade removes games/points).
  - `GET /api/admin/students/:id/points` → `{events:[{id, amount, reason, ref_id, month_key, created_at}]}` newest first, limit 200.
  - `DELETE /api/admin/points/:eventId` → `{ok:true}`.
  - `POST /api/admin/classes` body `{name}` → `{class}`; `GET /api/admin/classes` → classes with student counts; `DELETE /api/admin/classes/:id` → 409 `not_empty` if it has students.
  - `GET /api/admin/stats` → `{students:[{id, name, class_name, games, accuracy, monthPoints, lastActive}], continents:[{continent, games, accuracy}], missed:[{countryId, misses}], inactive7d:[{id, name, class_name}]}`.

- [ ] **Step 1: Create `server/src/routes/admin.js`**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../authMiddleware.js';
import { notify } from '../bot.js';
import { M } from '../messages.js';
import { monthKey } from '../points.js';
import { correctIndexes } from '../quiz.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

async function studentById(id) {
  const { rows } = await query('SELECT * FROM students WHERE id = $1', [id]);
  return rows[0] || null;
}

adminRouter.get('/pending', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.name, s.class_id, c.name AS class_name, s.tg_user_id, s.created_at
       FROM students s LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'pending' ORDER BY s.created_at`
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/students/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const classId = req.body?.classId ? Number(req.body.classId) : null;
    const { rows } = await query(
      `UPDATE students SET status = 'approved', class_id = COALESCE($2, class_id)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, classId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    notify(rows[0].tg_user_id, M[rows[0].lang].approved, rows[0].lang);
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.post('/students/:id/reject', async (req, res, next) => {
  try {
    const student = await studentById(Number(req.params.id));
    if (!student || student.status !== 'pending') return res.status(404).json({ error: 'not_found' });
    await query('DELETE FROM students WHERE id = $1', [student.id]);
    notify(student.tg_user_id, M[student.lang].rejected, student.lang);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/students', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.name, s.class_id, c.name AS class_name, s.lang, s.created_at,
              COALESCE(SUM(p.amount) FILTER (WHERE p.month_key = $1), 0)::int AS month_points
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN points_events p ON p.student_id = s.id
       WHERE s.status = 'approved' AND s.role = 'student'
       GROUP BY s.id, c.name ORDER BY c.name, s.name`,
      [monthKey()]
    );
    res.json({ students: rows });
  } catch (e) { next(e); }
});

adminRouter.patch('/students/:id', async (req, res, next) => {
  try {
    const classId = Number(req.body?.classId);
    const cls = await query('SELECT id FROM classes WHERE id = $1', [classId]);
    if (!cls.rows[0]) return res.status(400).json({ error: 'bad_class' });
    const { rows } = await query(
      `UPDATE students SET class_id = $2 WHERE id = $1 AND role = 'student' RETURNING *`,
      [Number(req.params.id), classId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ student: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.delete('/students/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM students WHERE id = $1 AND role = 'student'`, [Number(req.params.id)]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/students/:id/points', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, amount, reason, ref_id, month_key, created_at
       FROM points_events WHERE student_id = $1
       ORDER BY created_at DESC LIMIT 200`,
      [Number(req.params.id)]
    );
    res.json({ events: rows });
  } catch (e) { next(e); }
});

adminRouter.delete('/points/:eventId', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM points_events WHERE id = $1', [Number(req.params.eventId)]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/classes', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name,
              COUNT(s.id) FILTER (WHERE s.status = 'approved')::int AS students
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id ORDER BY c.name`
    );
    res.json({ classes: rows });
  } catch (e) { next(e); }
});

adminRouter.post('/classes', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 20) return res.status(400).json({ error: 'bad_name' });
    const school = await query('SELECT id FROM schools LIMIT 1');
    if (!school.rows[0]) return res.status(500).json({ error: 'no_school_seeded' });
    const { rows } = await query(
      `INSERT INTO classes (school_id, name) VALUES ($1, $2)
       ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [school.rows[0].id, name]
    );
    res.json({ class: rows[0] });
  } catch (e) { next(e); }
});

adminRouter.delete('/classes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const used = await query('SELECT 1 FROM students WHERE class_id = $1 LIMIT 1', [id]);
    if (used.rows[0]) return res.status(409).json({ error: 'not_empty' });
    const { rowCount } = await query('DELETE FROM classes WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.get('/stats', async (req, res, next) => {
  try {
    const { rows: students } = await query(
      `SELECT s.id, s.name, c.name AS class_name,
              (SELECT COUNT(*) FROM solo_games g WHERE g.student_id = s.id AND g.status = 'completed')::int
            + (SELECT COUNT(*) FROM battles b
               WHERE (b.challenger_id = s.id AND b.challenger_result IS NOT NULL)
                  OR (b.opponent_id = s.id AND b.opponent_result IS NOT NULL))::int AS games,
              COALESCE((SELECT ROUND(AVG(g.correct_count::numeric / NULLIF(g.total, 0)) * 100)
                        FROM solo_games g WHERE g.student_id = s.id AND g.status = 'completed'), 0)::int AS accuracy,
              COALESCE((SELECT SUM(p.amount) FROM points_events p
                        WHERE p.student_id = s.id AND p.month_key = $1), 0)::int AS month_points,
              GREATEST(
                (SELECT MAX(g.created_at) FROM solo_games g WHERE g.student_id = s.id),
                (SELECT MAX(b.created_at) FROM battles b
                 WHERE b.challenger_id = s.id OR b.opponent_id = s.id)
              ) AS last_active
       FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student'
       ORDER BY c.name, s.name`,
      [monthKey()]
    );

    // Ең жиі қателесетін елдер: соңғы аяқталған ойындардың жауаптарын JS-пен санаймыз
    const misses = new Map();
    const tally = (questions, answers, seed) => {
      if (!Array.isArray(answers)) return;
      const correct = correctIndexes(questions, seed);
      questions.forEach((q, i) => {
        if (answers[i] !== correct[i]) misses.set(q.countryId, (misses.get(q.countryId) || 0) + 1);
      });
    };
    const { rows: soloGames } = await query(
      `SELECT id, questions, answers FROM solo_games
       WHERE status = 'completed' AND answers IS NOT NULL
       ORDER BY created_at DESC LIMIT 300`
    );
    for (const g of soloGames) tally(g.questions, g.answers, g.id);
    const { rows: battleRows } = await query(
      `SELECT id, questions, challenger_result, opponent_result FROM battles
       WHERE status = 'completed' ORDER BY created_at DESC LIMIT 200`
    );
    for (const b of battleRows) {
      tally(b.questions, b.challenger_result?.answers, b.id * 2);
      tally(b.questions, b.opponent_result?.answers, b.id * 2 + 1);
    }
    const missed = [...misses.entries()]
      .map(([countryId, count]) => ({ countryId, misses: count }))
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 15);

    const { rows: inactive } = await query(
      `SELECT s.id, s.name, c.name AS class_name
       FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'approved' AND s.role = 'student'
         AND NOT EXISTS (SELECT 1 FROM solo_games g WHERE g.student_id = s.id
                         AND g.created_at > now() - interval '7 days')
         AND NOT EXISTS (SELECT 1 FROM battles b
                         WHERE (b.challenger_id = s.id OR b.opponent_id = s.id)
                         AND b.created_at > now() - interval '7 days')
       ORDER BY c.name, s.name`
    );

    res.json({ students, missed, inactive7d: inactive });
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount in `server/src/index.js`**

```js
import { adminRouter } from './routes/admin.js';
```
```js
app.use('/api/admin', adminRouter);
```

- [ ] **Step 3: Verify module load + tests green**

Run: `cd server && node -e "import('./src/routes/admin.js').then(() => console.log('ok'))" && npm test`

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "feat(server): admin endpoints (approval, roster, points, stats)"
```

---

### Task 12: Smoke script + server README

**Files:**
- Create: `server/scripts/smoke.js`, `server/README.md`

**Interfaces:**
- Consumes: the full HTTP API with `dev` auth headers.
- Produces: `node scripts/smoke.js` — end-to-end scenario against a RUNNING local server with a real DB (`DEV_AUTH=1`). Exits 0 on success, 1 with the first failed step printed.

- [ ] **Step 1: Create `server/scripts/smoke.js`**

```js
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
r = await call(ADMIN, 'POST', '/api/admin/classes', { name: '7Ә' });
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
```

- [ ] **Step 2: Create `server/README.md`**

```markdown
# GeoVictorina Server

Backend for the Telegram Mini App: Express API + PostgreSQL + grammY bot.

## Local development

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` — PostgreSQL connection string
   - `BOT_TOKEN` — from @BotFather (optional locally; bot disabled if empty)
   - `ADMIN_TG_ID` — the teacher's Telegram user id
   - `DEV_AUTH=1` — enables `Authorization: dev <tgId>` header (never in production)
2. `npm install`
3. `npm run migrate` — apply migrations
4. `npm run seed` — create school (+ classes from `SEED_CLASSES=7Ә,8А,...`)
5. `npm run dev`

## Tests

`npm test` — pure-logic unit tests (no DB needed).

## Smoke test (needs running server + DB, DEV_AUTH=1, ADMIN_TG_ID=1)

`node scripts/smoke.js`

## Points rules

All tunable values live in `src/config.js`.
```

- [ ] **Step 3: Full-suite check**

Run: `cd server && npm test && node -e "import('./src/index.js').then(() => setTimeout(() => process.exit(0), 800))"`
Expected: tests pass; server boots and logs `geo-server listening` (bot disabled message is fine).

- [ ] **Step 4 (only if a local PostgreSQL is available): run the real smoke**

If `DATABASE_URL` in `server/.env` points to a reachable database:
`cd server && npm run migrate && npm run seed && (start server with DEV_AUTH=1, ADMIN_TG_ID=1) && node scripts/smoke.js`
Expected: `SMOKE PASSED ✅`. If no local DB exists, skip — the smoke script runs during Railway deployment in Plan 2.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): smoke test script and README"
```

---

## Self-Review Notes (already applied)

- Spec coverage: registration/approval (T7, T11), solo + daily cap (T8), async battles incl. per-player shuffled order, decline, expiry ±10 (T4, T9), leaderboards incl. classes average + month archive (T10), admin roster/points/stats (T11), bot notifications kk/ru (T7, T9, T11), config-tunable points (T2). The `tma/` frontend, Railway deploy, and BotFather setup are Plan 2.
- Type consistency: seeds (`id*2`, `id*2+1`, solo `gameId`) used identically in T3 tests, T8, T9, and T11 stats; points event `reason` strings match between T4, T6, T8, T9, T10, T11.
