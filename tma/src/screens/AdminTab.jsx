import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import Card from '../components/Card';
import FlagImg from '../components/FlagImg';
import { COUNTRY_BY_ID } from '@shared/data/index.js';

const SECTIONS = ['pending', 'students', 'classes', 'stats', 'broadcast'];

function Spinner() {
  return <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />;
}

function ErrorRetry({ t, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <p className="text-slate-300 text-center">{t.errorGeneric}</p>
      <button type="button" onClick={onRetry} className="rounded-xl py-2 px-6 font-semibold bg-sky-500 text-white">
        {t.retry}
      </button>
    </div>
  );
}

function ClassSelect({ classes, value, onChange }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
    >
      {classes.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

function fmtDate(iso, lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'kk-KZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function relTime(iso, t) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return t.today;
  if (days === 1) return t.yesterday;
  return t.daysAgo(days);
}

// ---------- Pending ----------

function PendingSection({ t, lang, classes, list, loading, error, onRetry, onMutated }) {
  const [picks, setPicks] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [errId, setErrId] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorRetry t={t} onRetry={onRetry} />;
  if (list.length === 0) return <p className="text-slate-400 text-center py-8">{t.noPending}</p>;

  const act = async (id, kind) => {
    if (busyId) return;
    setBusyId(id);
    setErrId(null);
    try {
      if (kind === 'approve') {
        const classId = picks[id] ?? list.find((s) => s.id === id)?.class_id ?? null;
        await api(`/admin/students/${id}/approve`, { method: 'POST', body: { classId } });
      } else {
        await api(`/admin/students/${id}/reject`, { method: 'POST' });
      }
      haptic('medium');
      onMutated();
    } catch {
      setErrId(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {list.map((s) => (
        <Card key={s.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-slate-500 text-xs">{fmtDate(s.created_at, lang)}</div>
              {s.school_name && <div className="text-slate-500 text-xs truncate">{s.school_name}</div>}
            </div>
            {s.role === 'teacher' ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                {t.teacherBadge}
              </span>
            ) : s.role === 'player' ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                {t.playerBadge}
              </span>
            ) : (
              <ClassSelect
                classes={classes.filter((c) => c.school_id === s.school_id)}
                value={picks[s.id] ?? s.class_id}
                onChange={(v) => setPicks((p) => ({ ...p, [s.id]: v }))}
              />
            )}
          </div>
          {errId === s.id && <p className="text-red-400 text-xs">{t.errorGeneric}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => act(s.id, 'approve')}
              disabled={busyId === s.id}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-green-500 text-white disabled:opacity-50"
            >
              {t.approve}
            </button>
            <button
              type="button"
              onClick={() => act(s.id, 'reject')}
              disabled={busyId === s.id}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-transparent border border-red-500 text-red-400 disabled:opacity-50"
            >
              {t.reject}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------- Students ----------

function PointsJournal({ t, lang, studentId, onChanged }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setError(false);
    api(`/admin/students/${studentId}/points`)
      .then((r) => setEvents(r.events))
      .catch(() => setError(true));
  };
  useEffect(load, [studentId]);

  const del = async (eventId) => {
    if (busyId) return;
    setBusyId(eventId);
    try {
      await api(`/admin/points/${eventId}`, { method: 'DELETE' });
      haptic('medium');
      setConfirmId(null);
      load();
      onChanged();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <p className="text-red-400 text-xs">{t.errorGeneric}</p>;
  if (events === null) return <Spinner />;
  if (events.length === 0) return <p className="text-slate-500 text-xs">—</p>;

  return (
    <div className="flex flex-col gap-1">
      {events.map((ev) => (
        <div key={ev.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-700/50 py-1 last:border-0">
          <div className="min-w-0">
            <div className="truncate">{t.reasonNames[ev.reason] ?? ev.reason}</div>
            <div className="text-slate-500 text-xs">{fmtDate(ev.created_at, lang)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`font-semibold ${ev.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {ev.amount >= 0 ? `+${ev.amount}` : ev.amount}
            </span>
            {confirmId === ev.id ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => del(ev.id)}
                  disabled={busyId === ev.id}
                  className="text-xs font-semibold text-red-400 disabled:opacity-50"
                >
                  {t.yes}
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="text-xs text-slate-400">
                  {t.cancel}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmId(ev.id)} className="text-red-400 text-xs px-1" title={t.deleteEvent}>
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StudentRow({ t, lang, s, classes, expanded, onToggle, onMutated }) {
  const [classId, setClassId] = useState(s.class_id);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState(false);

  useEffect(() => { setClassId(s.class_id); }, [s.class_id]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveErr(false);
    try {
      await api(`/admin/students/${s.id}`, { method: 'PATCH', body: { classId } });
      haptic('medium');
      onMutated();
    } catch {
      setSaveErr(true);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteErr(false);
    try {
      await api(`/admin/students/${s.id}`, { method: 'DELETE' });
      haptic('medium');
      onMutated();
    } catch {
      setDeleteErr(true);
      setDeleting(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <div onClick={onToggle} className="flex items-center justify-between gap-2 cursor-pointer active:opacity-70">
        <div className="min-w-0">
          <div className="font-medium truncate">{s.name}</div>
          <div className="text-slate-400 text-sm truncate">
            {s.class_name ?? (s.role === 'teacher' ? t.teacherBadge : s.role === 'player' ? t.playerBadge : '')}
          </div>
          {s.school_name && <div className="text-slate-500 text-xs truncate">{s.school_name}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-sky-400">{s.month_points}</div>
          <div className="text-slate-500 text-xs">{t.points}</div>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 pt-2 border-t border-slate-700">
          {s.role === 'student' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">{t.changeClass}</label>
              <div className="flex gap-2">
                <ClassSelect classes={classes.filter((c) => c.school_id === s.school_id)} value={classId} onChange={setClassId} />
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || classId === s.class_id}
                  className="rounded-lg px-4 text-sm font-semibold bg-sky-500 text-white disabled:opacity-50"
                >
                  {t.save}
                </button>
              </div>
              {saveErr && <p className="text-red-400 text-xs">{t.errorGeneric}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">{t.pointsJournal}</label>
            <PointsJournal t={t} lang={lang} studentId={s.id} onChanged={onMutated} />
          </div>

          <div className="pt-1 border-t border-slate-700">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-slate-300 text-sm">{t.deleteStudentConfirm}</p>
                {deleteErr && <p className="text-red-400 text-xs">{t.errorGeneric}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={doDelete}
                    disabled={deleting}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold bg-red-500 text-white disabled:opacity-50"
                  >
                    {t.yes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm font-semibold text-red-400"
              >
                {t.delete}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function StudentsSection({ t, lang, classes, list, loading, error, onRetry, onMutated }) {
  const [expandedId, setExpandedId] = useState(null);
  const [groupKey, setGroupKey] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorRetry t={t} onRetry={onRetry} />;
  if (list.length === 0) return <p className="text-slate-400 text-center py-8">{t.emptyBoard}</p>;

  // Категорияларға бөлу: мектеп мүшелері (мектеп атауы бойынша) + жеке ойыншылар
  const schoolMembers = list.filter((s) => s.school_id != null);
  const players = list.filter((s) => s.school_id == null);
  const groups = [];
  for (const s of schoolMembers) {
    let g = groups.find((x) => x.key === `school-${s.school_id}`);
    if (!g) {
      g = { key: `school-${s.school_id}`, title: `🏫 ${s.school_name ?? ''}`, rows: [] };
      groups.push(g);
    }
    g.rows.push(s);
  }
  if (players.length > 0) {
    groups.push({ key: 'players', title: `🎮 ${t.playersGroup}`, rows: players });
  }

  // Тізім жаңарғанда таңдалған топ жоғалып кетуі мүмкін — сонда біріншісіне қайтамыз
  const active = groups.find((g) => g.key === groupKey) ?? groups[0];

  const renderRow = (s) => (
    <StudentRow
      key={s.id}
      t={t}
      lang={lang}
      s={s}
      classes={classes}
      expanded={expandedId === s.id}
      onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id))}
      onMutated={onMutated}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {groups.map((g) => {
            const selected = g.key === active.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => { haptic('light'); setGroupKey(g.key); setExpandedId(null); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border shrink-0 ${
                  selected ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <span className="whitespace-nowrap">{g.title}</span>
                <span className={`text-xs font-bold rounded-full px-1.5 ${selected ? 'bg-sky-600/70' : 'bg-slate-900 text-slate-400'}`}>
                  {g.rows.length}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {active.rows.map(renderRow)}
    </div>
  );
}

// ---------- Broadcast ----------

function BroadcastSection({ t }) {
  const [audience, setAudience] = useState('all');
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(null);
  const [error, setError] = useState(false);

  const audiences = [
    { key: 'all', label: t.audienceAll },
    { key: 'school', label: t.audienceSchool },
    { key: 'players', label: t.audiencePlayers },
  ];

  const send = async () => {
    setSending(true);
    setError(false);
    try {
      const r = await api('/admin/broadcast', { method: 'POST', body: { text: text.trim(), audience } });
      haptic('medium');
      setSentCount(r.sent);
      setText('');
      setConfirming(false);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {audiences.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => { haptic('light'); setAudience(a.key); setConfirming(false); }}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${
              audience === a.key ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSentCount(null); setConfirming(false); }}
        maxLength={3500}
        rows={5}
        placeholder={t.broadcastPlaceholder}
        className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500 resize-none"
      />
      {error && <p className="text-red-400 text-sm">{t.errorGeneric}</p>}
      {sentCount !== null && <p className="text-green-400 text-sm">{t.broadcastSent(sentCount)}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-slate-300 text-sm">{t.broadcastConfirm}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="flex-1 rounded-xl py-3 font-bold bg-sky-500 text-white disabled:opacity-50"
            >
              {t.yes}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="flex-1 rounded-xl py-3 font-bold bg-slate-800 border border-slate-700 text-slate-300"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { haptic('light'); setConfirming(true); }}
          disabled={!text.trim() || sending}
          className="rounded-xl py-3 font-bold bg-sky-500 text-white disabled:opacity-50"
        >
          {t.broadcastSend}
        </button>
      )}
    </Card>
  );
}

// ---------- Classes ----------

function ClassesSection({ t, schools, list, loading, error, onRetry, onMutated }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState(false);
  const [delErr, setDelErr] = useState(null); // { id, notEmpty }
  const [busyId, setBusyId] = useState(null);
  const [pickedSchoolId, setPickedSchoolId] = useState(null);
  const [schoolName, setSchoolName] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);
  const [schoolAddErr, setSchoolAddErr] = useState(false);
  const [schoolDelErr, setSchoolDelErr] = useState(null); // { id, notEmpty }
  const [schoolBusyId, setSchoolBusyId] = useState(null);

  const selectedSchoolId = schools.some((sc) => sc.id === pickedSchoolId)
    ? pickedSchoolId
    : (schools[0]?.id ?? null);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || adding || !selectedSchoolId) return;
    setAdding(true);
    setAddErr(false);
    try {
      await api('/admin/classes', { method: 'POST', body: { name: trimmed, schoolId: selectedSchoolId } });
      haptic('medium');
      setName('');
      onMutated();
    } catch {
      setAddErr(true);
    } finally {
      setAdding(false);
    }
  };

  const addSchool = async () => {
    const trimmed = schoolName.trim();
    if (!trimmed || addingSchool) return;
    setAddingSchool(true);
    setSchoolAddErr(false);
    try {
      await api('/admin/schools', { method: 'POST', body: { name: trimmed } });
      haptic('medium');
      setSchoolName('');
      onMutated();
    } catch {
      setSchoolAddErr(true);
    } finally {
      setAddingSchool(false);
    }
  };

  const delSchool = async (id) => {
    if (schoolBusyId) return;
    setSchoolBusyId(id);
    setSchoolDelErr(null);
    try {
      await api(`/admin/schools/${id}`, { method: 'DELETE' });
      haptic('medium');
      onMutated();
    } catch (e) {
      const notEmpty = e instanceof ApiError && e.status === 409;
      setSchoolDelErr({ id, notEmpty });
    } finally {
      setSchoolBusyId(null);
    }
  };

  const del = async (id) => {
    if (busyId) return;
    setBusyId(id);
    setDelErr(null);
    try {
      await api(`/admin/classes/${id}`, { method: 'DELETE' });
      haptic('medium');
      onMutated();
    } catch (e) {
      const notEmpty = e instanceof ApiError && e.status === 409;
      setDelErr({ id, notEmpty });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorRetry t={t} onRetry={onRetry} />;

  const schoolClasses = list.filter((c) => c.school_id === selectedSchoolId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {schools.map((sc) => (
          <div
            key={sc.id}
            className={`flex items-center rounded-lg border ${
              sc.id === selectedSchoolId
                ? 'bg-sky-500 border-sky-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <button type="button" onClick={() => setPickedSchoolId(sc.id)} className="pl-3 pr-1.5 py-1.5 text-xs font-semibold">
              {sc.name}
            </button>
            <button
              type="button"
              onClick={() => delSchool(sc.id)}
              disabled={schoolBusyId === sc.id}
              className="pr-2 pl-0.5 py-1.5 text-xs opacity-70 disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {schoolDelErr && (
        <p className="text-red-400 text-xs">{schoolDelErr.notEmpty ? t.schoolNotEmpty : t.errorGeneric}</p>
      )}

      <Card className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            maxLength={40}
            placeholder={t.schoolName}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
          />
          <button
            type="button"
            onClick={addSchool}
            disabled={addingSchool || !schoolName.trim()}
            className="rounded-lg px-4 text-sm font-semibold bg-sky-500 text-white disabled:opacity-50"
          >
            {t.addSchool}
          </button>
        </div>
        {schoolAddErr && <p className="text-red-400 text-xs">{t.errorGeneric}</p>}
      </Card>

      <div className="flex flex-col gap-2">
        {schoolClasses.map((c) => (
          <Card key={c.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{c.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-slate-400 text-sm">{c.students} {t.students}</span>
                <button
                  type="button"
                  onClick={() => del(c.id)}
                  disabled={busyId === c.id}
                  className="text-red-400 text-sm px-1 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </div>
            {delErr?.id === c.id && (
              <p className="text-red-400 text-xs">{delErr.notEmpty ? t.classNotEmpty : t.errorGeneric}</p>
            )}
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder={t.className}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
        />
        {addErr && <p className="text-red-400 text-xs">{t.errorGeneric}</p>}
        <button
          type="button"
          onClick={add}
          disabled={adding || !name.trim() || !selectedSchoolId}
          className="rounded-lg py-2 text-sm font-semibold bg-sky-500 text-white disabled:opacity-50"
        >
          {t.addClass}
        </button>
      </Card>
    </div>
  );
}

// ---------- Stats ----------

function accuracyColor(pct) {
  if (pct < 60) return 'text-red-400';
  if (pct < 80) return 'text-yellow-400';
  return 'text-green-400';
}

function StatsSection({ t, lang, data, loading, error, onRetry }) {
  if (loading) return <Spinner />;
  if (error) return <ErrorRetry t={t} onRetry={onRetry} />;
  if (!data) return null;

  const { students, continents, missed, inactive7d, classSummary } = data;
  const multiSchool = new Set((classSummary ?? []).map((c) => c.school_name)).size > 1;

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-slate-400 text-xs">
              <th className="font-medium pb-2">{t.students}</th>
              <th className="font-medium pb-2 text-right">{t.games}</th>
              <th className="font-medium pb-2 text-right">{t.accuracy}</th>
              <th className="font-medium pb-2 text-right">{t.points}</th>
              <th className="font-medium pb-2 text-right">{t.lastActive}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-slate-700/50">
                <td className="py-1.5 truncate max-w-[8rem]">{s.name}</td>
                <td className="py-1.5 text-right">{s.games}</td>
                <td className={`py-1.5 text-right ${accuracyColor(s.accuracy)}`}>{s.accuracy}%</td>
                <td className="py-1.5 text-right text-sky-400 font-semibold">{s.month_points}</td>
                <td className="py-1.5 text-right text-slate-400 text-xs whitespace-nowrap">{relTime(s.last_active, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {classSummary?.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">{t.statClasses}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 text-xs">
                  <th className="font-medium pb-2">{t.scopeClass}</th>
                  <th className="font-medium pb-2 text-right">{t.students}</th>
                  <th className="font-medium pb-2 text-right">{t.accuracy}</th>
                  <th className="font-medium pb-2 text-right">{t.points}</th>
                </tr>
              </thead>
              <tbody>
                {classSummary.map((c) => (
                  <tr key={c.id} className="border-t border-slate-700/50">
                    <td className="py-1.5 truncate max-w-[8rem]">
                      {multiSchool && c.school_name ? `${c.school_name} · ${c.class_name}` : c.class_name}
                    </td>
                    <td className="py-1.5 text-right">{c.students}</td>
                    <td className={`py-1.5 text-right ${accuracyColor(c.accuracy)}`}>{c.accuracy}%</td>
                    <td className="py-1.5 text-right text-sky-400 font-semibold">{c.month_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-300">{t.statContinents}</h3>
        <div className="flex flex-col gap-1">
          {continents.map((c) => (
            <div key={c.continent} className="flex items-center justify-between text-sm">
              <span>{t.continents[c.continent] ?? c.continent}</span>
              <span className="text-slate-500 text-xs">{c.asked} {t.asked}</span>
              <span className={`font-semibold ${accuracyColor(c.accuracy)}`}>{c.accuracy}%</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-300">{t.statMissed}</h3>
        <div className="flex flex-col gap-2">
          {missed.map((m) => (
            <div key={m.countryId} className="flex items-center gap-3 text-sm">
              <FlagImg iso={m.countryId} size="sm" />
              <span className="flex-1 truncate">{COUNTRY_BY_ID.get(m.countryId)?.name?.[lang] ?? m.countryId}</span>
              <span className="text-red-400 font-semibold">{m.misses} {t.missed}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-300">{t.statInactive}</h3>
        {inactive7d.length === 0 ? (
          <p className="text-slate-500 text-sm">—</p>
        ) : (
          <div className="flex flex-col gap-1">
            {inactive7d.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.name}</span>
                <span className="text-slate-500">{s.class_name}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Root ----------

export default function AdminTab({ lang }) {
  const t = useT(lang);
  const [section, setSection] = useState('pending');

  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState(false);

  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState(false);

  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState(false);

  const [students, setStudents] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(false);

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);

  const fetchClasses = () => {
    setClassesLoading(true);
    setClassesError(false);
    api('/admin/classes')
      .then((r) => setClasses(r.classes))
      .catch(() => setClassesError(true))
      .finally(() => setClassesLoading(false));
  };

  const fetchSchools = () => {
    setSchoolsLoading(true);
    setSchoolsError(false);
    api('/admin/schools')
      .then((r) => setSchools(r.schools))
      .catch(() => setSchoolsError(true))
      .finally(() => setSchoolsLoading(false));
  };

  const fetchPending = () => {
    setPendingLoading(true);
    setPendingError(false);
    api('/admin/pending')
      .then((r) => setPending(r.students))
      .catch(() => setPendingError(true))
      .finally(() => setPendingLoading(false));
  };

  const fetchStudents = () => {
    setStudentsLoading(true);
    setStudentsError(false);
    api('/admin/students')
      .then((r) => setStudents(r.students))
      .catch(() => setStudentsError(true))
      .finally(() => setStudentsLoading(false));
  };

  const fetchStats = () => {
    setStatsLoading(true);
    setStatsError(false);
    api('/admin/stats')
      .then((r) => setStats(r))
      .catch(() => setStatsError(true))
      .finally(() => setStatsLoading(false));
  };

  useEffect(() => {
    fetchPending();
    fetchClasses();
    fetchSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (section === 'students' && students === null) fetchStudents();
    if (section === 'stats' && stats === null) fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const switchSection = (s) => {
    haptic('light');
    setSection(s);
  };

  // Mutation handlers that invalidate dependent caches
  const handlePendingMutated = () => {
    fetchPending();
    setStudents(null);
    setStats(null);
  };

  const handleStudentsMutated = () => {
    fetchStudents();
    setStats(null);
  };

  const handleClassesMutated = () => {
    fetchClasses();
    fetchSchools();
    setStudents(null);
    setStats(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-slate-800 rounded-xl p-1 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => switchSection(s)}
            className={`relative py-2 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
              section === s ? 'bg-sky-500 text-white' : 'text-slate-400'
            }`}
          >
            {t[`admin${s.charAt(0).toUpperCase()}${s.slice(1)}`]}
            {s === 'pending' && pending.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[1.1rem] h-[1.1rem] flex items-center justify-center px-1">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'pending' && (
        <PendingSection
          t={t}
          lang={lang}
          classes={classes}
          list={pending}
          loading={pendingLoading || classesLoading}
          error={pendingError || classesError}
          onRetry={() => { fetchPending(); fetchClasses(); }}
          onMutated={handlePendingMutated}
        />
      )}
      {section === 'students' && (
        <StudentsSection
          t={t}
          lang={lang}
          classes={classes}
          list={students ?? []}
          loading={studentsLoading || classesLoading}
          error={studentsError || classesError}
          onRetry={() => { fetchStudents(); fetchClasses(); }}
          onMutated={handleStudentsMutated}
        />
      )}
      {section === 'classes' && (
        <ClassesSection
          t={t}
          schools={schools}
          list={classes}
          loading={classesLoading || schoolsLoading}
          error={classesError || schoolsError}
          onRetry={() => { fetchClasses(); fetchSchools(); }}
          onMutated={handleClassesMutated}
        />
      )}
      {section === 'stats' && (
        <StatsSection t={t} lang={lang} data={stats} loading={statsLoading} error={statsError} onRetry={fetchStats} />
      )}
      {section === 'broadcast' && <BroadcastSection t={t} />}
    </div>
  );
}
