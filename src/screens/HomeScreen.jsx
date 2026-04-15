import { useState } from 'react';
import Globe3D from '../components/Globe3D';

function GlobeIllustration() {
  return (
    <svg
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      <defs>
        <radialGradient id="oceanGrad" cx="38%" cy="35%" r="62%">
          <stop offset="0%" stopColor="#1e40af" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#0c1f5e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#020c1b" stopOpacity="0.7" />
        </radialGradient>
        <radialGradient id="shineGrad" cx="30%" cy="28%" r="40%">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.15" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        <clipPath id="globeClip">
          <circle cx="150" cy="150" r="130" />
        </clipPath>
      </defs>

      {/* Ocean base */}
      <circle cx="150" cy="150" r="130" fill="url(#oceanGrad)" />

      {/* Grid lines — meridians */}
      <g clipPath="url(#globeClip)" fill="none" stroke="#38bdf8" strokeWidth="0.6" opacity="0.3">
        <ellipse cx="150" cy="150" rx="40" ry="130" />
        <ellipse cx="150" cy="150" rx="80" ry="130" />
        <ellipse cx="150" cy="150" rx="110" ry="130" />
      </g>

      {/* Grid lines — parallels */}
      <g clipPath="url(#globeClip)" fill="none" stroke="#38bdf8" strokeWidth="0.6" opacity="0.3">
        <ellipse cx="150" cy="97" rx="120" ry="25" />
        <ellipse cx="150" cy="150" rx="130" ry="27" />
        <ellipse cx="150" cy="203" rx="120" ry="25" />
        <ellipse cx="150" cy="68" rx="95" ry="18" />
        <ellipse cx="150" cy="232" rx="95" ry="18" />
      </g>

      {/* Europe landmass (simplified stylized) */}
      <g clipPath="url(#globeClip)" opacity="0.75">
        {/* Scandinavia */}
        <path
          d="M155,72 Q160,66 168,65 Q175,64 178,70 Q182,78 178,88 Q174,96 168,100 Q163,95 158,88 Q153,80 155,72Z"
          fill="#22c55e"
          opacity="0.7"
        />
        {/* Main Europe blob */}
        <path
          d="M132,88 Q140,84 150,83 Q162,82 170,88 Q178,94 180,104 Q184,116 178,126 Q172,134 162,138 Q152,142 142,138 Q130,132 124,120 Q118,108 122,98 Q126,90 132,88Z"
          fill="#16a34a"
          opacity="0.7"
        />
        {/* Iberia */}
        <path
          d="M118,112 Q126,108 132,114 Q138,120 136,130 Q134,138 126,140 Q118,140 114,132 Q110,124 114,116Z"
          fill="#22c55e"
          opacity="0.65"
        />
        {/* Italy-like */}
        <path
          d="M152,128 Q158,126 162,132 Q166,140 162,148 Q158,154 152,152 Q148,150 146,144 Q144,136 148,130Z"
          fill="#16a34a"
          opacity="0.6"
        />
        {/* British Isles */}
        <path
          d="M118,88 Q124,84 128,88 Q130,94 126,98 Q122,100 118,96 Q116,92 118,88Z"
          fill="#22c55e"
          opacity="0.65"
        />
        {/* Balkans hint */}
        <path
          d="M166,124 Q174,120 180,126 Q184,132 180,140 Q176,146 170,144 Q164,140 164,132Z"
          fill="#15803d"
          opacity="0.6"
        />
      </g>

      {/* Shine overlay */}
      <circle cx="150" cy="150" r="130" fill="url(#shineGrad)" />

      {/* Outer ring */}
      <circle cx="150" cy="150" r="130" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.4" />

      {/* Glow dots — cities */}
      <g>
        <circle cx="140" cy="100" r="2.5" fill="#fbbf24" opacity="0.9" />
        <circle cx="140" cy="100" r="5" fill="#fbbf24" opacity="0.2" />
        <circle cx="152" cy="108" r="2" fill="#fbbf24" opacity="0.8" />
        <circle cx="152" cy="108" r="4" fill="#fbbf24" opacity="0.15" />
        <circle cx="130" cy="116" r="2" fill="#fbbf24" opacity="0.7" />
        <circle cx="162" cy="98" r="2" fill="#fbbf24" opacity="0.8" />
        <circle cx="170" cy="112" r="1.5" fill="#fbbf24" opacity="0.7" />
        <circle cx="145" cy="120" r="1.5" fill="#fbbf24" opacity="0.6" />
      </g>
    </svg>
  );
}

function StarField() {
  const stars = [
    [8, 12], [15, 45], [22, 78], [35, 23], [42, 67], [55, 10], [63, 52],
    [71, 88], [80, 31], [88, 70], [92, 18], [5, 60], [18, 92], [48, 40],
    [76, 5], [30, 55], [60, 80], [85, 42], [12, 35], [95, 65],
    [25, 15], [70, 25], [40, 90], [90, 80], [55, 70], [15, 70], [38, 5],
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map(([left, top], i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: i % 4 === 0 ? 3 : 2,
            height: i % 4 === 0 ? 3 : 2,
            opacity: 0.1 + (i % 5) * 0.06,
          }}
        />
      ))}
    </div>
  );
}

export default function HomeScreen({ onStart, onStudy }) {
  const [lang, setLang] = useState('kk');

  return (
    <div
      className="min-h-screen relative overflow-visible flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
    >
      {/* Map grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Stars */}
      <StarField />

      {/* Blue glow orb */}
      <div
        className="absolute"
        style={{
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Globe illustration */}
      <div
        className="absolute"
        style={{
          width: 500,
          height: 500,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.18,
          pointerEvents: 'none',
        }}
      >
        <GlobeIllustration />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-8">

        {/* 3D Globe */}
        <div className="mb-4 drop-shadow-2xl" style={{ filter: 'drop-shadow(0 0 30px rgba(56,189,248,0.3))' }}>
          <Globe3D size={300} />
        </div>

        {/* Title */}
        <h1
          className="font-black mb-2"
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            background: 'linear-gradient(135deg, #f8fafc 30%, #93c5fd 70%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
          }}
        >
          ГеоВикторина
        </h1>

        <p className="text-lg mb-10" style={{ color: '#64748b' }}>
          {lang === 'kk' ? 'Әлем мемлекеттері · 197 ел · 6 континент' : 'Страны мира · 197 стран · 6 континентов'}
        </p>

        {/* Language toggle */}
        <div
          className="flex p-1 mb-8 rounded-2xl"
          style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(56,189,248,0.15)' }}
        >
          {[
            { code: 'kk', label: 'Қазақша' },
            { code: 'ru', label: 'Русский' },
          ].map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              className="px-8 py-2 rounded-xl font-bold text-base transition-all"
              style={
                lang === code
                  ? {
                      background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                      color: '#fff',
                      boxShadow: '0 0 20px rgba(59,130,246,0.4)',
                    }
                  : { color: '#64748b' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => onStart(lang)}
            className="font-black text-xl px-16 py-5 rounded-2xl transition-all"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#fff',
              boxShadow: '0 0 40px rgba(59,130,246,0.5), 0 4px 20px rgba(0,0,0,0.4)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 60px rgba(59,130,246,0.7), 0 4px 30px rgba(0,0,0,0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 40px rgba(59,130,246,0.5), 0 4px 20px rgba(0,0,0,0.4)';
            }}
          >
            {lang === 'kk' ? '🚀 Ойын бастау' : '🚀 Начать игру'}
          </button>

          <button
            onClick={() => onStudy(lang)}
            className="font-black text-base px-12 py-3 rounded-2xl transition-all"
            style={{
              background: 'rgba(15,23,42,0.8)',
              color: '#38bdf8',
              border: '1px solid rgba(56,189,248,0.3)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.7)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(56,189,248,0.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.3)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {lang === 'kk' ? '📚 Дайындық' : '📚 Подготовка'}
          </button>
        </div>

        <p className="mt-6 text-xs" style={{ color: '#334155' }}>
          {lang === 'kk'
            ? 'Мұғалімдерге арналған тақта режимі'
            : 'Режим доски для учителей'}
        </p>

        <p className="mt-8 text-sm font-medium" style={{ color: 'rgba(148,163,184,0.85)' }}>
          © Асыл Болатханұлы
        </p>
      </div>
    </div>
  );
}
