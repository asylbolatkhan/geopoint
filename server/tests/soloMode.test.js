import { describe, it, expect } from 'vitest';
import { soloModeKey, modePointsAllowed } from '../src/soloMode.js';
import { POINTS } from '../src/config.js';

describe('soloModeKey', () => {
  it('бірдей конфиг — бірдей кілт', () => {
    const a = soloModeKey({ continents: ['europe', 'asia'], questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: ['europe', 'asia'], questionTypes: ['country-capital'], count: 10 });
    expect(a).toBe(b);
  });

  it('құрлықтар реті кілтке әсер етпейді', () => {
    const a = soloModeKey({ continents: ['asia', 'europe'], questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: ['europe', 'asia'], questionTypes: ['country-capital'], count: 10 });
    expect(a).toBe(b);
  });

  it('сұрақ түрлерінің реті кілтке әсер етпейді', () => {
    const a = soloModeKey({ continents: 'all', questionTypes: ['flag-country', 'country-capital'], count: 15 });
    const b = soloModeKey({ continents: 'all', questionTypes: ['country-capital', 'flag-country'], count: 15 });
    expect(a).toBe(b);
  });

  it("continents='all' жеке кілт береді", () => {
    const all = soloModeKey({ continents: 'all', questionTypes: ['country-capital'], count: 10 });
    const eu = soloModeKey({ continents: ['europe'], questionTypes: ['country-capital'], count: 10 });
    expect(all).not.toBe(eu);
  });

  it('құрлық өзгерсе — басқа режим', () => {
    const a = soloModeKey({ continents: ['europe'], questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: ['asia'], questionTypes: ['country-capital'], count: 10 });
    expect(a).not.toBe(b);
  });

  it('сұрақ түрі өзгерсе — басқа режим', () => {
    const a = soloModeKey({ continents: 'all', questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: 'all', questionTypes: ['capital-country'], count: 10 });
    expect(a).not.toBe(b);
  });

  it("сұрақ саны өзгерсе — басқа режим (10 мен 'all' бөлек)", () => {
    const a = soloModeKey({ continents: 'all', questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: 'all', questionTypes: ['country-capital'], count: 'all' });
    expect(a).not.toBe(b);
  });

  it('түрлер жиыны кеңейсе — басқа режим', () => {
    const a = soloModeKey({ continents: 'all', questionTypes: ['country-capital'], count: 10 });
    const b = soloModeKey({ continents: 'all', questionTypes: ['country-capital', 'flag-country'], count: 10 });
    expect(a).not.toBe(b);
  });
});

describe('modePointsAllowed', () => {
  it('алғашқы 2 ойын ұпайлы, кейінгілері ұпайсыз', () => {
    expect(POINTS.soloModePlaysPerDay).toBe(2);
    expect(modePointsAllowed(0)).toBe(true);
    expect(modePointsAllowed(1)).toBe(true);
    expect(modePointsAllowed(2)).toBe(false);
    expect(modePointsAllowed(5)).toBe(false);
  });
});
