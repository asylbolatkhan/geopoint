import { useEffect, useState } from 'react';
import { api } from '../api';
import { useT } from '../i18n';
import Card from '../components/Card';

function Spinner() {
  return <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />;
}

export default function ProfileTab({ lang, me }) {
  const t = useT(lang);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    api('/profile')
      .then((r) => setProfile(r))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-slate-300 text-center">{t.errorGeneric}</p>
        <button type="button" onClick={load} className="rounded-xl py-2 px-6 font-semibold bg-sky-500 text-white">
          {t.retry}
        </button>
      </div>
    );
  }

  const { monthPoints, totalPoints, battles, soloGames, accuracy } = profile;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-center">{me?.name}</h2>

      <Card className="flex flex-col items-center gap-1 text-center border-sky-500">
        <div className="text-4xl font-bold text-sky-400">{monthPoints}</div>
        <div className="text-slate-400 text-sm">{t.monthPoints}</div>
      </Card>

      <Card className="flex flex-col items-center gap-1 text-center">
        <div className="text-2xl font-bold">{totalPoints}</div>
        <div className="text-slate-400 text-sm">{t.totalPoints}</div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold text-green-400">{battles?.wins ?? 0}</div>
          <div className="text-slate-400 text-xs">{t.wins}</div>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold text-red-400">{battles?.losses ?? 0}</div>
          <div className="text-slate-400 text-xs">{t.losses}</div>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold text-slate-300">{battles?.draws ?? 0}</div>
          <div className="text-slate-400 text-xs">{t.draws}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold">{soloGames}</div>
          <div className="text-slate-400 text-xs">{t.soloGames}</div>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold">{accuracy}%</div>
          <div className="text-slate-400 text-xs">{t.accuracy}</div>
        </Card>
      </div>
    </div>
  );
}
