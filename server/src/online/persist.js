import { withTransaction } from '../db.js';
import { completedPointsEvents } from '../battleLogic.js';
import { applyWhoEvents } from '../routes/battles.js';

// Аяқталған онлайн батлды бір транзакцияда жазу: INSERT battles → ұпай оқиғалары.
// challengerResult/opponentResult: {correct, durationMs} — асинхронды батлдармен бірдей пішін.
export async function persistOnlineBattle({
  challengerId, opponentId, config, questions, challengerResult, opponentResult, outcome,
}) {
  return withTransaction(async (client) => {
    const winnerId =
      outcome === 'draw' ? null : outcome === 'challenger' ? challengerId : opponentId;
    const { rows } = await client.query(
      `INSERT INTO battles
         (challenger_id, opponent_id, config, questions,
          challenger_result, opponent_result, status, mode, winner_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'online', $7, now())
       RETURNING id`,
      [
        challengerId, opponentId, config, JSON.stringify(questions),
        challengerResult, opponentResult, winnerId,
      ]
    );
    const battleId = rows[0].id;
    const events = completedPointsEvents(outcome, challengerResult, opponentResult);
    await applyWhoEvents(
      client, events,
      { id: battleId, challenger_id: challengerId, opponent_id: opponentId }
    );
    return { battleId, events };
  });
}
