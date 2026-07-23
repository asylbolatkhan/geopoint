import { useEffect, useState } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import Card from '../components/Card';

const SCOPES = ['class', 'school', 'classes'];

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={() => { haptic('light'); onClick(); }}
      className={`px-4 py-2 rounded-xl text-sm font-medium border shrink-0 ${
        selected ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800 border-slate-700 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />;
}

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return rank;
}

export default function RatingTab({ lang, me }) {
  const t = useT(lang);

  const [scope, setScope] = useState('class');
  const [period, setPeriod] = useState('thisMonth'); // thisMonth | allTime | YYYY-MM
  const [months, setMonths] = useState([]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api('/leaderboard/months')
      .then((r) => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        setMonths((r.months || []).filter((m) => m !== currentMonth));
      })
      .catch(() => setMonths([]));
  }, []);

  const fetchRows = () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (period === 'allTime') params.set('month', 'all');
    else if (period !== 'thisMonth') params.set('month', period);
    api(`/leaderboard?${params.toString()}`)
      .then((r) => setRows(r.rows || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, period]);

  const isClasses = scope === 'classes';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {SCOPES.map((s) => (
          <Chip key={s} selected={scope === s} onClick={() => setScope(s)}>
            {t[`scope${s.charAt(0).toUpperCase()}${s.slice(1)}`]}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip selected={period === 'thisMonth'} onClick={() => setPeriod('thisMonth')}>{t.thisMonth}</Chip>
        <Chip selected={period === 'allTime'} onClick={() => setPeriod('allTime')}>{t.allTime}</Chip>
        {months.map((m) => (
          <Chip key={m} selected={period === m} onClick={() => setPeriod(m)}>{m}</Chip>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-slate-300 text-center">{t.errorGeneric}</p>
          <button type="button" onClick={fetchRows} className="rounded-xl py-2 px-6 font-semibold bg-sky-500 text-white">
            {t.retry}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-center py-8">{t.emptyBoard}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const isMe = !isClasses && me?.id === r.id;
            return (
              <Card
                key={r.id}
                className={`flex items-center justify-between gap-3 ${isMe ? 'border-sky-500' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg font-bold w-8 text-center shrink-0">{medal(r.rank)}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-slate-400 text-sm truncate">
                      {isClasses ? `${r.students} ${t.students}` : r.class_name}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sky-400">{isClasses ? r.avgPoints : r.points}</div>
                  <div className="text-slate-500 text-xs">{isClasses ? t.avgPoints : t.points}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
