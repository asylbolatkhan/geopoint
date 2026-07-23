import { useRef, useState } from 'react';
import { api } from '../api';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import Card from '../components/Card';
import FlagImg from '../components/FlagImg';
import QuizPlay from '../components/QuizPlay';

const CONTINENT_KEYS = ['europe', 'asia', 'northamerica', 'southamerica', 'africa', 'oceania', 'all'];
const TYPE_KEYS = ['country-capital', 'capital-country', 'country-flag', 'flag-country', 'flag-capital', 'capital-flag'];
const COUNT_OPTIONS = [10, 15, 20, 'all'];
const TIMER_OPTIONS = [null, 10, 15, 20, 30];

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={() => { haptic('light'); onClick(); }}
      className={`px-4 py-2 rounded-xl text-sm font-medium border ${
        selected ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800 border-slate-700 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function isFlagOptions(type) {
  return type === 'country-flag' || type === 'capital-flag';
}

function OptionValue({ q, index }) {
  if (index === null || index === undefined) return null;
  return isFlagOptions(q.type) ? <FlagImg iso={q.options[index]} size="sm" /> : <span>{q.options[index]}</span>;
}

export default function PlayTab({ lang }) {
  const t = useT(lang);

  const [phase, setPhase] = useState('setup'); // setup | playing | submitting | result
  const [continent, setContinent] = useState('all');
  const [questionTypes, setQuestionTypes] = useState([...TYPE_KEYS]);
  const [count, setCount] = useState(10);
  const [timerSec, setTimerSec] = useState(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const [game, setGame] = useState(null); // {gameId, total, questions}

  const [submitError, setSubmitError] = useState(false);
  const [answers, setAnswers] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [result, setResult] = useState(null); // {correct, total, points, correctOptionIndexes}
  const [showReview, setShowReview] = useState(false);
  const submittingRef = useRef(false);

  const toggleType = (key) => {
    setQuestionTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const startGame = async () => {
    if (questionTypes.length === 0 || starting) return;
    setStarting(true);
    setStartError(false);
    try {
      const body = {
        continents: continent === 'all' ? 'all' : [continent],
        questionTypes,
        count,
      };
      const r = await api('/solo/start', { method: 'POST', body });
      setGame(r);
      setAnswers(null);
      setResult(null);
      setShowReview(false);
      setPhase('playing');
    } catch {
      setStartError(true);
    } finally {
      setStarting(false);
    }
  };

  const doSubmit = async (ans, dur) => {
    if (submittingRef.current || !game) return;
    submittingRef.current = true;
    setPhase('submitting');
    setSubmitError(false);
    try {
      const r = await api(`/solo/${game.gameId}/submit`, {
        method: 'POST',
        body: { answers: ans, durationMs: dur },
      });
      setResult(r);
      setPhase('result');
    } catch {
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
    }
  };

  const handleFinish = (ans, dur) => {
    setAnswers(ans);
    setDurationMs(dur);
    doSubmit(ans, dur);
  };

  const backToSetup = () => {
    haptic('light');
    setPhase('setup');
    setGame(null);
    setResult(null);
    setShowReview(false);
  };

  if (phase === 'playing') {
    return (
      <QuizPlay
        questions={game.questions}
        questionSeconds={timerSec}
        lang={lang}
        onFinish={handleFinish}
      />
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        {submitError ? (
          <>
            <p className="text-slate-300 text-center">{t.errorGeneric}</p>
            <button
              type="button"
              onClick={() => doSubmit(answers, durationMs)}
              className="rounded-xl py-3 px-6 font-semibold bg-sky-500 text-white"
            >
              {t.retry}
            </button>
          </>
        ) : (
          <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  if (phase === 'result') {
    const capped = result.points < result.correct;
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-5xl font-bold">{result.correct}/{result.total}</div>
          <div className="text-slate-400 text-sm">{t.correctAnswers}</div>
        </Card>
        <Card className="flex flex-col items-center gap-1 text-center">
          <div className="text-3xl font-bold text-green-400">+{result.points} {t.points}</div>
          <div className="text-slate-400 text-sm">{t.earnedPoints}</div>
          {capped && <p className="text-slate-400 text-sm mt-1">{t.dailyCapNote}</p>}
        </Card>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { haptic('light'); setShowReview((s) => !s); }}
            className="flex-1 rounded-xl py-3 font-bold bg-slate-800 border border-slate-700 text-slate-300"
          >
            {t.review}
          </button>
          <button
            type="button"
            onClick={backToSetup}
            className="flex-1 rounded-xl py-3 font-bold bg-sky-500 text-white"
          >
            {t.playAgain}
          </button>
        </div>
        {showReview && (
          <div className="flex flex-col gap-2">
            {game.questions.map((q) => {
              const studentIdx = answers[q.index];
              const correctIdx = result.correctOptionIndexes[q.index];
              const isCorrect = studentIdx === correctIdx;
              return (
                <div
                  key={q.index}
                  className={`rounded-xl border p-3 flex items-center gap-3 bg-slate-800/60 ${
                    isCorrect ? 'border-green-500' : 'border-red-500'
                  }`}
                >
                  <div className="shrink-0">
                    {q.display.displayType === 'flag'
                      ? <FlagImg iso={q.display.value} size="sm" />
                      : <span className="font-medium text-slate-100">{q.display.value}</span>}
                  </div>
                  <div className="flex-1 text-sm text-slate-300 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t.yourAnswer}:</span>
                      {studentIdx === null ? <span>{t.skipped}</span> : <OptionValue q={q} index={studentIdx} />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t.rightAnswer}:</span>
                      <OptionValue q={q} index={correctIdx} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // setup
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">{t.continent}</label>
        <div className="flex flex-wrap gap-2">
          {CONTINENT_KEYS.map((key) => (
            <Chip key={key} selected={continent === key} onClick={() => setContinent(key)}>
              {t.continents[key]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">{t.questionTypes}</label>
        <div className="flex flex-wrap gap-2">
          {TYPE_KEYS.map((key) => (
            <Chip key={key} selected={questionTypes.includes(key)} onClick={() => toggleType(key)}>
              {t.typeNames[key]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">{t.questionCount}</label>
        <div className="flex flex-wrap gap-2">
          {COUNT_OPTIONS.map((c) => (
            <Chip key={c} selected={count === c} onClick={() => setCount(c)}>
              {c === 'all' ? t.all : c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">{t.timer}</label>
        <div className="flex flex-wrap gap-2">
          {TIMER_OPTIONS.map((s) => (
            <Chip key={s ?? 'none'} selected={timerSec === s} onClick={() => setTimerSec(s)}>
              {s === null ? t.noTimer : `${s} ${t.sec}`}
            </Chip>
          ))}
        </div>
      </div>

      {startError && <p className="text-red-500 text-sm text-center">{t.errorGeneric}</p>}

      <button
        type="button"
        onClick={startGame}
        disabled={questionTypes.length === 0 || starting}
        className="w-full bg-sky-500 rounded-xl py-3 font-bold text-white disabled:opacity-50"
      >
        {starting ? t.loading : startError ? t.retry : t.start}
      </button>
    </div>
  );
}
