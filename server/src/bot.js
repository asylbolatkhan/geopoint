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
