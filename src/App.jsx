import { useState } from 'react';
import HomeScreen from './screens/HomeScreen';
import SetupScreen from './screens/SetupScreen';
import QuizScreen from './screens/QuizScreen';
import ResultsScreen from './screens/ResultsScreen';
import StudyScreen from './screens/StudyScreen';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [language, setLanguage] = useState('kk');
  const [config, setConfig] = useState(null);
  const [gameResult, setGameResult] = useState(null);

  const handleStart = (lang) => {
    setLanguage(lang);
    setScreen('setup');
  };

  const handleStudy = (lang) => {
    setLanguage(lang);
    setScreen('study');
  };

  const handleStartQuiz = (gameConfig) => {
    setConfig(gameConfig);
    setScreen('quiz');
  };

  const handleGameEnd = (scores, players, totalQuestions, times) => {
    setGameResult({ scores, players, totalQuestions, times });
    setScreen('results');
  };

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {screen === 'home' && (
        <HomeScreen onStart={handleStart} onStudy={handleStudy} />
      )}
      {screen === 'study' && (
        <StudyScreen language={language} onBack={() => setScreen('home')} />
      )}
      {screen === 'setup' && (
        <SetupScreen
          language={language}
          onStart={handleStartQuiz}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'quiz' && config && (
        <QuizScreen
          config={config}
          language={language}
          onGameEnd={handleGameEnd}
          onHome={() => setScreen('home')}
        />
      )}
      {screen === 'results' && gameResult && (
        <ResultsScreen
          result={gameResult}
          language={language}
          onPlayAgain={() => setScreen('setup')}
          onHome={() => setScreen('home')}
        />
      )}
      {screen !== 'home' && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            left: 16,
            fontSize: 13,
            color: 'rgba(148,163,184,0.6)',
            pointerEvents: 'none',
            zIndex: 9999,
            userSelect: 'none',
            fontWeight: 500,
          }}
        >
          © Асыл Болатханұлы
        </div>
      )}
    </div>
  );
}
