import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { useOnline } from '../online/OnlineProvider';
import Card from '../components/Card';
import QuizPlay from '../components/QuizPlay';

const CONTINENT_KEYS = ['europe', 'asia', 'northamerica', 'southamerica', 'africa', 'oceania', 'all'];
const TYPE_KEYS = ['country-capital', 'capital-country', 'country-flag', 'flag-country', 'flag-capital', 'capital-flag'];
const COUNT_OPTIONS = [10, 15, 20];

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={() => { haptic('light'); onClick(); }}
      className={`px-4 py-2 rounded-xl text-sm font-medium border ${
        selected ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-800 border-slate-700 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />;
}

function BackBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={() => { haptic('light'); onClick(); }}
      className="text-slate-400 text-lg w-fit px-1"
    >
      ‹
    </button>
  );
}

function resultBadge(b, t) {
  if (b.status === 'completed') {
    if (b.winner === 'me') return { label: t.battleWon, cls: 'text-green-400' };
    if (b.winner === 'them') return { label: t.battleLost, cls: 'text-red-400' };
    return { label: t.battleDraw, cls: 'text-slate-400' };
  }
  if (b.status === 'expired') return { label: t.expired, cls: 'text-slate-500' };
  return { label: t.declined, cls: 'text-slate-500' };
}

function hoursLeft(b) {
  return Math.max(0, Math.ceil((new Date(b.expiresAt) - Date.now()) / 3600000));
}

function score(v) {
  return v == null ? '—' : v;
}

function BattleRow({ b, t, onOpen, showDecline, declineOpen, onDeclineToggle, onDeclineConfirm, declining }) {
  const badge = b.status !== 'awaiting_opponent' ? resultBadge(b, t) : null;
  return (
    <Card className="flex flex-col gap-2">
      <div onClick={() => onOpen(b.id)} className="flex flex-col gap-1 cursor-pointer active:opacity-70">
        <div className="font-medium flex items-center gap-2 flex-wrap">
          <span>⚔️ {b.other.name} · {b.other.class_name ?? (b.other.role === 'teacher' ? t.teacherBadge : '')}</span>
          {b.mode === 'online' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold">
              ⚡ {t.onlineLabel}
            </span>
          )}
        </div>
        {b.status === 'awaiting_opponent' ? (
          !b.mySubmitted ? (
            <span className="text-sky-400 font-semibold text-sm">{t.yourTurn}</span>
          ) : (
            <span className="text-slate-400 text-sm">{t.waitingOpponent} · {hoursLeft(b)} {t.hoursLeft}</span>
          )
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-semibold ${badge.cls}`}>{badge.label}</span>
            {b.status === 'completed' && <span className="text-slate-400">{score(b.myCorrect)}:{score(b.theirCorrect)}</span>}
          </div>
        )}
      </div>
      {showDecline && (declineOpen ? (
        <div className="flex flex-col gap-2 pt-1 border-t border-slate-700">
          <p className="text-slate-300 text-sm">{t.declineConfirm}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeclineConfirm(b.id); }}
              disabled={declining}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-red-500 text-white disabled:opacity-50"
            >
              {t.yes}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeclineToggle(null); }}
              className="flex-1 rounded-lg py-2 text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-300"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDeclineToggle(b.id); }}
          className="self-start text-xs font-semibold text-red-400 border border-red-500/50 rounded-lg px-3 py-1"
        >
          {t.declineBtn}
        </button>
      ))}
    </Card>
  );
}

export default function BattlesTab({ lang, me }) {
  const t = useT(lang);
  const { wsStatus, onlineIds, refreshPresence, sendInvite, overlay, lastError, clearError } = useOnline();

  const [phase, setPhase] = useState('list'); // list | pickOpponent | settings | playing | finished
  const [battleMode, setBattleMode] = useState('async'); // async | online

  // list
  const [battles, setBattles] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [closedNotice, setClosedNotice] = useState(false);
  const [opening, setOpening] = useState(false);
  const [declineId, setDeclineId] = useState(null);
  const [declining, setDeclining] = useState(false);

  // pickOpponent
  const [scope, setScope] = useState('myClass');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [eligibleForTeacherBattle, setEligibleForTeacherBattle] = useState(true);
  const [teacherLockHint, setTeacherLockHint] = useState(false);

  // settings
  const [continents, setContinents] = useState(['all']);
  const [questionTypes, setQuestionTypes] = useState([...TYPE_KEYS]);
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const [genericError, setGenericError] = useState(false);
  const [notEligibleError, setNotEligibleError] = useState(false);

  // playing / finished
  const [game, setGame] = useState(null); // {battleId, total, questionSeconds, questions}
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [pending, setPending] = useState(null); // {answers, durationMs}
  const submittingRef = useRef(false);
  const [finished, setFinished] = useState(null);

  const fetchList = () => {
    setListLoading(true);
    setListError(false);
    api('/battles')
      .then((r) => setBattles(r.battles))
      .catch(() => setListError(true))
      .finally(() => setListLoading(false));
  };

  useEffect(() => {
    if (phase === 'list') fetchList();
  }, [phase]);

  // Онлайн-режимде қарсылас таңдау экранына кірген сайын presence жаңартылады
  useEffect(() => {
    if (phase === 'pickOpponent' && battleMode === 'online') refreshPresence();
  }, [phase, battleMode, refreshPresence]);

  // Таб жабылғанда ескі invite-қате келесі ашылуға ілеспейді
  useEffect(() => () => clearError(), [clearError]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (phase !== 'pickOpponent') return;
    let ignore = false;
    setStudentsLoading(true);
    const params = new URLSearchParams();
    if (scope === 'myClass' && me.class_id != null) params.set('classId', me.class_id);
    if (debouncedSearch) params.set('q', debouncedSearch);
    const qs = params.toString();
    api(`/students${qs ? `?${qs}` : ''}`)
      .then((r) => {
        if (!ignore) {
          setStudents(r.students);
          setEligibleForTeacherBattle(r.eligibleForTeacherBattle ?? true);
        }
      })
      .catch(() => {
        if (!ignore) setStudents([]);
      })
      .finally(() => {
        if (!ignore) setStudentsLoading(false);
      });
    return () => { ignore = true; };
  }, [phase, scope, debouncedSearch]);

  const toggleContinent = (k) => {
    setContinents((prev) => {
      if (k === 'all') return ['all'];
      if (prev.includes('all')) return [k];
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      return next.length === 0 ? ['all'] : next;
    });
  };

  const toggleType = (key) => {
    setQuestionTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const startPick = (mode = 'async') => {
    haptic('light');
    setClosedNotice(false);
    setScope('myClass');
    setSearch('');
    setDebouncedSearch('');
    setStudents([]);
    setTeacherLockHint(false);
    setBattleMode(mode);
    if (mode === 'online') clearError();
    setPhase('pickOpponent');
  };

  const selectOpponent = (s) => {
    haptic('light');
    setOpponent(s);
    setContinents(['all']);
    setQuestionTypes([...TYPE_KEYS]);
    setCount(10);
    setLimitError(false);
    setGenericError(false);
    setNotEligibleError(false);
    setPhase('settings');
  };

  // Онлайн шақыру: WS арқылы жіберіледі, жауап (waiting overlay / invite:error)
  // App-деңгейлі OnlineProvider-ге келеді → таб бірден тізімге қайтады
  const sendOnlineInvite = () => {
    if (questionTypes.length === 0) return;
    haptic('light');
    if (wsStatus !== 'open') {
      // сокет жабық — send үнсіз жоғалады, сондықтан бірден қате көрсетеміз
      setGenericError(true);
      return;
    }
    clearError();
    sendInvite(opponent.id, {
      continents: continents.includes('all') ? 'all' : continents,
      questionTypes,
      count,
    });
    setBattleMode('async');
    setPhase('list');
  };

  const throwBattle = async () => {
    if (questionTypes.length === 0 || starting) return;
    setStarting(true);
    setLimitError(false);
    setGenericError(false);
    setNotEligibleError(false);
    try {
      const body = {
        opponentId: opponent.id,
        config: { continents: continents.includes('all') ? 'all' : continents, questionTypes, count },
      };
      const r = await api('/battles', { method: 'POST', body });
      setGame({
        battleId: r.battle.id,
        total: r.total,
        questionSeconds: r.questionSeconds,
        questions: r.questions,
        other: { id: opponent.id, name: opponent.name, class_name: opponent.class_name ?? null, role: opponent.role },
      });
      setFinished(null);
      setSubmitError(false);
      setPhase('playing');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.code === 'not_eligible_teacher_battle') setNotEligibleError(true);
      else if (e instanceof ApiError && e.status === 429) setLimitError(true);
      else setGenericError(true);
    } finally {
      setStarting(false);
    }
  };

  const openBattle = async (id) => {
    if (opening) return;
    setOpening(true);
    try {
      const r = await api(`/battles/${id}`);
      if (r.questions) {
        setGame({
          battleId: r.battle.id,
          total: r.total,
          questionSeconds: r.questionSeconds,
          questions: r.questions,
          other: r.battle.other,
        });
        setSubmitError(false);
        setPhase('playing');
      } else {
        setFinished(r.battle);
        setPhase('finished');
      }
    } catch {
      setListError(true);
    } finally {
      setOpening(false);
    }
  };

  const doSubmit = async (answers, durationMs) => {
    if (submittingRef.current || !game) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const r = await api(`/battles/${game.battleId}/submit`, { method: 'POST', body: { answers, durationMs } });
      setFinished({
        status: r.status,
        myCorrect: r.correct,
        theirCorrect: null,
        total: r.total,
        winner: r.winner ?? null,
        other: game.other,
      });
      setPhase('finished');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setClosedNotice(true);
        setGame(null);
        setFinished(null);
        setPending(null);
        setPhase('list');
      } else {
        setSubmitError(true);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleFinish = (answers, durationMs) => {
    setPending({ answers, durationMs });
    doSubmit(answers, durationMs);
  };

  const confirmDecline = async (id) => {
    if (declining) return;
    setDeclining(true);
    try {
      await api(`/battles/${id}/decline`, { method: 'POST' });
    } catch {
      setGenericError(true);
    }
    setDeclining(false);
    setDeclineId(null);
    fetchList();
  };

  const backToList = () => {
    haptic('light');
    setGame(null);
    setFinished(null);
    setPhase('list');
  };

  const rematch = () => {
    haptic('light');
    setBattleMode('async');
    setOpponent(finished.other);
    setContinents(['all']);
    setQuestionTypes([...TYPE_KEYS]);
    setCount(10);
    setLimitError(false);
    setGenericError(false);
    setNotEligibleError(false);
    setFinished(null);
    setPhase('settings');
  };

  if (phase === 'playing') {
    if (submitting || submitError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          {submitError ? (
            <>
              <p className="text-slate-300 text-center">{t.errorGeneric}</p>
              <button
                type="button"
                onClick={() => doSubmit(pending.answers, pending.durationMs)}
                className="rounded-xl py-3 px-6 font-semibold bg-sky-500 text-white"
              >
                {t.retry}
              </button>
            </>
          ) : <Spinner />}
        </div>
      );
    }
    return (
      <QuizPlay questions={game.questions} questionSeconds={game.questionSeconds} lang={lang} onFinish={handleFinish} />
    );
  }

  if (phase === 'finished' && finished) {
    if (finished.status === 'awaiting_opponent') {
      return (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-2 text-center">
            <div className="text-lg font-semibold text-slate-300">{t.waitingOpponent}</div>
            <div className="text-4xl font-bold">{score(finished.myCorrect)}/{finished.total}</div>
          </Card>
          <button type="button" onClick={backToList} className="w-full bg-sky-500 rounded-xl py-3 font-bold text-white">
            {t.done}
          </button>
        </div>
      );
    }
    const badge = resultBadge(finished, t);
    const canRematch = ['completed', 'declined', 'expired'].includes(finished.status)
      && finished.other?.id && finished.other.role !== 'admin';
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col items-center gap-2 text-center">
          <div className={`text-2xl font-bold ${badge.cls}`}>{badge.label}</div>
          {finished.myCorrect != null && (
            <div className="text-4xl font-bold text-slate-100">
              {finished.theirCorrect != null ? `${score(finished.myCorrect)}:${score(finished.theirCorrect)}` : `${score(finished.myCorrect)}/${finished.total}`}
            </div>
          )}
        </Card>
        {canRematch && (
          <button type="button" onClick={rematch} className="w-full bg-sky-500 rounded-xl py-3 font-bold text-white">
            {t.rematch}
          </button>
        )}
        <button
          type="button"
          onClick={backToList}
          className={`w-full rounded-xl py-3 font-bold ${
            canRematch ? 'bg-slate-800 border border-slate-700 text-slate-300' : 'bg-sky-500 text-white'
          }`}
        >
          {t.done}
        </button>
      </div>
    );
  }

  if (phase === 'pickOpponent') {
    const onlineSet = new Set((onlineIds || []).map(String));
    const onlineDot = (id) => (battleMode === 'online' && onlineSet.has(String(id)) ? (
      <span title={t.onlineNow} className="w-2 h-2 bg-green-500 rounded-full inline-block shrink-0" />
    ) : null);
    return (
      <div className="flex flex-col gap-4">
        <BackBtn onClick={() => { setBattleMode('async'); setPhase('list'); }} />
        <h2 className="text-lg font-bold">{battleMode === 'online' ? <>⚡ {t.onlineBattle}: {t.chooseOpponent}</> : t.chooseOpponent}</h2>
        {me.role !== 'teacher' && (
          <div className="flex gap-2">
            <Chip selected={scope === 'myClass'} onClick={() => setScope('myClass')}>{t.myClass}</Chip>
            <Chip selected={scope === 'allSchool'} onClick={() => setScope('allSchool')}>{t.allSchool}</Chip>
          </div>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchName}
          className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-slate-100 placeholder-slate-500"
        />
        {studentsLoading ? <Spinner /> : (() => {
          const studentRows = students.filter((s) => s.role !== 'teacher');
          const teacherRows = students.filter((s) => s.role === 'teacher');
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {studentRows.map((s) => (
                  <Card
                    key={s.id}
                    onClick={() => selectOpponent(s)}
                    className="cursor-pointer active:opacity-70 flex items-center justify-between"
                  >
                    <span className="font-medium flex items-center gap-2">{s.name}{onlineDot(s.id)}</span>
                    <span className="text-slate-400 text-sm">{s.class_name}</span>
                  </Card>
                ))}
              </div>

              {teacherRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm text-slate-400 font-semibold">{t.teachersGroup}</h3>
                  {!eligibleForTeacherBattle && teacherLockHint && (
                    <p className="text-red-400 text-xs">{t.notEligibleTeacher}</p>
                  )}
                  {teacherRows.map((s) => (
                    <Card
                      key={s.id}
                      onClick={() => {
                        if (eligibleForTeacherBattle) selectOpponent(s);
                        else { haptic('light'); setTeacherLockHint(true); }
                      }}
                      className={`cursor-pointer active:opacity-70 flex items-center justify-between ${
                        eligibleForTeacherBattle ? '' : 'opacity-50'
                      }`}
                    >
                      <span className="font-medium flex items-center gap-2">
                        <span>{eligibleForTeacherBattle ? '' : '🔒 '}{s.name}</span>
                        {onlineDot(s.id)}
                      </span>
                      <span className="text-slate-400 text-sm">{t.teacherBadge}</span>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  if (phase === 'settings') {
    return (
      <div className="flex flex-col gap-5">
        <BackBtn onClick={() => setPhase('pickOpponent')} />
        <h2 className="text-lg font-bold">{t.battleSettings}</h2>
        <Card className="flex items-center gap-2">
          <span className="font-medium">⚔️ {opponent.name}</span>
          <span className="text-slate-400 text-sm">· {opponent.class_name ?? (opponent.role === 'teacher' ? t.teacherBadge : '')}</span>
        </Card>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.continent}</label>
          <div className="flex flex-wrap gap-2">
            {CONTINENT_KEYS.map((key) => (
              <Chip key={key} selected={continents.includes(key)} onClick={() => toggleContinent(key)}>
                {t.continents[key]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.questionTypes}</label>
          <div className="flex flex-wrap gap-2">
            {TYPE_KEYS.map((key) => (
              <Chip key={key} selected={questionTypes.includes(key)} onClick={() => toggleType(key)}>
                {t.typeNames[key]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">{t.questionCount}</label>
          <div className="flex flex-wrap gap-2">
            {COUNT_OPTIONS.map((c) => (
              <Chip key={c} selected={count === c} onClick={() => setCount(c)}>{c}</Chip>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">{t.timer}: 15 {t.sec}</p>

        {limitError && <p className="text-red-400 text-sm text-center">{t.dailyLimitError}</p>}
        {notEligibleError && <p className="text-red-400 text-sm text-center">{t.notEligibleTeacher}</p>}
        {genericError && <p className="text-red-500 text-sm text-center">{t.errorGeneric}</p>}

        <button
          type="button"
          onClick={battleMode === 'online' ? sendOnlineInvite : throwBattle}
          disabled={questionTypes.length === 0 || starting}
          className={`w-full rounded-xl py-3 font-bold text-white disabled:opacity-50 ${
            battleMode === 'online' ? 'bg-violet-500' : 'bg-sky-500'
          }`}
        >
          {battleMode === 'online' ? `⚡ ${t.throwBattle}` : starting ? t.loading : t.throwBattle}
        </button>
      </div>
    );
  }

  // list
  const active = battles.filter((b) => b.status === 'awaiting_opponent');
  const history = battles.filter((b) => b.status !== 'awaiting_opponent').slice(0, 20);

  // invite:error / declined / expired → t-кілттер (онлайн шақыру нәтижесінің банері)
  const onlineErrorText = {
    daily_cap: t.dailyLimitError,
    not_eligible: t.notEligibleTeacher,
    busy_target: t.onlineOpponentBusy,
    busy_you: t.onlineOpponentBusy,
    challenger_offline: t.onlineInviteExpired,
    not_found: t.onlineInviteExpired,
    expired: t.onlineInviteExpired,
    declined: t.onlineInviteDeclined,
  }[lastError] || t.errorGeneric;

  return (
    <div className="flex flex-col gap-5">
      {closedNotice && (
        <Card className="border-red-500/50 text-red-400 text-sm text-center" onClick={() => setClosedNotice(false)}>
          {t.battleClosedError}
        </Card>
      )}
      {genericError && (
        <Card className="border-red-500/50 text-red-400 text-sm text-center" onClick={() => setGenericError(false)}>
          {t.errorGeneric}
        </Card>
      )}
      {lastError && overlay === 'idle' && (
        <Card className="border-amber-500/50 text-amber-300 text-sm text-center" onClick={clearError}>
          ⚡ {onlineErrorText}
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => startPick('async')} className="w-full bg-sky-500 rounded-xl py-3 font-bold text-white">
          {t.newBattle}
        </button>
        <button
          type="button"
          onClick={() => startPick('online')}
          className="w-full bg-violet-500 rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2"
        >
          ⚡ {t.onlineBattle}
        </button>
      </div>

      {listLoading ? <Spinner /> : listError ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-slate-300 text-center">{t.errorGeneric}</p>
          <button type="button" onClick={fetchList} className="rounded-xl py-2 px-6 font-semibold bg-sky-500 text-white">
            {t.retry}
          </button>
        </div>
      ) : (
        <>
          {opening && (
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <div className={opening ? 'flex flex-col gap-5 opacity-50 pointer-events-none' : 'flex flex-col gap-5'}>
            {active.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm text-slate-400 font-semibold">{t.battleActive}</h3>
                {active.map((b) => (
                  <BattleRow
                    key={b.id}
                    b={b}
                    t={t}
                    onOpen={openBattle}
                    showDecline={b.role === 'opponent' && !b.mySubmitted}
                    declineOpen={declineId === b.id}
                    onDeclineToggle={setDeclineId}
                    onDeclineConfirm={confirmDecline}
                    declining={declining}
                  />
                ))}
              </div>
            )}

            {history.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm text-slate-400 font-semibold">{t.battleHistory}</h3>
                {history.map((b) => (
                  <BattleRow key={b.id} b={b} t={t} onOpen={openBattle} showDecline={false} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
