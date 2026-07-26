const MONTH_NAMES = {
  kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым',
    'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};

// 'YYYY-MM' → 'маусым 2026' / 'июнь 2026'
export function monthLabel(key, lang = 'kk') {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[lang][Number(month) - 1]} ${year}`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

function topLine(medal, row, unit) {
  const classPart = row.class_name ? ` (${row.class_name})` : '';
  return `${medal} ${row.name}${classPart} — ${row.points} ${unit}`;
}

export const M = {
  kk: {
    start: 'ГеоВикторинаға қош келдің! 🌍 Ойынды ашу үшін төмендегі батырманы бас.',
    open: '🎮 Ашу',
    newPending: (name, className) => `🆕 Жаңа өтінім: ${name} (${className}). Растау үшін қосымшаны аш.`,
    newPendingTeacher: (name) => `🧑‍🏫 Жаңа мұғалім өтінімі: ${name}. Растау үшін қосымшаны аш.`,
    newPendingPlayer: (name) => `🎮 Жаңа жеке ойыншы өтінімі: ${name}`,
    approved: 'Қабылдандың! 🎉 Енді ойнай аласың.',
    rejected: 'Өкінішке қарай, өтінімің қабылданбады. Мұғаліміңе хабарлас.',
    challenged: (name) => `⚔️ ${name} саған батл тастады! Жауап беруге 48 сағат бар.`,
    battleWon: (name, my, their) => `🏆 Сен ${name}-мен батлда жеңдің! ${my}:${their}`,
    battleLost: (name, my, their) => `😔 ${name}-мен батлда жеңілдің. ${my}:${their}. Кек ал!`,
    battleDraw: (name, score) => `🤝 ${name}-мен батл тең аяқталды: ${score}:${score}`,
    battleDeclined: (name) => `❌ ${name} батлыңды қабылдамады. Саған +10 ұпай жазылды.`,
    battleExpired: (name) => `⏰ ${name} батлыңа 48 сағатта жауап бермеді. Саған +10 ұпай жазылды.`,
    battleExpiredIdle: (name) => `⏰ ${name} тастаған батлға жауап бермедің: −10 ұпай.`,
    onlineInvite: (name) => `⚡ ${name} сені онлайн жекпе-жекке шақырды! 90 секунд ішінде қосыл!`,
    monthlyTop: (key, rows) => {
      const lines = rows.map((r, i) => topLine(MEDALS[i], r, 'ұпай')).join('\n');
      return `🏆 ${monthLabel(key, 'kk')} айының топ-3:\n\n${lines}\n\nЖаңа ай — жаңа жарыс! 💪`;
    },
  },
  ru: {
    start: 'Добро пожаловать в ГеоВикторину! 🌍 Нажми кнопку ниже, чтобы открыть игру.',
    open: '🎮 Открыть',
    newPending: (name, className) => `🆕 Новая заявка: ${name} (${className}). Открой приложение, чтобы подтвердить.`,
    newPendingTeacher: (name) => `🧑‍🏫 Новая заявка учителя: ${name}. Открой приложение, чтобы подтвердить.`,
    newPendingPlayer: (name) => `🎮 Новая заявка свободного игрока: ${name}`,
    approved: 'Тебя приняли! 🎉 Теперь можно играть.',
    rejected: 'К сожалению, заявка отклонена. Обратись к своему учителю.',
    challenged: (name) => `⚔️ ${name} бросил(а) тебе баттл! У тебя 48 часов.`,
    battleWon: (name, my, their) => `🏆 Ты победил(а) в баттле с ${name}! ${my}:${their}`,
    battleLost: (name, my, their) => `😔 Поражение в баттле с ${name}. ${my}:${their}. Возьми реванш!`,
    battleDraw: (name, score) => `🤝 Баттл с ${name} закончился вничью: ${score}:${score}`,
    battleDeclined: (name) => `❌ ${name} отклонил(а) твой баттл. Тебе начислено +10 очков.`,
    battleExpired: (name) => `⏰ ${name} не ответил(а) на баттл за 48 часов. Тебе +10 очков.`,
    battleExpiredIdle: (name) => `⏰ Ты не ответил(а) на баттл от ${name}: −10 очков.`,
    onlineInvite: (name) => `⚡ ${name} вызывает тебя на онлайн-батл! Зайди в приложение в течение 90 секунд!`,
    monthlyTop: (key, rows) => {
      const lines = rows.map((r, i) => topLine(MEDALS[i], r, 'очков')).join('\n');
      return `🏆 Топ-3 месяца — ${monthLabel(key, 'ru')}:\n\n${lines}\n\nНовый месяц — новая гонка! 💪`;
    },
  },
};
