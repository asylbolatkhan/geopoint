import { useEffect, useState } from 'react';
import { useOnline } from './OnlineProvider';
import { useT } from '../i18n';
import { haptic } from '../telegram';

// Кіріс шақыру-тост: overlay бос (idle) кезде ғана көрінеді.
export default function InviteToast({ lang }) {
  const { incomingInvite, overlay, acceptInvite, declineInvite, serverNowMs } = useOnline();
  const t = useT(lang);
  const [, setTick] = useState(0);

  const visible = Boolean(incomingInvite) && overlay === 'idle';

  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const secLeft = Math.max(0, Math.ceil((incomingInvite.expiresAt - serverNowMs()) / 1000));
  if (secLeft <= 0) return null; // мерзімі өтті — сервер invite:expired жібергенше жасырамыз

  const { from, config } = incomingInvite;
  const continentsSummary = !config?.continents || config.continents === 'all'
    ? t.continents.all
    : config.continents.map((c) => t.continents[c] ?? c).join(', ');

  return (
    <div className="fixed top-0 inset-x-0 z-40 mx-3 mt-3">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-lg max-w-md mx-auto">
        <p className="font-semibold text-slate-100">⚡ {from.name} {t.onlineInviteIncoming}</p>
        <p className="text-sm text-slate-400 mt-0.5">
          {from.class_name && <span>{from.class_name} · </span>}
          {config?.count} · {continentsSummary} · ⏱ {secLeft}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { haptic('light'); acceptInvite(); }}
            className="flex-1 rounded-xl bg-sky-500 py-2 font-semibold text-slate-100 active:bg-sky-600"
          >
            {t.onlineAccept}
          </button>
          <button
            onClick={() => { haptic('light'); declineInvite(); }}
            className="flex-1 rounded-xl bg-slate-800 border border-slate-600 py-2 font-semibold text-slate-300 active:bg-slate-700"
          >
            {t.onlineDecline}
          </button>
        </div>
      </div>
    </div>
  );
}
