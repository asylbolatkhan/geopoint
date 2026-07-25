import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auth } from './authMiddleware.js';
import { authRouter } from './routes/auth.js';
import { soloRouter } from './routes/solo.js';
import { battlesRouter, expireDueBattles } from './routes/battles.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { adminRouter } from './routes/admin.js';
import { profileRouter } from './routes/profile.js';
import { startBot } from './bot.js';
import { maybeAnnounceMonthly } from './announcements.js';
import { attachWsServer } from './online/wsServer.js';
import { onlineHooks } from './online/handler.js';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', auth);
app.use('/api', authRouter);
app.use('/api/solo', soloRouter);
app.use('/api/battles', battlesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/profile', profileRouter);

// Mini App статикасы (production-да tma/dist бар болса)
const tmaDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tma/dist');
if (fs.existsSync(tmaDist)) {
  app.use(express.static(tmaDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(tmaDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal' });
});

const port = process.env.PORT || 3001;
const server = app.listen(port, () => console.log(`geo-server listening on :${port}`));
startBot();
attachWsServer(server, onlineHooks);

function sweep() {
  expireDueBattles().catch((e) => console.error('expiry sweep failed:', e.message));
  maybeAnnounceMonthly().catch((e) => console.error('monthly announcement failed:', e.message));
}

setInterval(sweep, 30 * 60 * 1000);
sweep();
