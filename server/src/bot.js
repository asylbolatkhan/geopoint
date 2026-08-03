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

// Бір мектептің қабылданған қолданушыларына хабарлайды. Telegram-дың ~30 хабарлама/сек
// шегінен аспас үшін Promise.all емес, кезекпен + 50мс кідіріспен жібереді.
export async function notifySchoolMembers(schoolId, textByLang) {
  if (!bot) return;
  try {
    const { rows } = await query(
      "SELECT tg_user_id, lang FROM students WHERE status = 'approved' AND school_id = $1",
      [schoolId]
    );
    for (const s of rows) {
      await notify(s.tg_user_id, textByLang(s.lang), s.lang);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (e) {
    console.error('notifySchoolMembers failed:', e.message);
  }
}

// Барлық қабылданған жеке ойыншыларға хабарлайды (мектепке тәуелсіз).
export async function notifyPlayers(textByLang) {
  if (!bot) return;
  try {
    const { rows } = await query(
      "SELECT tg_user_id, lang FROM students WHERE status = 'approved' AND role = 'player'"
    );
    for (const s of rows) {
      await notify(s.tg_user_id, textByLang(s.lang), s.lang);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (e) {
    console.error('notifyPlayers failed:', e.message);
  }
}

// Админнің қолмен таратуы. Аудитория: 'all' | 'school' | 'players'.
// Админдердің өзіне жіберілмейді. Жіберілген адам санын қайтарады.
export async function broadcast(audience, text) {
  if (!bot) return 0;
  const where =
    audience === 'school' ? 'AND school_id IS NOT NULL'
    : audience === 'players' ? "AND role = 'player'"
    : '';
  const { rows } = await query(
    `SELECT tg_user_id, lang FROM students WHERE status = 'approved' AND role <> 'admin' ${where}`
  );
  let sent = 0;
  for (const s of rows) {
    await notify(s.tg_user_id, text, s.lang);
    sent++;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return sent;
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
  bot.start().catch((e) => console.error('bot start failed:', e.message));
}
