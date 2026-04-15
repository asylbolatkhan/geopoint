import { useState } from 'react';
import { tr as translations } from '../data/translations';
import { printStudySheet } from '../utils/printStudySheet';

const QUESTION_TYPES = ['country-capital', 'capital-country', 'country-flag', 'flag-country', 'flag-capital', 'capital-flag'];
const TIMER_OPTIONS = [0, 10, 15, 20, 30, 60];
const COUNT_OPTIONS = [10, 20, 30, 'all'];

const TYPE_ICONS = {
  'flag-country': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <rect x="8" y="8" width="14" height="20" rx="1" fill="#ef4444"/>
      <rect x="8" y="8" width="14" height="10" rx="1" fill="#fff"/>
      <path d="M26 14 L40 14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M26 20 L36 20" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M26 26 L38 26" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'flag-capital': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <rect x="6" y="8" width="14" height="20" rx="1" fill="#22c55e"/>
      <rect x="6" y="8" width="14" height="10" rx="1" fill="#fff"/>
      <circle cx="34" cy="14" r="6" fill="none" stroke="#94a3b8" strokeWidth="1.5"/>
      <circle cx="34" cy="14" r="2" fill="#94a3b8"/>
      <path d="M34 20 L34 28" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'country-capital': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <path d="M8 24 Q14 12 20 24" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
      <path d="M10 20 L18 20" stroke="#94a3b8" strokeWidth="1.5"/>
      <path d="M28 12 L28 26 M24 14 L32 14" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M36 24 L40 24 M36 20 L38 20" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'capital-country': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <circle cx="14" cy="18" r="7" fill="none" stroke="#94a3b8" strokeWidth="1.5"/>
      <circle cx="14" cy="18" r="2.5" fill="#94a3b8"/>
      <path d="M14 25 L14 30" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M26 14 L40 14" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M26 20 L36 20" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M26 26 L38 26" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'country-flag': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <path d="M8 14 L22 14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 20 L19 20" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 26 L21 26" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <rect x="28" y="8" width="16" height="20" rx="2" fill="#f97316" opacity="0.85"/>
      <rect x="28" y="8" width="16" height="10" rx="2" fill="#fff" opacity="0.9"/>
      <rect x="28" y="18" width="16" height="10" rx="2" fill="#22c55e" opacity="0.85"/>
    </svg>
  ),
  'capital-flag': (
    <svg viewBox="0 0 48 36" className="w-10 h-8" fill="none">
      <rect x="2" y="2" width="44" height="32" rx="4" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5"/>
      <circle cx="14" cy="18" r="7" fill="none" stroke="#94a3b8" strokeWidth="1.5"/>
      <circle cx="14" cy="18" r="2.5" fill="#94a3b8"/>
      <path d="M14 25 L14 30" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="28" y="8" width="16" height="20" rx="2" fill="#6366f1" opacity="0.85"/>
      <rect x="28" y="8" width="16" height="10" rx="2" fill="#fff" opacity="0.9"/>
      <rect x="28" y="18" width="16" height="10" rx="2" fill="#f59e0b" opacity="0.85"/>
    </svg>
  ),
};

function PlayerIllustration({ count }) {
  const personColor = '#38bdf8';
  const Person = ({ cx }) => (
    <g>
      <circle cx={cx} cy="20" r="8" fill={personColor} opacity="0.85" />
      <path d={`M${cx - 12} 45 Q${cx - 12} 32 ${cx} 29 Q${cx + 12} 32 ${cx + 12} 45`} fill={personColor} opacity="0.85" />
    </g>
  );

  if (count === 1) {
    return (
      <svg viewBox="0 0 60 50" className="w-14 h-12">
        <Person cx={30} />
      </svg>
    );
  }
  if (count === 2) {
    return (
      <svg viewBox="0 0 80 50" className="w-16 h-12">
        <Person cx={20} />
        <Person cx={60} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 50" className="w-20 h-12">
      <Person cx={15} />
      <Person cx={50} />
      <Person cx={85} />
    </svg>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(180deg, #38bdf8, #6366f1)' }} />
      <h2 className="font-bold text-base" style={{ color: '#cbd5e1' }}>{children}</h2>
    </div>
  );
}

export default function SetupScreen({ language, onStart, onBack }) {
  const t = translations[language];

  const [continents, setContinents] = useState(['europe']);
  const [playerCount, setPlayerCount] = useState(1);
  const [playerNames, setPlayerNames] = useState(['', '', '']);
  const [questionTypes, setQuestionTypes] = useState(() => {
    try {
      const saved = sessionStorage.getItem('geoQuestionTypes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [timer, setTimer] = useState(15);
  const [questionCount, setQuestionCount] = useState(10);
  const [error, setError] = useState('');

  const defaultNames = language === 'kk'
    ? ['Оқушы 1', 'Оқушы 2', 'Оқушы 3']
    : ['Ученик 1', 'Ученик 2', 'Ученик 3'];

  const playerColors = ['#3b82f6', '#f97316', '#22c55e'];

  const toggleType = (type) => {
    setQuestionTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      sessionStorage.setItem('geoQuestionTypes', JSON.stringify(next));
      return next;
    });
    setError('');
  };

  const updateName = (idx, value) => {
    setPlayerNames(prev => prev.map((n, i) => i === idx ? value : n));
  };

  const handleStart = () => {
    if (questionTypes.length === 0) {
      setError(t.selectAtLeastOne);
      return;
    }
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: playerNames[i] || defaultNames[i],
    }));
    onStart({ players, questionTypes, timer, questionCount, continents });
  };

  const modeOptions = [
    { count: 1, label: t.solo },
    { count: 2, label: t.twoPlayers },
    { count: 3, label: t.threePlayers },
  ];

  const chipStyle = (active) => ({
    padding: '8px 18px',
    borderRadius: 12,
    border: '2px solid',
    fontWeight: 700,
    fontSize: 14,
    transition: 'all 0.2s',
    cursor: 'pointer',
    ...(active
      ? { background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderColor: '#60a5fa', color: '#fff', boxShadow: '0 0 16px rgba(59,130,246,0.4)' }
      : { background: 'rgba(15,23,42,0.6)', borderColor: '#1e293b', color: '#64748b' }),
  });

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
    >
      {/* Map grid bg */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-center gap-4 px-6 py-4 shrink-0"
        style={{
          background: 'rgba(10,31,58,0.9)',
          borderBottom: '1px solid rgba(56,189,248,0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={onBack}
          className="font-bold text-base transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => e.currentTarget.style.color = '#38bdf8'}
          onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
        >
          ← {t.back}
        </button>
        <span
          className="font-black text-xl"
          style={{
            background: 'linear-gradient(135deg, #f8fafc, #93c5fd)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {t.appName}
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Continent selection */}
          <section>
            <SectionTitle>{t.continent}</SectionTitle>
            <div className="flex gap-3 flex-wrap">
              {[
                { key: 'europe',       label: t.continentEurope,       desc: t.continentEuropeDesc,       icon: '🌍' },
                { key: 'asia',         label: t.continentAsia,         desc: t.continentAsiaDesc,         icon: '🌏' },
                { key: 'northamerica', label: t.continentNorthAmerica, desc: t.continentNorthAmericaDesc, icon: '🌎' },
                { key: 'southamerica', label: t.continentSouthAmerica, desc: t.continentSouthAmericaDesc, icon: '🌎' },
                { key: 'africa',       label: t.continentAfrica,       desc: t.continentAfricaDesc,       icon: '🌍' },
                { key: 'oceania',      label: t.continentOceania,      desc: t.continentOceaniaDesc,      icon: '🌊' },
              ].map(({ key, label, desc, icon }) => {
                const active = continents.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => setContinents(prev =>
                      prev.includes(key)
                        ? prev.length > 1 ? prev.filter(c => c !== key) : prev
                        : [...prev, key]
                    )}
                    className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl transition-all"
                    style={{
                      border: '2px solid',
                      minWidth: 110,
                      ...(active
                        ? { background: 'rgba(29,78,216,0.25)', borderColor: '#3b82f6', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }
                        : { background: 'rgba(15,23,42,0.6)', borderColor: '#1e293b' }),
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{icon}</span>
                    <span className="font-bold text-sm" style={{ color: active ? '#93c5fd' : '#64748b' }}>{label}</span>
                    <span style={{ fontSize: 11, color: active ? '#60a5fa' : '#334155' }}>{desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Mode selection */}
          <section>
            <SectionTitle>{t.mode}</SectionTitle>
            <div className="flex gap-3 flex-wrap">
              {modeOptions.map(({ count, label }) => (
                <button
                  key={count}
                  onClick={() => setPlayerCount(count)}
                  className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl transition-all"
                  style={{
                    border: '2px solid',
                    ...(playerCount === count
                      ? {
                          background: 'rgba(29,78,216,0.25)',
                          borderColor: '#3b82f6',
                          boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                        }
                      : {
                          background: 'rgba(15,23,42,0.6)',
                          borderColor: '#1e293b',
                        }),
                  }}
                >
                  <PlayerIllustration count={count} />
                  <span className="font-bold text-sm" style={{ color: playerCount === count ? '#93c5fd' : '#64748b' }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Player names */}
          {playerCount > 1 && (
            <section>
              <SectionTitle>{t.playerNames}</SectionTitle>
              <div className="space-y-3">
                {Array.from({ length: playerCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white shrink-0 text-sm"
                      style={{ background: playerColors[i] }}
                    >
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={playerNames[i]}
                      onChange={e => updateName(i, e.target.value)}
                      placeholder={defaultNames[i]}
                      className="flex-1 px-4 py-2.5 rounded-xl font-medium outline-none transition-all"
                      style={{
                        background: 'rgba(15,23,42,0.8)',
                        border: '2px solid #1e293b',
                        color: '#e2e8f0',
                        fontSize: 15,
                      }}
                      onFocus={e => { e.target.style.borderColor = playerColors[i]; }}
                      onBlur={e => { e.target.style.borderColor = '#1e293b'; }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Question types */}
          <section>
            <SectionTitle>{t.questionTypes}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {QUESTION_TYPES.map(type => {
                const active = questionTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className="flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                    style={{
                      border: '2px solid',
                      ...(active
                        ? { background: 'rgba(29,78,216,0.2)', borderColor: '#3b82f6' }
                        : { background: 'rgba(15,23,42,0.6)', borderColor: '#1e293b' }),
                    }}
                  >
                    <div style={{ opacity: active ? 1 : 0.4 }}>
                      {TYPE_ICONS[type]}
                    </div>
                    <span
                      className="font-semibold text-xs leading-tight"
                      style={{ color: active ? '#93c5fd' : '#475569' }}
                    >
                      {t[type]}
                    </span>
                    <span
                      className="ml-auto text-lg shrink-0"
                      style={{ color: active ? '#22c55e' : '#1e293b' }}
                    >
                      {active ? '✓' : '○'}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </section>

          {/* Timer */}
          <section>
            <SectionTitle>{t.timer}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {TIMER_OPTIONS.map(sec => (
                <button key={sec} onClick={() => setTimer(sec)} style={chipStyle(timer === sec)}>
                  {sec === 0 ? t.noTimer : `${sec} ${t.seconds}`}
                </button>
              ))}
            </div>
          </section>

          {/* Question count */}
          <section>
            <SectionTitle>{t.questionCount}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {COUNT_OPTIONS.map(count => (
                <button key={count} onClick={() => setQuestionCount(count)} style={chipStyle(questionCount === count)}>
                  {count === 'all' ? t.all : count}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Start button */}
      <div
        className="relative z-10 p-5 shrink-0"
        style={{
          background: 'rgba(10,31,58,0.95)',
          borderTop: '1px solid rgba(56,189,248,0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={handleStart}
          className="w-full py-4 font-black text-xl rounded-2xl text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            boxShadow: '0 0 30px rgba(34,197,94,0.4)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {t.start} →
        </button>
        <button
          onClick={() => printStudySheet(language, continents)}
          className="w-full mt-2 py-2.5 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all"
          style={{ background: 'transparent', border: '1px solid rgba(56,189,248,0.2)', color: '#475569' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#38bdf8'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.2)'; }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }}>
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          {language === 'kk' ? 'Дайындық парағын жүктеу (PDF)' : 'Скачать шпаргалку (PDF)'}
        </button>
      </div>
    </div>
  );
}
