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
