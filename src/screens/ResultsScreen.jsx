import { tr as translations } from '../data/translations';

const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e'];
const PLAYER_GLOW = ['rgba(59,130,246,0.3)', 'rgba(249,115,22,0.3)', 'rgba(34,197,94,0.3)'];

function formatTime(seconds, language) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return language === 'kk' ? `${m}м ${s}с` : `${m}м ${s}с`;
  }
  return `${seconds}с`;
}

function TrophyIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="trophyGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="trophyShine" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Cup body */}
      <path d="M35 15 L85 15 L80 60 Q75 80 60 82 Q45 80 40 60 Z" fill="url(#trophyGold)" />
      <path d="M35 15 L85 15 L80 60 Q75 80 60 82 Q45 80 40 60 Z" fill="url(#trophyShine)" />
      {/* Handles */}
      <path d="M35 20 Q15 20 15 38 Q15 55 35 55" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
      <path d="M85 20 Q105 20 105 38 Q105 55 85 55" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
      {/* Stem */}
      <rect x="52" y="82" width="16" height="18" rx="2" fill="url(#trophyGold)" />
      {/* Base */}
      <rect x="38" y="98" width="44" height="10" rx="4" fill="url(#trophyGold)" />
      {/* Star on cup */}
      <path d="M60 28 L63 36 L72 36 L65 41 L68 50 L60 45 L52 50 L55 41 L48 36 L57 36 Z" fill="#fef3c7" opacity="0.9" />
    </svg>
  );
}

function PodiumIllustration({ ranked, scores, players, totalQuestions }) {
  const podiumHeights = [110, 75, 55];
  const podiumColors = ['#f59e0b', '#94a3b8', '#cd7c2f'];

  return (
    <div className="flex items-end justify-center gap-3 mb-6" style={{ height: 180 }}>
      {/* Reorder: 2nd, 1st, 3rd */}
      {[1, 0, 2].filter(i => i < ranked.length).map((rankIdx, colIdx) => {
        const player = ranked[rankIdx];
        const origIdx = players.findIndex(p => p.id === player.id);
        const score = scores[player.id] || 0;
        const h = podiumHeights[rankIdx];
        const medals = ['🥇', '🥈', '🥉'];
        const podiumLabel = rankIdx + 1;

        return (
          <div key={player.id} className="flex flex-col items-center">
            {/* Medal & score */}
            <div className="text-2xl mb-1">{medals[rankIdx]}</div>
            <div className="font-black text-white text-lg" style={{ textShadow: `0 0 10px ${PLAYER_GLOW[origIdx]}` }}>
              {score}
            </div>
            <div className="text-xs mb-2 font-bold truncate max-w-24 text-center" style={{ color: PLAYER_COLORS[origIdx] }}>
              {player.name}
            </div>
            {/* Podium block */}
            <div
              className="flex items-center justify-center font-black text-white rounded-t-xl w-24"
              style={{
                height: h,
                background: `linear-gradient(180deg, ${podiumColors[rankIdx]}cc, ${podiumColors[rankIdx]}66)`,
                border: `2px solid ${podiumColors[rankIdx]}`,
                boxShadow: `0 0 20px ${podiumColors[rankIdx]}44`,
                fontSize: 24,
              }}
            >
              {podiumLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ResultsScreen({ result, language, onPlayAgain, onHome }) {
  const { scores, players, totalQuestions, times } = result;
  const t = translations[language];

  const ranked = [...players].sort((a, b) => {
    const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
    if (scoreDiff !== 0) return scoreDiff;
    // Tiebreaker: less time wins
    const timeA = times?.[a.id] ?? Infinity;
    const timeB = times?.[b.id] ?? Infinity;
    return timeA - timeB;
  });
  const topScore = scores[ranked[0].id] || 0;
  const isTie = ranked.length > 1
    && topScore === (scores[ranked[1].id] || 0)
    && (times?.[ranked[0].id] ?? null) === (times?.[ranked[1].id] ?? null);

  const getPerformanceEmoji = (pct) => {
    if (pct >= 90) return { icon: '🏆', label: language === 'kk' ? 'Керемет!' : 'Отлично!' };
    if (pct >= 70) return { icon: '⭐', label: language === 'kk' ? 'Жақсы!' : 'Хорошо!' };
    if (pct >= 50) return { icon: '👍', label: language === 'kk' ? 'Дұрыс!' : 'Неплохо!' };
    return { icon: '📚', label: language === 'kk' ? 'Жаттық!' : 'Учимся!' };
  };

  // Solo mode
  if (players.length === 1) {
    const score = scores[players[0].id] || 0;
    const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const perf = getPerformanceEmoji(pct);
    const totalSec = times?.[players[0].id] ?? null;
    const avgSec = totalSec !== null && totalQuestions > 0
      ? (totalSec / totalQuestions).toFixed(1)
      : null;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
      >
        {/* Glow */}
        <div
          className="absolute"
          style={{
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            pointerEvents: 'none',
          }}
        />

        <div className="relative z-10 text-center max-w-sm w-full">
          <TrophyIllustration />

          <h1
            className="font-black text-4xl mt-4 mb-1"
            style={{
              background: 'linear-gradient(135deg, #f8fafc, #93c5fd)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {t.results}
          </h1>
          <p className="mb-6" style={{ color: '#64748b' }}>{players[0].name}</p>

          <div
            className="rounded-3xl p-8 mb-6"
            style={{
              background: 'rgba(15,23,42,0.8)',
              border: '2px solid rgba(245,158,11,0.3)',
              boxShadow: '0 0 40px rgba(245,158,11,0.15)',
            }}
          >
            <div className="text-5xl mb-2">{perf.icon}</div>
            <div className="font-black text-6xl mb-1" style={{ color: '#f59e0b' }}>
              {score}
              <span className="text-3xl font-normal" style={{ color: '#475569' }}> / {totalQuestions}</span>
            </div>
            <div className="font-bold text-2xl mb-4" style={{ color: '#94a3b8' }}>{pct}%</div>
            <div className="w-full rounded-full h-3" style={{ background: '#1e293b' }}>
              <div
                className="h-3 rounded-full transition-all duration-1000"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                  boxShadow: '0 0 10px rgba(245,158,11,0.5)',
                }}
              />
            </div>
            <p className="mt-3 font-bold" style={{ color: '#f59e0b' }}>{perf.label}</p>
          </div>

          {/* Time stats */}
          {totalSec !== null && (
            <div
              className="w-full rounded-2xl p-4 flex justify-around"
              style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(56,189,248,0.15)' }}
            >
              <div className="flex flex-col items-center gap-1">
                <span style={{ color: '#475569', fontSize: 12 }}>
                  {language === 'kk' ? 'Жалпы уақыт' : 'Общее время'}
                </span>
                <span className="font-black text-2xl" style={{ color: '#38bdf8' }}>
                  {formatTime(totalSec, language)}
                </span>
              </div>
              <div style={{ width: 1, background: 'rgba(56,189,248,0.15)' }} />
              <div className="flex flex-col items-center gap-1">
                <span style={{ color: '#475569', fontSize: 12 }}>
                  {language === 'kk' ? 'Орт. уақыт / сұрақ' : 'Среднее / вопрос'}
                </span>
                <span className="font-black text-2xl" style={{ color: '#38bdf8' }}>
                  {avgSec}с
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onHome}
              className="flex-1 py-3 font-bold rounded-xl transition-all"
              style={{ background: 'rgba(30,41,59,0.8)', border: '2px solid #1e293b', color: '#94a3b8' }}
            >
              {t.home}
            </button>
            <button
              onClick={onPlayAgain}
              className="flex-1 py-3 font-bold rounded-xl transition-all text-white"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}
            >
              {t.playAgain}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Multi-player mode
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
    >
      {/* Gold glow */}
      <div
        className="absolute"
        style={{
          width: 600,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative z-10 w-full max-w-xl">
        <h1
          className="font-black text-4xl text-center mb-2"
          style={{
            background: 'linear-gradient(135deg, #f8fafc, #f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {t.results}
        </h1>

        {/* Winner/Tie */}
        <div className="text-center mb-6">
          {isTie ? (
            <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{t.draw}</p>
          ) : (
            <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>
              🏆 {ranked[0].name} {t.won}
            </p>
          )}
        </div>

        {/* Podium */}
        <PodiumIllustration
          ranked={ranked}
          scores={scores}
          players={players}
          totalQuestions={totalQuestions}
        />

        {/* Score list */}
        <div className="space-y-3 mb-6">
          {ranked.map((player, rankIdx) => {
            const origIdx = players.findIndex(p => p.id === player.id);
            const score = scores[player.id] || 0;
            const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
            const playerTime = times?.[player.id] ?? null;
            const avgSec = playerTime !== null && totalQuestions > 0
              ? (playerTime / totalQuestions).toFixed(1)
              : null;

            return (
              <div
                key={player.id}
                className="rounded-2xl p-4"
                style={{
                  background: `${PLAYER_COLORS[origIdx]}12`,
                  border: `2px solid ${PLAYER_COLORS[origIdx]}40`,
                  boxShadow: rankIdx === 0 ? `0 0 20px ${PLAYER_GLOW[origIdx]}` : 'none',
                }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl shrink-0">
                    {['🥇', '🥈', '🥉'][rankIdx] || '🎖️'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-black text-lg truncate" style={{ color: PLAYER_COLORS[origIdx] }}>
                        {player.name}
                      </span>
                      <span className="font-black text-xl ml-2 shrink-0" style={{ color: '#fff' }}>
                        {score}
                        <span className="font-normal text-sm" style={{ color: '#475569' }}> / {totalQuestions}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: '#1e293b' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: PLAYER_COLORS[origIdx],
                          boxShadow: `0 0 8px ${PLAYER_GLOW[origIdx]}`,
                          transition: 'width 0.8s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>
                {playerTime !== null && (
                  <div className="flex gap-4 mt-3 pt-3" style={{ borderTop: `1px solid ${PLAYER_COLORS[origIdx]}25` }}>
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: '#475569', fontSize: 11 }}>
                        {language === 'kk' ? 'Жалпы:' : 'Итого:'}
                      </span>
                      <span className="font-black" style={{ color: '#38bdf8', fontSize: 14 }}>
                        {formatTime(playerTime, language)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: '#475569', fontSize: 11 }}>
                        {language === 'kk' ? 'Орт./сұрақ:' : 'Ср./вопрос:'}
                      </span>
                      <span className="font-black" style={{ color: '#38bdf8', fontSize: 14 }}>
                        {avgSec}с
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onHome}
            className="flex-1 py-4 font-bold text-lg rounded-2xl transition-all"
            style={{ background: 'rgba(30,41,59,0.8)', border: '2px solid #1e293b', color: '#94a3b8' }}
          >
            {t.home}
          </button>
          <button
            onClick={onPlayAgain}
            className="flex-1 py-4 font-bold text-lg rounded-2xl text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              boxShadow: '0 0 25px rgba(59,130,246,0.4)',
            }}
          >
            {t.playAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
