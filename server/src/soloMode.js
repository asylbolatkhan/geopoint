import { POINTS } from './config.js';

// Режим кілті: баптау жиынтығын ретке тәуелсіз бір жолға нормалдау.
export function soloModeKey({ continents, questionTypes, count }) {
  const c = continents === 'all' ? 'all' : [...continents].sort().join(',');
  const t = [...questionTypes].sort().join(',');
  return `${c}|${t}|${count}`;
}

// Осы ойынға дейін бүгін сол режимде аяқталған ойын саны бойынша ұпай-құқық.
export function modePointsAllowed(playsBeforeToday) {
  return playsBeforeToday < POINTS.soloModePlaysPerDay;
}
