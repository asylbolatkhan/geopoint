const tg = window.Telegram?.WebApp ?? null;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#0f172a');
    tg.setBackgroundColor('#0f172a');
  } catch { /* ескі клиенттер қолдамауы мүмкін */ }
}

export function getAuthHeader() {
  if (tg?.initData) return `tma ${tg.initData}`;
  const devId = import.meta.env.VITE_DEV_TG_ID;
  return devId ? `dev ${devId}` : '';
}

export function tgUserLang() {
  return tg?.initDataUnsafe?.user?.language_code === 'ru' ? 'ru' : 'kk';
}

export function haptic(style = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(style); } catch { /* elective */ }
}
