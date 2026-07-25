// WS транспорт қабаты: аутентификация, heartbeat, hello/ping/presence.
// Ойын логикасы жоқ — Task 4 handler.js осы модульдің hook-тарын толтырады.
import { WebSocketServer } from 'ws';
import { query } from '../db.js';
import * as registry from './registry.js';

const HEARTBEAT_MS = 25000;

function safeParse(raw) {
  try {
    const msg = JSON.parse(raw);
    return msg && typeof msg === 'object' && typeof msg.type === 'string' ? msg : null;
  } catch {
    return null; // бұзық JSON еленбейді
  }
}

/**
 * server: app.listen() қайтарған http.Server.
 * hooks (барлығы міндетті емес, Task 4 толтырады):
 *   onOpen(student, ws)             — тіркелгеннен, hello жіберілгеннен кейін
 *   onMessage(student, ws, msg)     — ping/presence:get-тен басқа кез келген танылған JSON хабарлама
 *   onClose(student, ws)            — сокет жабылғанда, ТЕК registry-ден іс жүзінде
 *                                      өшірілсе (яғни ws сол студенттің ЕҢ СОҢҒЫ сокеті
 *                                      болса); екінші құрылғыдан қосылу кезінде ескі
 *                                      сокеттің close-ы бойынша шақырылмайды.
 */
export function attachWsServer(server, hooks = {}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    // Async auth-тан бұрын: клиент ECONNRESET жасаса (мобильде жиі), тыңдаушысыз
    // 'error' оқиғасы бүкіл процесті құлатады. Сонымен қатар төмендегі 401 write
    // жойылған сокетке жазып қалмас үшін де қорғаныс.
    socket.on('error', () => {});
    // ЕСКЕРТУ: req.url ЕШҚАШАН логталмайды — құрамында бір реттік билет бар.
    let pathname = '';
    let ticket = '';
    try {
      const url = new URL(req.url, 'http://internal');
      pathname = url.pathname;
      ticket = url.searchParams.get('ticket') || '';
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Билет бір реттік: жарамды/жарамсыз болса да бірден өшіріледі — replay
    // мүмкін емес. Билетті /api/online/ticket (requireApproved) береді.
    const entry = registry.tickets.get(ticket);
    if (ticket) registry.tickets.delete(ticket);
    if (!entry || entry.expiresAt < Date.now()) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Студентті жаңадан жүктейміз: билет берілгеннен кейін статус өзгеруі мүмкін.
    let student = null;
    try {
      const { rows } = await query('SELECT * FROM students WHERE id = $1', [entry.studentId]);
      student = rows[0] || null;
    } catch {
      student = null;
    }
    if (!student || student.status !== 'approved') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.student = student;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const student = ws.student;
    ws.isAlive = true;
    // Бұзық фрейм/UTF-8/протокол бұзылысы 'error' жібереді — тыңдаушысыз процесс құлайды.
    ws.on('error', () => {});
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    registry.register(student.id, ws);

    ws.send(JSON.stringify({
      type: 'hello',
      studentId: student.id,
      serverNow: Date.now(),
      activeMatch: registry.matchByStudent.has(student.id),
    }));

    hooks.onOpen?.(student, ws);

    ws.on('message', (raw) => {
      const msg = safeParse(raw.toString());
      if (!msg) return; // бұзық JSON / белгісіз пішін еленбейді

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', serverNow: Date.now() }));
        return;
      }
      if (msg.type === 'presence:get') {
        ws.send(JSON.stringify({ type: 'presence:list', online: registry.onlineIds() }));
        return;
      }
      hooks.onMessage?.(student, ws, msg);
    });

    ws.on('close', () => {
      // unregister() тек ws әлі де студенттің АҒЫМДАҒЫ сокеті болса ғана true
      // қайтарады. Екінші құрылғыдан қосылу кезінде register() ескі сокетті
      // 4001-мен жабады — сол ескі сокеттің 'close' оқиғасы бойынша onClose
      // шақырылмауы керек (студент әлі желіде, жаңа сокетпен) — болмаса,
      // Task 4-тегі onClose→applyDisconnect идиомасы белсенді матчты
      // қателесіп «үзілді» деп таныр еді.
      if (registry.unregister(student.id, ws)) {
        hooks.onClose?.(student, ws);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
