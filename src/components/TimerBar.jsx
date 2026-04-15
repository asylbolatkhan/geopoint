import { useState, useEffect, useRef } from 'react';

export default function TimerBar({ duration, onExpire, paused }) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (paused) return;
    if (timeLeft <= 0) {
      onExpireRef.current?.();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, paused]);

  const pct = (timeLeft / duration) * 100;
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';
  const textColor = pct > 25 ? 'text-white' : 'text-red-200';

  return (
    <div className="relative w-full bg-slate-700 h-10 flex items-center overflow-hidden shrink-0">
      <div
        className={`absolute left-0 top-0 h-full transition-all duration-1000 ease-linear ${barColor} opacity-70`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative z-10 w-full text-center font-bold text-xl ${textColor}`}>
        {timeLeft}
      </span>
    </div>
  );
}
