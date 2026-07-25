import { useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from '../i18n';

// Екі ойыншы арасындағы жеке кездесулер есебі (wins–draws–losses, менің перспективам).
export default function H2HLine({ opponentId, lang }) {
  const t = useT(lang);
  const [h2h, setH2h] = useState(null);

  useEffect(() => {
    if (opponentId == null) return undefined;
    let ignore = false;
    setH2h(null);
    api(`/battles/h2h/${opponentId}`)
      .then((r) => {
        if (!ignore) setH2h(r);
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [opponentId]);

  if (!h2h) return null;

  return (
    <div className="text-slate-400 text-sm">
      ⚔️ {t.h2hTitle}: {h2h.wins}–{h2h.draws}–{h2h.losses}{' '}
      <span className="text-slate-500 text-xs">({t.h2hLegend})</span>
    </div>
  );
}
