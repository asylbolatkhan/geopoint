import { useEffect, useState } from 'react';
import { api } from './api';
import { tgUserLang } from './telegram';
import { useT } from './i18n';
import Loader from './components/Loader';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=жүктелуде, null=тіркелмеген
  const [error, setError] = useState(false);
  const lang = me?.lang ?? tgUserLang();
  const t = useT(lang);

  const load = () => {
    setError(false);
    api('/me')
      .then((r) => setMe(r.student))
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-100 p-6">
        <p>{t.errorGeneric}</p>
        <button onClick={load} className="px-6 py-2 rounded-xl bg-sky-500 font-semibold">{t.retry}</button>
      </div>
    );
  }
  if (me === undefined) return <Loader />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      {t.appName} — {me === null ? 'register' : me.status}
    </div>
  );
}
