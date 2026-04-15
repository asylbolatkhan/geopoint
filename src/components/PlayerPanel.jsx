import { useMemo } from 'react';
import { tr as translations } from '../data/translations';
import { shuffle } from '../utils/shuffle';
import TimerBar from './TimerBar';

const PLAYER_THEMES = [
  {
    headerGrad: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
    bgGrad: 'linear-gradient(180deg, #0f1f4a 0%, #0a1628 100%)',
    border: '#3b82f6',
    glow: 'rgba(59,130,246,0.3)',
    btnBg: 'rgba(30,64,175,0.6)',
    btnBorder: '#3b82f6',
    nextGrad: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
    nextGlow: 'rgba(59,130,246,0.5)',
  },
  {
    headerGrad: 'linear-gradient(135deg, #c2410c, #ea580c)',
    bgGrad: 'linear-gradient(180deg, #3f1a0a 0%, #200d04 100%)',
    border: '#f97316',
    glow: 'rgba(249,115,22,0.3)',
    btnBg: 'rgba(154,52,18,0.6)',
    btnBorder: '#f97316',
    nextGrad: 'linear-gradient(135deg, #c2410c, #ea580c)',
    nextGlow: 'rgba(249,115,22,0.5)',
  },
  {
    headerGrad: 'linear-gradient(135deg, #15803d, #16a34a)',
    bgGrad: 'linear-gradient(180deg, #0f3020 0%, #071a10 100%)',
    border: '#22c55e',
    glow: 'rgba(34,197,94,0.3)',
    btnBg: 'rgba(20,83,45,0.6)',
    btnBorder: '#22c55e',
    nextGrad: 'linear-gradient(135deg, #15803d, #16a34a)',
    nextGlow: 'rgba(34,197,94,0.5)',
  },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function FlagImage({ iso, size }) {
  const cfg = {
    lg:  { src: 'w640', maxW: 600, maxH: 380 },
    md:  { src: 'w640', maxW: 400, maxH: 260 },
    sm:  { src: 'w320', maxW: 280, maxH: 180 },
  }[size] || { src: 'w640', maxW: 400, maxH: 260 };
  return (
    <div className="rounded-xl overflow-hidden shadow-2xl"
      style={{ border: '2px solid rgba(255,255,255,0.15)' }}>
      <img
        src={`https://flagcdn.com/${cfg.src}/${iso}.png`}
        alt="flag"
        style={{ maxWidth: cfg.maxW, maxHeight: cfg.maxH, display: 'block' }}
        className="object-contain"
        onError={e => {
          e.target.parentElement.innerHTML =
            '<div style="width:160px;height:90px;display:flex;align-items:center;justify-content:center;color:#475569;font-size:13px">?</div>';
        }}
      />
    </div>
  );
}

export default function PlayerPanel({
  player,
  playerIndex,
  question,
  language,
  selectedAnswer,
  revealed,
  score,
  currentQuestionNum,
  totalQuestions,
  finished,
  timerDuration,
  timerKey,
  onAnswer,
  onNext,
  onTimerExpire,
  totalPlayers,
}) {
  const theme = PLAYER_THEMES[playerIndex] || PLAYER_THEMES[0];
  const t = translations[language];

  // Each panel shuffles options independently → can't copy from neighbor
  const options = useMemo(
    () => shuffle([question.correctAnswer, ...question.wrongAnswers]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.correctAnswer, question.wrongAnswers.join(',')]
  );

  const hasAnswered = selectedAnswer !== undefined;
  const isCorrect = selectedAnswer === question.correctAnswer;
  const compact = totalPlayers === 3;
  const isFlagAnswer = question.type === 'country-flag' || question.type === 'capital-flag';
  const flagSize = totalPlayers === 1 ? 'lg' : totalPlayers === 2 ? 'md' : 'sm';

  const getPrompt = () => t[`prompt_${question.type.replace(/-/g, '_')}`] || '';

  const getButtonStyle = (option) => {
    const base = {
      width: '100%',
      padding: isFlagAnswer ? (compact ? '6px 8px' : '8px 10px') : (compact ? '10px 8px' : '11px 10px'),
      borderRadius: 12,
      border: '2px solid',
      fontWeight: 700,
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'all 0.15s',
      fontSize: compact ? 12 : 13,
    };
    if (revealed) {
      if (option === question.correctAnswer)
        return { ...base, background: 'rgba(34,197,94,0.22)', borderColor: '#22c55e', color: '#86efac', cursor: 'default' };
      if (option === selectedAnswer)
        return { ...base, background: 'rgba(239,68,68,0.22)', borderColor: '#ef4444', color: '#fca5a5', cursor: 'default' };
      return { ...base, background: 'rgba(30,41,59,0.3)', borderColor: '#1e293b', color: '#334155', cursor: 'default' };
    }
    if (hasAnswered) {
      if (option === selectedAnswer)
        return { ...base, background: `${theme.btnBg}`, borderColor: theme.btnBorder, color: '#fff', cursor: 'default' };
      return { ...base, background: 'rgba(30,41,59,0.3)', borderColor: '#1e293b', color: '#334155', cursor: 'default' };
    }
    return { ...base, background: theme.btnBg, borderColor: theme.btnBorder, color: '#e2e8f0', cursor: 'pointer' };
  };

  // ── Finished screen ──────────────────────────────────────────────
  if (finished) {
    const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    return (
      <div
        className="flex flex-col flex-1 rounded-2xl overflow-hidden"
        style={{ background: theme.bgGrad, border: `2px solid ${theme.border}`, boxShadow: `0 0 30px ${theme.glow}` }}
      >
        <div className="flex justify-between items-center px-4 py-3 shrink-0" style={{ background: theme.headerGrad }}>
          <span className="font-black text-white" style={{ fontSize: compact ? 16 : 20 }}>{player.name}</span>
          <span className="font-black text-white" style={{ fontSize: compact ? 22 : 28 }}>{score}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <div style={{ fontSize: compact ? 48 : 72 }}>🏁</div>
          <div className="font-black text-white" style={{ fontSize: compact ? 28 : 40 }}>
            {score} / {totalQuestions}
          </div>
          <div className="font-bold" style={{ fontSize: compact ? 18 : 24, color: '#94a3b8' }}>{pct}%</div>
          <div className="w-full rounded-full h-3" style={{ background: '#1e293b' }}>
            <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: theme.headerGrad }} />
          </div>
          <p className="font-bold" style={{ color: theme.border, fontSize: compact ? 13 : 15 }}>
            {language === 'kk' ? 'Аяқталды! Басқаларды күте тұр...' : 'Готово! Ожидание других...'}
          </p>
        </div>
      </div>
    );
  }

  // ── Active panel ──────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col flex-1 rounded-2xl overflow-hidden"
      style={{ background: theme.bgGrad, border: `2px solid ${theme.border}`, boxShadow: `0 0 30px ${theme.glow}` }}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 shrink-0" style={{ background: theme.headerGrad }}>
        <span className="font-black text-white truncate" style={{ fontSize: compact ? 15 : 19 }}>
          {player.name}
        </span>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: compact ? 11 : 13 }}>
            {currentQuestionNum}/{totalQuestions}
          </span>
          <span className="font-black text-white" style={{ fontSize: compact ? 22 : 28 }}>
            {score}
          </span>
        </div>
      </div>

      {/* Timer inside panel */}
      {timerDuration > 0 && (
        <TimerBar
          key={timerKey}
          duration={timerDuration}
          onExpire={onTimerExpire}
          paused={revealed}
        />
      )}

      {/* Body */}
      <div className="flex flex-col flex-1 items-center p-3 gap-2 overflow-hidden">

        {/* Question */}
        <div className="flex flex-col items-center gap-2 flex-1 justify-center min-h-0">
          <p style={{ fontSize: compact ? 11 : 13, color: '#64748b' }}>{getPrompt()}</p>

          {question.question.displayType === 'flag' ? (
            <FlagImage iso={question.question.value} size={flagSize} />
          ) : (
            <div className="px-5 py-3 rounded-2xl max-w-full"
              style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${theme.border}40` }}>
              <span className="font-black break-words text-center block text-white"
                style={{ fontSize: compact ? 18 : 26 }}>
                {question.question.value}
              </span>
            </div>
          )}

          {/* Correct answer hint when wrong */}
          {revealed && hasAnswered && !isCorrect && (
            <div className="flex items-center justify-center gap-2">
              <span style={{ color: '#475569', fontSize: 11 }}>{t.correctAnswer}</span>
              {isFlagAnswer ? (
                <img
                  src={`https://flagcdn.com/w80/${question.correctAnswer}.png`}
                  alt={question.correctAnswer}
                  style={{ height: 24, borderRadius: 2, border: '1px solid #4ade80' }}
                />
              ) : (
                <span className="font-bold" style={{ color: '#4ade80', fontSize: compact ? 12 : 14 }}>
                  {question.correctAnswer}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Answer options */}
        <div className="grid grid-cols-2 gap-2 w-full shrink-0">
          {options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onAnswer(option)}
              disabled={hasAnswered || revealed}
              style={getButtonStyle(option)}
            >
              <span style={{ opacity: 0.5, fontSize: 11, flexShrink: 0 }}>{OPTION_LETTERS[idx]}.</span>
              {isFlagAnswer ? (
                <img
                  src={`https://flagcdn.com/w160/${option}.png`}
                  alt={option}
                  style={{
                    height: totalPlayers === 1 ? 80 : totalPlayers === 2 ? 62 : 44,
                    objectFit: 'contain',
                    flex: 1,
                    borderRadius: 3,
                  }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : (
                <span className="leading-tight">{option}</span>
              )}
              {revealed && option === question.correctAnswer && (
                <span className="ml-auto shrink-0" style={{ color: '#4ade80' }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Per-player Next button */}
        <div className="w-full shrink-0">
          {revealed ? (
            <button
              onClick={onNext}
              className="w-full font-black rounded-xl text-white transition-all"
              style={{
                padding: compact ? '10px 0' : '13px 0',
                fontSize: compact ? 14 : 17,
                background: theme.nextGrad,
                boxShadow: `0 0 20px ${theme.nextGlow}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {currentQuestionNum >= totalQuestions
                ? (language === 'kk' ? 'Аяқтау ✓' : 'Завершить ✓')
                : (language === 'kk' ? 'Келесі →' : 'Далее →')}
            </button>
          ) : (
            <div
              className="w-full rounded-xl flex items-center justify-center font-bold"
              style={{
                padding: compact ? '10px 0' : '13px 0',
                background: 'rgba(15,23,42,0.5)',
                border: '2px solid #1e293b',
                color: '#1e293b',
                fontSize: compact ? 12 : 14,
                cursor: 'default',
              }}
            >
              {language === 'kk' ? '— жауап күтілуде —' : '— ожидание ответа —'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
