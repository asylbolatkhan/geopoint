import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { haptic } from '../telegram';
import FlagImg from './FlagImg';

export default function QuizPlay({ questions, questionSeconds, lang, onFinish }) {
  const t = useT(lang);
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(questionSeconds ?? null);
  const [picked, setPicked] = useState(null); // осы сұрақта басылған нұсқа
  const answersRef = useRef(Array(questions.length).fill(null));
  const startRef = useRef(Date.now());       // ағымдағы сұрақтың басталуы
  const durationRef = useRef(0);
  const doneRef = useRef(false);

  const q = questions[idx];
  const isFlagOptions = q.type === 'country-flag' || q.type === 'capital-flag';

  const advance = (chosen) => {
    if (picked !== null) return; // қос басудан қорғау
    setPicked(chosen ?? -1);
    answersRef.current[q.index] = chosen;
    durationRef.current += Date.now() - startRef.current;
    setTimeout(() => {
      if (idx + 1 >= questions.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onFinish(answersRef.current, durationRef.current);
        }
      } else {
        setIdx(idx + 1);
        setPicked(null);
        setSecondsLeft(questionSeconds ?? null);
        startRef.current = Date.now();
      }
    }, 250);
  };

  useEffect(() => {
    if (questionSeconds == null || picked !== null) return undefined;
    if (secondsLeft <= 0) { advance(null); return undefined; }
    const id = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(id);
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-slate-400 text-sm">
        <span>{t.question} {idx + 1}/{questions.length}</span>
        {questionSeconds != null && (
          <span className={secondsLeft <= 5 ? 'text-red-400 font-bold' : ''}>⏱ {secondsLeft}</span>
        )}
      </div>
      <div className="flex items-center justify-center min-h-[120px]">
        {q.display.displayType === 'flag'
          ? <FlagImg iso={q.display.value} size="lg" />
          : <p className="text-2xl font-bold text-center text-slate-100">{q.display.value}</p>}
      </div>
      <div className={isFlagOptions ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => { haptic(); advance(i); }}
            disabled={picked !== null}
            className={`rounded-xl border p-3 text-slate-100 font-medium transition-colors ${
              picked === i ? 'bg-sky-500 border-sky-400' : 'bg-slate-800 border-slate-700 active:bg-slate-700'
            }`}
          >
            {isFlagOptions ? <FlagImg iso={opt} size="md" /> : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
