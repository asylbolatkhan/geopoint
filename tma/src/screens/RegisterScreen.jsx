import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { tgUserLang, haptic } from '../telegram';
import { useT } from '../i18n';

const ROLES = ['student', 'teacher', 'player'];

const chipCls = (active) =>
  `px-4 py-2 rounded-xl text-sm font-medium border ${
    active
      ? 'bg-sky-500 border-sky-500 text-white'
      : 'bg-slate-800 border-slate-700 text-slate-300'
  }`;

export default function RegisterScreen({ onRegistered }) {
  const [lang, setLang] = useState(tgUserLang());
  const t = useT(lang);

  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [schoolId, setSchoolId] = useState(null);
  const [schools, setSchools] = useState(null);
  const [schoolsError, setSchoolsError] = useState(false);
  const [classId, setClassId] = useState(null);
  const [classes, setClasses] = useState(null);
  const [classesError, setClassesError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const loadSchools = () => {
    setSchoolsError(false);
    setSchools(null);
    api('/schools')
      .then((r) => {
        setSchools(r.schools);
        // Жалғыз мектеп болса — бірден таңдап қоямыз
        if (r.schools.length === 1) setSchoolId(r.schools[0].id);
      })
      .catch(() => setSchoolsError(true));
  };
  useEffect(loadSchools, []);

  const loadClasses = (sid) => {
    setClassesError(false);
    setClasses(null);
    api(`/classes?schoolId=${sid}`)
      .then((r) => setClasses(r.classes))
      .catch(() => setClassesError(true));
  };
  useEffect(() => {
    setClassId(null);
    if (role === 'player' || schoolId === null) {
      setClasses(null);
      setClassesError(false);
      return;
    }
    loadClasses(schoolId);
  }, [schoolId, role]);

  const canSubmit =
    name.trim().length > 0 &&
    !submitting &&
    (role === 'player' ||
      (role === 'teacher' ? schoolId !== null : schoolId !== null && classId !== null));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(false);
    try {
      const body =
        role === 'player'
          ? { name: name.trim(), lang, role: 'player' }
          : role === 'teacher'
            ? { name: name.trim(), lang, role: 'teacher', schoolId }
            : { name: name.trim(), schoolId, classId, lang };
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

  const roleLabels = { student: t.roleStudent, teacher: t.roleTeacher, player: t.rolePlayer };

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
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { haptic('light'); setRole(r); }}
                className={chipCls(role === r)}
              >
                {roleLabels[r]}
              </button>
            ))}
          </div>
        </div>

        {role !== 'player' && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.yourSchool}</label>
          {schoolsError ? (
            <button
              type="button"
              onClick={loadSchools}
              className="text-sm text-sky-400 underline text-left"
            >
              {t.retry}
            </button>
          ) : schools === null ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {schools.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setSchoolId(s.id);
                  }}
                  className={chipCls(schoolId === s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {role === 'student' && schoolId !== null && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.yourClass}</label>
          {classesError ? (
            <button
              type="button"
              onClick={() => loadClasses(schoolId)}
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
                  className={chipCls(classId === c.id)}
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
              className={chipCls(lang === 'kk')}
            >
              Қазақша
            </button>
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={chipCls(lang === 'ru')}
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
