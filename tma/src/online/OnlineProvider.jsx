import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from 'react';
import { getAuthHeader } from '../telegram';
import * as socket from './socket';

const OnlineContext = createContext(null);

export function useOnline() {
  return useContext(OnlineContext);
}

const initialState = {
  wsStatus: 'closed',        // 'connecting' | 'open' | 'closed'
  onlineIds: [],
  overlay: 'idle',           // 'idle'|'waiting'|'countdown'|'round'|'reveal'|'end'|'lost'
  invite: null,              // {inviteId, expiresAt} — менің шығыс шақыруым
  incomingInvite: null,      // {inviteId, from, config, expiresAt}
  match: null,               // {matchId, opponent, round, total, question, deadline, revealPayload, scores, opponentDisconnected, endPayload, opponentAnswered, countdownEndsAt}
  lastError: null,           // код (invite:error codes | 'declined' | 'expired' | 'persist_failed')
};

const MATCH_PHASES = ['countdown', 'round', 'reveal'];
const SNAPSHOT_OVERLAY = { countdown: 'countdown', round_active: 'round', round_reveal: 'reveal' };

function handleMessage(state, msg) {
  switch (msg.type) {
    case 'presence:list':
      return { ...state, onlineIds: Array.isArray(msg.online) ? msg.online : [] };

    case 'invite:sent':
      return {
        ...state,
        overlay: 'waiting',
        invite: { inviteId: msg.inviteId, expiresAt: msg.expiresAt },
      };

    case 'invite:declined':
    case 'invite:expired': {
      // МЕНІҢ шығыс шақыруым үшін ғана overlay-ді жабамыз
      if (state.overlay === 'waiting') {
        return {
          ...state,
          overlay: 'idle',
          invite: null,
          lastError: msg.type === 'invite:declined' ? 'declined' : 'expired',
        };
      }
      // қорғаныс: кіріс шақыру серверде өшсе — жергілікті де тазалаймыз
      if (msg.inviteId && state.incomingInvite?.inviteId === msg.inviteId) {
        return { ...state, incomingInvite: null };
      }
      return state;
    }

    case 'invite:incoming':
      return {
        ...state,
        incomingInvite: {
          inviteId: msg.inviteId,
          from: msg.from,
          config: msg.config,
          expiresAt: msg.expiresAt,
        },
      };

    case 'invite:cancelled':
      return { ...state, incomingInvite: null };

    case 'invite:error': {
      const next = { ...state, lastError: msg.code || 'error' };
      if (state.overlay === 'waiting') {
        next.overlay = 'idle';
        next.invite = null;
      }
      return next;
    }

    case 'match:start':
      return {
        ...state,
        overlay: 'countdown',
        invite: null,
        incomingInvite: null,
        match: {
          matchId: msg.matchId,
          opponent: msg.opponent,
          round: 0,
          total: msg.totalRounds,
          question: null,
          deadline: null,
          revealPayload: null,
          scores: { you: 0, opponent: 0 },
          opponentDisconnected: null,
          endPayload: null,
          opponentAnswered: false,
          countdownEndsAt: msg.countdownEndsAt,
        },
      };

    case 'round:start': {
      if (!state.match) return state;
      return {
        ...state,
        overlay: 'round',
        match: {
          ...state.match,
          round: msg.round,
          total: msg.total,
          question: msg.question,
          deadline: msg.deadline,
          revealPayload: null,
          opponentAnswered: false,
        },
      };
    }

    case 'round:opponent_answered': {
      if (!state.match) return state;
      return { ...state, match: { ...state.match, opponentAnswered: true } };
    }

    case 'round:result': {
      if (!state.match) return state;
      return {
        ...state,
        overlay: 'reveal',
        match: {
          ...state.match,
          scores: msg.scores,
          revealPayload: {
            correctOption: msg.correctOption,
            yourAnswer: msg.yourAnswer,
            yourCorrect: msg.yourCorrect,
            opponentCorrect: msg.opponentCorrect,
            nextRoundAt: msg.nextRoundAt,
          },
        },
      };
    }

    case 'match:opponent_disconnected': {
      if (!state.match) return state;
      return { ...state, match: { ...state.match, opponentDisconnected: msg.graceEndsAt } };
    }

    case 'match:opponent_reconnected': {
      if (!state.match) return state;
      return {
        ...state,
        match: { ...state.match, opponentDisconnected: null, deadline: msg.deadline },
      };
    }

    case 'match:snapshot': {
      const overlay = SNAPSHOT_OVERLAY[msg.phase];
      if (!overlay) return state;
      return {
        ...state,
        overlay,
        invite: null,
        match: {
          matchId: msg.matchId,
          opponent: msg.opponent,
          round: msg.round,
          total: msg.total,
          question: msg.question ?? null,
          deadline: msg.deadline ?? null,
          revealPayload: msg.revealPayload ?? null,
          scores: msg.scores,
          opponentDisconnected: null,
          endPayload: null,
          opponentAnswered: false,
          countdownEndsAt: msg.countdownEndsAt ?? null,
        },
      };
    }

    case 'match:end':
      return {
        ...state,
        overlay: 'end',
        invite: null,
        match: {
          ...(state.match || {}),
          scores: msg.scores,
          endPayload: {
            outcome: msg.outcome,
            reason: msg.reason,
            scores: msg.scores,
            yourPoints: msg.yourPoints,
            battleId: msg.battleId,
          },
        },
      };

    case 'match:none':
      if (MATCH_PHASES.includes(state.overlay)) return { ...state, overlay: 'lost' };
      return state;

    case 'error':
      if (msg.code === 'persist_failed' && MATCH_PHASES.includes(state.overlay)) {
        return { ...state, overlay: 'lost', lastError: 'persist_failed' };
      }
      return { ...state, lastError: msg.code || 'error' };

    // hello, pong — reducer-ге әсер етпейді (offset socket.js-те жаңарады)
    default:
      return state;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'WS_STATUS':
      return { ...state, wsStatus: action.status };
    case 'MESSAGE':
      return handleMessage(state, action.msg);
    case 'CANCEL_INVITE':
      if (state.overlay !== 'waiting') return state;
      return { ...state, overlay: 'idle', invite: null };
    case 'DECLINE_INVITE':
      return { ...state, incomingInvite: null };
    case 'CLOSE_OVERLAY':
      if (state.overlay !== 'end' && state.overlay !== 'lost') return state;
      return { ...state, overlay: 'idle', match: null };
    case 'CLEAR_ERROR':
      return { ...state, lastError: null };
    default:
      return state;
  }
}

export default function OnlineProvider({ me, children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const token = getAuthHeader();
    if (!token) return undefined;
    socket.connect(token, {
      onMessage: (msg) => dispatch({ type: 'MESSAGE', msg }),
      onStatus: (s) => dispatch({ type: 'WS_STATUS', status: s }),
    });
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (socket.isOpen()) {
        // ұйықтап оянған телефон — серверден күйді қайта сұраймыз
        socket.send({ type: 'match:state' });
      } else {
        socket.reconnectNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      socket.disconnect();
    };
  }, []);

  const refreshPresence = useCallback(() => {
    socket.send({ type: 'presence:get' });
  }, []);

  const sendInvite = useCallback((toStudentId, config) => {
    socket.send({ type: 'invite:send', toStudentId, config });
  }, []);

  const cancelInvite = useCallback(() => {
    const inviteId = stateRef.current.invite?.inviteId;
    if (inviteId) socket.send({ type: 'invite:cancel', inviteId });
    dispatch({ type: 'CANCEL_INVITE' });
  }, []);

  const acceptInvite = useCallback(() => {
    const inviteId = stateRef.current.incomingInvite?.inviteId;
    if (inviteId) socket.send({ type: 'invite:accept', inviteId });
  }, []);

  const declineInvite = useCallback(() => {
    const inviteId = stateRef.current.incomingInvite?.inviteId;
    if (inviteId) socket.send({ type: 'invite:decline', inviteId });
    dispatch({ type: 'DECLINE_INVITE' });
  }, []);

  const sendAnswer = useCallback((matchId, round, optionIndex) => {
    socket.send({ type: 'round:answer', matchId, round, optionIndex });
  }, []);

  const leaveMatch = useCallback(() => {
    const matchId = stateRef.current.match?.matchId;
    if (matchId) socket.send({ type: 'match:leave', matchId });
    // overlay сақталады — сервер match:end (forfeit_you) жібереді
  }, []);

  const closeOverlay = useCallback(() => {
    dispatch({ type: 'CLOSE_OVERLAY' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      me,
      refreshPresence,
      sendInvite,
      cancelInvite,
      acceptInvite,
      declineInvite,
      sendAnswer,
      leaveMatch,
      closeOverlay,
      clearError,
      serverNowMs: socket.serverNowMs,
    }),
    [state, me, refreshPresence, sendInvite, cancelInvite, acceptInvite, declineInvite, sendAnswer, leaveMatch, closeOverlay, clearError],
  );

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}
