import { useEffect, useState } from 'react';
import { useOnline } from './OnlineProvider';
import { useT } from '../i18n';
import { haptic } from '../telegram';
import OnlineRound from './OnlineRound';

const OUTCOME_EMOJI = { win: '🏆', loss: '😔', draw: '🤝' };
const MATCH_PHASES = ['countdown', 'round', 'reveal'];

// Толық экранды матч-оверлей: overlay !== 'idle' кезде App деңгейінде көрсетіледі.
export default function OnlineMatchOverlay({ lang }) {
  const { overlay, invite, match, wsStatus, cancelInvite, closeOverlay, serverNowMs } = useOnline();
  const t = useT(lang);
  const [, setTick] = useState(0);

  // waiting (TTL) және countdown (3-2-1) секундтарын жаңарту
  const ticking = overlay === 'waiting' || overlay === 'countdown';
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [ticking]);

  if (overlay === 'idle') return null;

  const outcomeText = { win: t.battleWon, loss: t.battleLost, draw: t.battleDraw };

  let body = null;

  if (overlay === 'waiting') {
    const ttlSec = invite
      ? Math.max(0, Math.ceil((invite.expiresAt - serverNowMs()) / 1000))
      : 0;
    body = (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen p-6 text-center">
        <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xl font-bold">{t.onlineInviteSent}</p>
        <p className="text-slate-400">{t.onlineWaitingAccept}</p>
        <p className="text-slate-500 text-sm">⏱ {ttlSec}</p>
        <button
          onClick={() => { haptic('light'); cancelInvite(); }}
          className="mt-2 px-8 py-2.5 rounded-xl bg-slate-800 border border-slate-600 font-semibold text-slate-300 active:bg-slate-700"
        >
          {t.onlineCancel}
        </button>
      </div>
    );
  } else if (overlay === 'countdown') {
    const n = match?.countdownEndsAt
      ? Math.max(1, Math.ceil((match.countdownEndsAt - serverNowMs()) / 1000))
      : 1;
    body = (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen p-6 text-center">
        <p className="text-2xl">⚡</p>
        {match?.opponent?.name && <p className="text-xl font-bold">{match.opponent.name}</p>}
        <p className="text-slate-400">{t.onlineGetReady}</p>
        <p className="text-7xl font-black text-sky-400">{n}</p>
      </div>
    );
  } else if (overlay === 'round' || overlay === 'reveal') {
    body = <OnlineRound lang={lang} />;
  } else if (overlay === 'end') {
    const end = match?.endPayload;
    const scores = end?.scores ?? match?.scores ?? { you: 0, opponent: 0 };
    body = (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen p-6 text-center">
        <p className="text-6xl">{OUTCOME_EMOJI[end?.outcome] ?? '🤝'}</p>
        <p className="text-2xl font-bold">{outcomeText[end?.outcome] ?? ''}</p>
        {end?.reason === 'forfeit_opponent' && <p className="text-slate-400">{t.onlineOpponentLeft}</p>}
        {end?.reason === 'forfeit_you' && <p className="text-slate-400">{t.onlineYouLeft}</p>}
        <p className="text-4xl font-black">{scores.you} : {scores.opponent}</p>
        {end?.yourPoints != null && (
          <p className="text-green-400 font-semibold">+{end.yourPoints} {t.points}</p>
        )}
        <button
          onClick={() => { haptic('light'); closeOverlay(); }}
          className="mt-2 px-10 py-3 rounded-xl bg-sky-500 font-semibold active:bg-sky-600"
        >
          {t.done}
        </button>
      </div>
    );
  } else if (overlay === 'lost') {
    body = (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen p-6 text-center">
        <p className="text-5xl">📵</p>
        <p className="text-xl font-bold">{t.onlineMatchLost}</p>
        <button
          onClick={() => { haptic('light'); closeOverlay(); }}
          className="mt-2 px-10 py-3 rounded-xl bg-sky-500 font-semibold active:bg-sky-600"
        >
          {t.done}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-slate-100 overflow-y-auto">
      {wsStatus !== 'open' && MATCH_PHASES.includes(overlay) && (
        <div className="sticky top-0 z-10 bg-amber-500/90 text-slate-900 text-center text-xs font-semibold py-1">
          {t.onlineConnectionLost}
        </div>
      )}
      {body}
    </div>
  );
}
