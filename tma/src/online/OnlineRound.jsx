import { useEffect, useRef, useState } from 'react';
import { useOnline } from './OnlineProvider';
import { useT } from '../i18n';
import { haptic } from '../telegram';
import FlagImg from '../components/FlagImg';

const ROUND_MS = 15000;

// Бір раунд: сұрақ картасы + нұсқалар (QuizPlay презентациялық маркупы), өз-қарқынды таймер.
export default function OnlineRound({ lang }) {
  const { match, overlay, sendAnswer, leaveMatch, serverNowMs } = useOnline();
  const t = useT(lang);
  const [picked, setPicked] = useState(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [, setTick] = useState(0);
  const remainingRef = useRef(ROUND_MS); // reveal кезінде көрсетілетін «қатқан» мән

  const reveal = match?.revealPayload && match.revealPayload.idx === match?.idx ? match.revealPayload : null;

  // Жаңа раунд → локал таңдау тазаланады
  useEffect(() => {
    setPicked(null);
    setLeaveConfirm(false);
  }, [match?.idx]);

  // Таймер tick — тек белсенді раундта, reveal жоқта және deadline барда
  // (қарсыластың байланысы — тек баннер, менің таймерім оған тәуелсіз жүреді)
  useEffect(() => {
    if (overlay !== 'round' || reveal || match?.deadline == null) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [overlay, reveal, match?.deadline]);

  // Reveal келгенде бір рет haptic (revealPayload identity бойынша)
  useEffect(() => {
    if (!reveal) return;
    haptic(reveal.yourCorrect ? 'light' : 'heavy');
  }, [reveal]);

  if (!match || !match.question) return null;

  const q = match.question;
  const isFlagOptions = q.type === 'country-flag' || q.type === 'capital-flag';

  let remainingMs;
  if (reveal || match.deadline == null) {
    remainingMs = remainingRef.current; // reveal кезінде таймер қатады
  } else {
    remainingMs = Math.max(0, match.deadline - serverNowMs());
    remainingRef.current = remainingMs;
  }
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const pct = Math.max(0, Math.min(100, (remainingMs / ROUND_MS) * 100));
  const urgent = remainingMs < 5000;

  const locked = picked !== null || reveal != null;

  const choose = (i) => {
    if (locked || overlay !== 'round') return; // құлыптан кейінгі таптар еленбейді
    setPicked(i);
    haptic('light');
    sendAnswer(match.matchId, match.idx, i);
  };

  // window.confirm iOS Telegram WebView-те жұмыс істемейді → инлайн екі-тап confirm
  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto w-full">
      <div className="flex items-center justify-between text-slate-400 text-sm">
        <span>{t.question} {match.idx + 1}/{match.total}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-semibold">
          {t.youLabel} {match.scores.you} : {match.scores.opponent}
        </span>
        <button
          onClick={() => { haptic('light'); setLeaveConfirm(true); }}
          className="text-slate-500 underline text-xs"
        >
          {t.onlineLeave}
        </button>
      </div>

      {leaveConfirm && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800/80 p-3">
          <p className="text-slate-300 text-sm text-center">{t.onlineLeaveConfirm}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { haptic('light'); leaveMatch(); }}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-red-500 text-white"
            >
              {t.yes}
            </button>
            <button
              type="button"
              onClick={() => { haptic('light'); setLeaveConfirm(false); }}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {t.onlineOpponentProgress}: {match.opponentProgress?.answered ?? 0}/{match.total}
        </span>
        <span className={urgent ? 'text-red-400 font-bold' : 'text-slate-400'}>⏱ {secondsLeft}</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${urgent ? 'bg-red-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%`, transition: 'width 250ms linear' }}
        />
      </div>

      {match.opponentDisconnected != null && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm text-center p-2">
          {t.onlineOpponentReconnecting}
        </div>
      )}

      <div className="flex items-center justify-center min-h-[120px]">
        {q.display.displayType === 'flag'
          ? <FlagImg iso={q.display.value} size="lg" />
          : <p className="text-2xl font-bold text-center text-slate-100">{q.display.value}</p>}
      </div>

      <div className={isFlagOptions ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {q.options.map((opt, i) => {
          let cls = 'bg-slate-800 border-slate-700 active:bg-slate-700';
          if (reveal) {
            if (i === reveal.correctOption) cls = 'bg-green-500 border-green-400';
            else if (reveal.yourAnswer != null && i === reveal.yourAnswer && !reveal.yourCorrect) cls = 'bg-red-500 border-red-400';
            else cls = 'bg-slate-800 border-slate-700 opacity-50';
          } else if (picked === i) {
            cls = 'bg-sky-500 border-sky-400';
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={locked}
              className={`rounded-xl border p-3 text-slate-100 font-medium transition-colors ${cls} ${isFlagOptions ? 'flex items-center justify-center' : ''}`}
            >
              {isFlagOptions ? <FlagImg iso={opt} size="md" /> : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
