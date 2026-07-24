// Импортсыз, толық таза модуль — тек ойын-логика, БД/уақыт тәуелсіз.

// 'YYYY-MM-DD' → UTC күн нөмірі (локал Date парсинг емес, дана шекара қатесін болдырмау үшін)
function toDayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function computeStreak(sortedDayKeys, todayKey) {
  const todayNum = toDayNumber(todayKey);
  const dayNums = [...new Set(sortedDayKeys.map(toDayNumber))]
    .filter((n) => n <= todayNum)
    .sort((a, b) => a - b);

  if (dayNums.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < dayNums.length; i += 1) {
    run = dayNums[i] === dayNums[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const last = dayNums[dayNums.length - 1];
  let current = 0;
  if (last === todayNum || last === todayNum - 1) {
    current = 1;
    for (let i = dayNums.length - 2; i >= 0; i -= 1) {
      if (dayNums[i] === dayNums[i + 1] - 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return { current, best };
}

export function computeAchievements({ wins, soloCompleted, hasPerfectGame, bestStreak, totalPoints }) {
  return [
    { key: 'firstWin', unlocked: wins >= 1 },
    { key: 'wins10', unlocked: wins >= 10 },
    { key: 'solo50', unlocked: soloCompleted >= 50 },
    { key: 'perfect', unlocked: !!hasPerfectGame },
    { key: 'streak3', unlocked: bestStreak >= 3 },
    { key: 'streak7', unlocked: bestStreak >= 7 },
    { key: 'points500', unlocked: totalPoints >= 500 },
  ];
}
