import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { tgUserLang, haptic } from '../telegram';
import { useT } from '../i18n';

export default function RegisterScreen({ onRegistered }) {
  const [lang, setLang] = useState(tgUserLang());
  const t = useT(lang);

  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [classId, setClassId] = useState(null);
  const [classes, setClasses] = useState(null);
  const [classesError, setClassesError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const loadClasses = () => {
    setClassesError(false);
    setClasses(null);
    api('/classes')
      .then((r) => setClasses(r.classes))
      .catch(() => setClassesError(true));
  };
  useEffect(loadClasses, []);

  const isTeacher = role === 'teacher';
  const canSubmit = name.trim().length > 0 && (isTeacher || classId !== null) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(false);
    try {
      const body = isTeacher
        ? { name: name.trim(), lang, role: 'teacher' }
        : { name: name.trim(), classId, lang };
      const r = await api('/register', { method: 'POST', body });
      haptic('medium');
      onRegistered(r.student);
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const r = await api('/me');
          onRegistered(r.student);
          return;
        } catch {
          setError(true);
        }
      } else {
        setError(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-md mx-auto w-full flex flex-col gap-5">
        <div className="text-center pt-6">
          <h1 className="text-2xl font-bold">{t.appName}</h1>
          <h2 className="text-base text-slate-400 mt-1">{t.registerTitle}</h2>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.yourName}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t.namePlaceholder}
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.roleLabel}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { haptic('light'); setRole('student'); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                role === 'student'
                  ? 'bg-sky-500 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {t.roleStudent}
            </button>
            <button
              type="button"
              onClick={() => { haptic('light'); setRole('teacher'); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                role === 'teacher'
                  ? 'bg-sky-500 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {t.roleTeacher}
            </button>
          </div>
        </div>

        {!isTeacher && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.yourClass}</label>
          {classesError ? (
            <button
              type="button"
              onClick={loadClasses}
              className="text-sm text-sky-400 underline text-left"
            >
              {t.retry}
            </button>
          ) : classes === null ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setClassId(c.id);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                    classId === c.id
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.language}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang('kk')}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                lang === 'kk'
                  ? 'bg-sky-500 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              Қазақша
            </button>
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                lang === 'ru'
                  ? 'bg-sky-500 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              Русский
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{t.errorGeneric}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-xl py-3 font-semibold bg-sky-500 text-white disabled:opacity-50"
        >
          {t.send}
        </button>

        <p className="text-xs text-slate-500 text-center pb-4">{t.registerHint}</p>
      </div>
    </div>
  );
}
