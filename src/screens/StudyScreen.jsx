import { useState } from 'react';
import { countries as europeCountries } from '../data/europe';
import { asianCountries } from '../data/asia';
import { northAmericanCountries } from '../data/northamerica';
import { southAmericanCountries } from '../data/southamerica';
import { africanCountries } from '../data/africa';
import { oceaniaCountries } from '../data/oceania';

const CONTINENT_MAP = {
  europe: europeCountries,
  asia: asianCountries,
  northamerica: northAmericanCountries,
  southamerica: southAmericanCountries,
  africa: africanCountries,
  oceania: oceaniaCountries,
};

const CONTINENT_LABELS = {
  europe:       { kk: 'Еуропа',         ru: 'Европа'             },
  asia:         { kk: 'Азия',           ru: 'Азия'               },
  northamerica: { kk: 'Солт. Америка',  ru: 'Сев. Америка'       },
  southamerica: { kk: 'Оңт. Америка',   ru: 'Юж. Америка'        },
  africa:       { kk: 'Африка',         ru: 'Африка'             },
  oceania:      { kk: 'Океания',        ru: 'Океания'            },
};

export default function StudyScreen({ language, onBack }) {
  const [continents, setContinents] = useState(['europe']);
  const [search, setSearch] = useState('');

  const toggleContinent = (key) => {
    setContinents(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(c => c !== key) : prev
        : [...prev, key]
    );
  };

  const countries = continents.flatMap(k => CONTINENT_MAP[k] ?? []);

  const filtered = search.trim()
    ? countries.filter(c =>
        c.name[language].toLowerCase().includes(search.toLowerCase()) ||
        c.capital[language].toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  const t = {
    kk: { title: 'Дайындық', back: 'Артқа', search: 'Ел немесе астана іздеу...', capital: 'Астана', total: 'ел' },
    ru: { title: 'Подготовка', back: 'Назад', search: 'Поиск страны или столицы...', capital: 'Столица', total: 'стран' },
  }[language];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #020c1b 0%, #0a1f3a 55%, #071526 100%)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{
          background: 'rgba(10,20,40,0.97)',
          borderBottom: '1px solid rgba(56,189,248,0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={onBack}
          className="font-bold text-sm px-3 py-1.5 rounded-lg transition-all"
          style={{ color: '#475569', border: '1px solid #1e293b', background: 'rgba(15,23,42,0.5)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#93c5fd'; e.currentTarget.style.borderColor = '#93c5fd'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#1e293b'; }}
        >
          ← {t.back}
        </button>

        <span className="font-black text-white text-lg">📚 {t.title}</span>

        <span className="text-sm font-bold" style={{ color: '#38bdf8' }}>
          {filtered.length} {t.total}
        </span>
      </div>

      {/* Continent selector */}
      <div
        className="flex flex-wrap gap-2 px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}
      >
        {Object.keys(CONTINENT_MAP).map(key => {
          const active = continents.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggleContinent(key)}
              className="px-4 py-1.5 rounded-xl text-sm font-bold transition-all"
              style={
                active
                  ? {
                      background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                      color: '#fff',
                      boxShadow: '0 0 12px rgba(59,130,246,0.4)',
                      border: '1px solid transparent',
                    }
                  : {
                      background: 'rgba(15,23,42,0.6)',
                      color: '#475569',
                      border: '1px solid #1e293b',
                    }
              }
            >
              {CONTINENT_LABELS[key][language]}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-6 py-3 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.search}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(56,189,248,0.15)',
            color: '#e2e8f0',
          }}
        />
      </div>

      {/* Country grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {filtered.map(country => (
            <div
              key={country.id}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(15,23,42,0.7)',
                border: '1px solid rgba(56,189,248,0.1)',
              }}
            >
              {/* Flag */}
              <img
                src={`https://flagcdn.com/w80/${country.id}.png`}
                alt={country.name[language]}
                className="rounded"
                style={{ width: 52, height: 34, objectFit: 'cover', flexShrink: 0 }}
              />

              {/* Info */}
              <div className="min-w-0">
                <div
                  className="font-bold text-sm leading-tight truncate"
                  style={{ color: '#e2e8f0' }}
                >
                  {country.name[language]}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: '#38bdf8' }}
                >
                  {country.capital[language]}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center mt-20" style={{ color: '#334155' }}>
            {language === 'kk' ? 'Ештене табылмады' : 'Ничего не найдено'}
          </div>
        )}
      </div>
    </div>
  );
}
