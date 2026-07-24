import { describe, it, expect } from 'vitest';
import { M, monthLabel } from '../src/messages.js';

describe('monthLabel', () => {
  it('formats kk month name + year', () => {
    expect(monthLabel('2026-06', 'kk')).toBe('маусым 2026');
  });
  it('formats ru month name + year', () => {
    expect(monthLabel('2026-06', 'ru')).toBe('июнь 2026');
  });
  it('handles January (year rollover boundary)', () => {
    expect(monthLabel('2026-01', 'kk')).toBe('қаңтар 2026');
    expect(monthLabel('2026-01', 'ru')).toBe('январь 2026');
  });
});

describe('M.kk.monthlyTop', () => {
  const rows = [
    { name: 'Айгерім', class_name: '10А', points: 45 },
    { name: 'Нұрсұлтан', class_name: '10Ә', points: 40 },
    { name: 'Данияр', class_name: null, points: 35 },
  ];

  it('includes medals for top 3', () => {
    const text = M.kk.monthlyTop('2026-06', rows);
    expect(text).toContain('🥇');
    expect(text).toContain('🥈');
    expect(text).toContain('🥉');
  });

  it('includes class name in parens when present', () => {
    const text = M.kk.monthlyTop('2026-06', rows);
    expect(text).toContain('Айгерім (10А) — 45 ұпай');
  });

  it('omits parens when class_name is null', () => {
    const text = M.kk.monthlyTop('2026-06', rows);
    expect(text).toContain('Данияр — 35 ұпай');
    expect(text).not.toContain('Данияр (');
  });

  it('ends with the new-month call to action', () => {
    const text = M.kk.monthlyTop('2026-06', rows);
    expect(text.trim().endsWith('Жаңа ай — жаңа жарыс! 💪')).toBe(true);
  });
});

describe('onlineInvite', () => {
  it('kk contains lightning, sender name and the 90-second window', () => {
    const text = M.kk.onlineInvite('Айгерім');
    expect(text).toContain('⚡');
    expect(text).toContain('Айгерім');
    expect(text).toContain('90');
  });
  it('ru contains lightning, sender name and the 90-second window', () => {
    const text = M.ru.onlineInvite('Данияр');
    expect(text).toContain('⚡');
    expect(text).toContain('Данияр');
    expect(text).toContain('90');
  });
});

describe('M.ru.monthlyTop', () => {
  const rows = [
    { name: 'Айгерим', class_name: '10А', points: 45 },
    { name: 'Данияр', class_name: null, points: 35 },
  ];

  it('includes class name in parens when present', () => {
    const text = M.ru.monthlyTop('2026-06', rows);
    expect(text).toContain('Айгерим (10А) — 45 очков');
  });

  it('omits parens when class_name is null', () => {
    const text = M.ru.monthlyTop('2026-06', rows);
    expect(text).toContain('Данияр — 35 очков');
    expect(text).not.toContain('Данияр (');
  });

  it('ends with the new-month call to action', () => {
    const text = M.ru.monthlyTop('2026-06', rows);
    expect(text.trim().endsWith('Новый месяц — новая гонка! 💪')).toBe(true);
  });
});
