import { useState, useCallback, useEffect, useRef } from 'react';
import PlayerPanel from '../components/PlayerPanel';
import { generateQuiz } from '../utils/quizEngine';
import { countries as europeCountries } from '../data/europe';
import { asianCountries } from '../data/asia';
import { northAmericanCountries } from '../data/northamerica';
import { southAmericanCountries } from '../data/southamerica';
import { africanCountries } from '../data/africa';
import { oceaniaCountries } from '../data/oceania';
import { tr as translations } from '../data/translations';

const PLAYER_COLORS = ['#3b82f6', '#f97316', '#22c55e'];

export default function QuizScreen({ config, language, onGameEnd, onHome }) {
  const t = translations[language];

  const CONTINENT_MAP = {
    europe: europeCountries,
    asia: asianCountries,
    northamerica: northAmericanCountries,
    southamerica: southAmericanCountries,
    africa: africanCountries,
    oceania: oceaniaCountries,
  };
  const selected = Array.isArray(config.continents) ? config.continents : [config.continents ?? 'europe'];
  const allCountries = selected.flatMap(k => CONTINENT_MAP[k] ?? []);

  // Each player gets their own independently shuffled question sequence
  const [playerQuestions] = useState(() => {
    const result = {};
    config.players.forEach(p => {
      result[p.id] = generateQuiz(config, allCountries, language);
    });
    return result;
  });

  const totalQuestions = playerQuestions[config.players[0].id].length;
  const quizStartTime = useRef(Date.now());

  // Full per-player state
  const [playerStates, setPlayerStates] = useState(() =>
    Object.fromEntries(config.players.map(p => [p.id, {
      currentIdx: 0,
      selectedAnswer: undefined,
      revealed: false,
      score: 0,
      finished: false,
      timerKey: 0,
      finishTime: null,
    }]))
  );

  // Watch for all players finished → go to results
  useEffect(() => {
    const allFinished = config.players.every(p => playerStates[p.id].finished);
    if (allFinished) {
      const finalScores = Object.fromEntries(
        config.players.map(p => [p.id, playerStates[p.id].score])
      );
      const finalTimes = Object.fromEntries(
        config.players.map(p => [
          p.id,
          playerStates[p.id].finishTime
            ? Math.round((playerStates[p.id].finishTime - quizStartTime.current) / 1000)
            : null,
        ])
      );
      onGameEnd(finalScores, config.players, totalQuestions, finalTimes);
    }
  }, [playerStates]); // eslint-disable-line

  const handleAnswer = useCallback((playerId, answer) => {
    setPlayerStates(prev => {
      const ps = prev[playerId];
      if (ps.revealed || ps.finished) return prev;
      const question = playerQuestions[playerId][ps.currentIdx];
      const isCorrect = answer === question.correctAnswer;
      return {
        ...prev,
        [playerId]: {
          ...ps,
          selectedAnswer: answer,
          revealed: true,
          score: isCorrect ? ps.score + 1 : ps.score,
        },
      };
    });
  }, [playerQuestions]);

  const handleTimerExpire = useCallback((playerId) => {
    setPlayerStates(prev => {
      const ps = prev[playerId];
      if (ps.revealed || ps.finished) return prev;
      return { ...prev, [playerId]: { ...ps, revealed: true } };
    });
  }, []);

  const handleNext = useCallback((playerId) => {
    setPlayerStates(prev => {
      const ps = prev[playerId];
      if (!ps.revealed || ps.finished) return prev;
      const nextIdx = ps.currentIdx + 1;
      const finished = nextIdx >= totalQuestions;
      return {
        ...prev,
        [playerId]: {
          ...ps,
          currentIdx: finished ? ps.currentIdx : nextIdx,
          selectedAnswer: undefined,
          revealed: finished,
          finished,
          timerKey: ps.timerKey + 1,
          finishTime: finished ? Date.now() : ps.finishTime,
        },
      };
    });
  }, [totalQuestions]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: 'rgba(10,20,40,0.97)',
          borderBottom: '1px solid rgba(56,189,248,0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={onHome}
          className="font-bold text-sm px-3 py-1 rounded-lg transition-all"
          style={{ color: '#475569', border: '1px solid #1e293b', background: 'rgba(15,23,42,0.5)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#1e293b'; }}
        >
          ✕ {t.home}
        </button>

        <span className="font-black text-white text-lg">
          {config.players.length > 1
            ? (language === 'kk' ? '⚔️ Жарыс' : '⚔️ Соревнование')
            : t.appName}
        </span>

        {/* Per-player score overview */}
        <div className="flex gap-4 items-center">
          {config.players.map((p, i) => {
            const ps = playerStates[p.id];
            return (
              <div key={p.id} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
                  <span className="font-black text-sm" style={{ color: PLAYER_COLORS[i] }}>
                    {ps.score}
                  </span>
                </div>
                <span className="text-xs" style={{ color: '#334155' }}>
                  {ps.finished ? '✓' : `${ps.currentIdx + 1}/${totalQuestions}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Panels — each fully independent */}
      <div className="flex flex-1 gap-2 p-2 overflow-hidden">
        {config.players.map((player, idx) => {
          const ps = playerStates[player.id];
          return (
            <PlayerPanel
              key={player.id}
              player={player}
              playerIndex={idx}
              question={playerQuestions[player.id][ps.currentIdx]}
              language={language}
              selectedAnswer={ps.selectedAnswer}
              revealed={ps.revealed}
              score={ps.score}
              currentQuestionNum={ps.currentIdx + 1}
              totalQuestions={totalQuestions}
              finished={ps.finished}
              timerDuration={config.timer}
              timerKey={ps.timerKey}
              onAnswer={(answer) => handleAnswer(player.id, answer)}
              onNext={() => handleNext(player.id)}
              onTimerExpire={() => handleTimerExpire(player.id)}
              totalPlayers={config.players.length}
            />
          );
        })}
      </div>
    </div>
  );
}
