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

// Non-deterministic: generates fresh questions each time. Must be called exactly once
// per game, with the result persisted. Rendering and scoring must reuse the stored
// array, never regenerate from this function.
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
    if (wrong.length < 3) {
      throw new Error(`not enough distinct options for ${country.id}/${type}`);
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
