// WS клиент — модуль-синглтон. Reconnect backoff + app-деңгейлі ping/pong + serverOffset.

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;

let ws = null;
let token = null;
let onMessage = null;
let onStatus = null;
let attempt = 0;          // сәтті ашылғанда 0-ге қайтады
let reconnectTimer = null;
let pingTimer = null;
let pongTimer = null;
let serverOffset = 0;     // serverNow - Date.now()
let manualClose = false;

function status(s) {
  if (onStatus) onStatus(s);
}

function backoffDelay() {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
  return Math.max(250, Math.round(base + jitter));
}

function stopPing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'ping' }));
    if (pongTimer) clearTimeout(pongTimer);
    pongTimer = setTimeout(() => {
      // pong келмеді → байланыс өлі деп есептеп, мәжбүрлеп жабамыз (onclose reconnect бастайды)
      pongTimer = null;
      try { ws?.close(); } catch { /* elective */ }
    }, PONG_TIMEOUT_MS);
  }, PING_INTERVAL_MS);
}

function scheduleReconnect() {
  if (manualClose || reconnectTimer) return;
  const delay = backoffDelay();
  attempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, delay);
}

function open() {
  if (manualClose || !token) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  status('connecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let sock;
  try {
    sock = new WebSocket(`${proto}://${location.host}/ws?auth=${encodeURIComponent(token)}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = sock;

  sock.onopen = () => {
    if (sock !== ws) return;
    attempt = 0;
    startPing();
    status('open');
  };

  sock.onmessage = (ev) => {
    if (sock !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (typeof msg.serverNow === 'number') serverOffset = msg.serverNow - Date.now();
    if (msg.type === 'pong' && pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    if (onMessage) onMessage(msg);
  };

  sock.onclose = () => {
    if (sock !== ws) return;
    ws = null;
    stopPing();
    status('closed');
    scheduleReconnect();
  };

  sock.onerror = () => { /* onclose бәрібір келеді */ };
}

export function connect(tok, { onMessage: msgCb, onStatus: statusCb }) {
  token = tok;
  onMessage = msgCb;
  onStatus = statusCb;
  manualClose = false;
  attempt = 0;
  open();
}

export function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return; // үнсіз тасталады
  try { ws.send(JSON.stringify(obj)); } catch { /* elective */ }
}

export function disconnect() {
  manualClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopPing();
  const sock = ws;
  ws = null;
  if (sock) {
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
    try { sock.close(); } catch { /* elective */ }
  }
  onMessage = null;
  onStatus = null;
}

export function isOpen() {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

// Visibility-де қолданылады: backoff reset + бірден қосылу әрекеті
export function reconnectNow() {
  if (manualClose || !token) return;
  attempt = 0;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  open();
}

export function serverNowMs() {
  return Date.now() + serverOffset;
}
