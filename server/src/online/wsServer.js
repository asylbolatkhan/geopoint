// WS транспорт қабаты: аутентификация, heartbeat, hello/ping/presence.
// Ойын логикасы жоқ — Task 4 handler.js осы модульдің hook-тарын толтырады.
import { WebSocketServer } from 'ws';
import { resolveStudentFromAuthToken } from '../authMiddleware.js';
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
 *   onClose(student, ws)            — сокет жабылғанда (registry-ден өшірілгеннен кейін)
 */
export function attachWsServer(server, hooks = {}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    // ЕСКЕРТУ: req.url ЕШҚАШАН логталмайды — құрамында auth токені бар.
    let pathname = '';
    let token = '';
    try {
      const url = new URL(req.url, 'http://internal');
      pathname = url.pathname;
      token = decodeURIComponent(url.searchParams.get('auth') || '');
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    let student = null;
    try {
      const resolved = token ? await resolveStudentFromAuthToken(token) : null;
      student = resolved?.student || null;
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
      registry.unregister(student.id, ws);
      hooks.onClose?.(student, ws);
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
