import { useEffect } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { useT } from '../i18n';

const POLL_MS = 20000;

export default function PendingScreen({ lang, onApproved }) {
  const t = useT(lang);

  const check = () => {
    api('/me')
      .then((r) => {
        if (r.student === null) onApproved(null);
        else if (r.student && r.student.status !== 'pending') onApproved(r.student);
      })
      .catch(() => {
        /* келесі әрекетте қайталанады */
      });
  };

  useEffect(() => {
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl">⏳</div>
      <h1 className="text-xl font-bold">{t.pendingTitle}</h1>
      <p className="text-slate-400 max-w-xs">{t.pendingText}</p>
      <button
        type="button"
        onClick={() => {
          haptic('light');
          check();
        }}
        className="rounded-xl py-3 px-6 font-semibold bg-sky-500 text-white"
      >
        {t.checkStatus}
      </button>
    </div>
  );
}
