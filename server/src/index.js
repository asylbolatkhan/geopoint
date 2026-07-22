import 'dotenv/config';
import express from 'express';
import { auth } from './authMiddleware.js';
import { authRouter } from './routes/auth.js';
import { soloRouter } from './routes/solo.js';
import { startBot } from './bot.js';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', auth);
app.use('/api', authRouter);
app.use('/api/solo', soloRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`geo-server listening on :${port}`));
startBot();
