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
