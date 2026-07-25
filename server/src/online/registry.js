// Онлайн батл registry: presence + Task 4 матч-оркестрациясы үшін ортақ in-memory
// күй. Жалғыз процесс/бір Railway инстансы — қосымша координация қажет емес.

// studentId -> ws (ағымдағы белсенді сокет)
export const sockets = new Map();

// WS қосылуға арналған бір реттік, қысқа мерзімді билеттер:
// ticket -> {studentId, expiresAt}. Билет /api/online/ticket арқылы беріледі,
// upgrade кезінде бірден өшіріледі (қайта қолдануға болмайды).
export const tickets = new Map();

// Task 4: inviteId -> invite, matchId -> {state, timers}, studentId -> matchId
export const invites = new Map();
export const matches = new Map();
export const matchByStudent = new Map();

// Студентті жаңа сокетпен тіркейді. Сол студенттің ескі сокеті болса (басқа
// құрылғыдан қосылу) — 4001 кодымен жабылады.
export function register(studentId, ws) {
  const old = sockets.get(studentId);
  if (old && old !== ws) {
    try {
      old.close(4001, 'replaced');
    } catch {
      // ескі сокет жабылмай қалса да жаңа тіркеуге кедергі жасамайды
    }
  }
  sockets.set(studentId, ws);
}

// Тек ws әлі де сол студенттің ағымдағы сокеті болса ғана өшіреді (ескі,
// орнын басылған сокеттің close оқиғасы жаңа тіркеуді қателесіп өшірмеуі үшін).
// Іс жүзінде өшірсе true, әйтпесе (ws бұрыннан ауыстырылған) false қайтарады —
// шақырушы жаққа осы сокет әлі де студенттің "ағымдағысы" болғанын білдіреді.
export function unregister(studentId, ws) {
  if (sockets.get(studentId) === ws) {
    sockets.delete(studentId);
    return true;
  }
  return false;
}

export function isOnline(studentId) {
  return sockets.has(studentId);
}

export function onlineIds() {
  return [...sockets.keys()];
}
