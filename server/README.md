# GeoVictorina Server

Backend for the Telegram Mini App: Express API + PostgreSQL + grammY bot.

## Local development

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` — PostgreSQL connection string
   - `BOT_TOKEN` — from @BotFather (optional locally; bot disabled if empty)
   - `ADMIN_TG_ID` — the teacher's Telegram user id
   - `DEV_AUTH=1` — enables `Authorization: dev <tgId>` header (never in production)
2. `npm install`
3. `npm run migrate` — apply migrations
4. `npm run seed` — create school (+ classes from `SEED_CLASSES=7Ә,8А,...`)
5. `npm run dev`

## Tests

`npm test` — pure-logic unit tests (no DB needed).

## Smoke test (needs running server + DB, DEV_AUTH=1, ADMIN_TG_ID=1)

`node scripts/smoke.js`

## Points rules

All tunable values live in `src/config.js`.

## Production (Railway)

For the full teacher-friendly, step-by-step deployment guide (Kazakh) — including BotFather setup, Railway service configuration, environment variables, one-off seeding, and a verification checklist — see **[../DEPLOY.md](../DEPLOY.md)**.

Quick reference:

- Build command: `npm ci --prefix tma && npm run build --prefix tma && npm ci --prefix server`
- Start command: `npm run start:prod --prefix server` (runs `scripts/migrate.js` then starts the server, which also serves the built `tma/dist` statics)
- Required env vars: `DATABASE_URL`, `BOT_TOKEN`, `ADMIN_TG_ID`, `WEBAPP_URL`, `SCHOOL_NAME`, `SEED_CLASSES`, `NODE_ENV=production`. Do **not** set `DEV_AUTH` in production.
- Seed once after first deploy: `npm run seed --prefix server` (via Railway shell, or locally with `DATABASE_URL` set).
