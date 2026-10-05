/** Only trusted SQL aliases supplied by our queries. AI games start alongside the human's
 * corresponding game in the same round. A decided human match releases the rest,
 * and rounds after elimination (without a human pairing) can finish normally. */
export function soloGameReadySql(game: 'g' | 'pending') {
 return `NOT EXISTS (
  SELECT 1 FROM ptp_solo_ai_matches human_match
  JOIN ptp_solo_ai_matches bot_match ON bot_match.id=${game}.match_id
  WHERE human_match.run_id=${game}.run_id AND human_match.round=bot_match.round
   AND (human_match.player1='human' OR human_match.player2='human')
   AND bot_match.player1<>'human' AND bot_match.player2<>'human'
   AND human_match.winner IS NULL
   AND NOT EXISTS (SELECT 1 FROM ptp_solo_ai_games human_game
    WHERE human_game.match_id=human_match.id AND human_game.game_no=${game}.game_no AND human_game.requested=true)
 )`
}
