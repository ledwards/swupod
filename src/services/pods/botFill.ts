import { query, queryRows } from '../../../lib/db'

// The same eight stable bot accounts the lobby's Add Bot uses (app/api/draft/[shareId]/dev/add-bots).
const BOTS = [
  { name: 'DraftBot Alpha', discordId: 'bot_alpha' }, { name: 'DraftBot Beta', discordId: 'bot_beta' },
  { name: 'DraftBot Gamma', discordId: 'bot_gamma' }, { name: 'DraftBot Delta', discordId: 'bot_delta' },
  { name: 'DraftBot Epsilon', discordId: 'bot_epsilon' }, { name: 'DraftBot Zeta', discordId: 'bot_zeta' },
  { name: 'DraftBot Eta', discordId: 'bot_eta' }, { name: 'DraftBot Theta', discordId: 'bot_theta' },
]
const AVATARS = [0, 1, 2, 3, 4].map(n => `https://cdn.discordapp.com/embed/avatars/${n}.png`)

/** Seats still empty when the host starts, highest seat first, as Add Bot fills them. */
export function seatsToFill(maxPlayers: number, taken: number[]): number[] {
  const used = new Set(taken)
  const free: number[] = []
  for (let seat = maxPlayers; seat >= 1; seat--) if (!used.has(seat)) free.push(seat)
  return free
}

/** Create a Pod's "Fill with bots": every empty seat gets a bot when the draft starts. Returns how many joined. */
export async function fillEmptySeatsWithBots(podId: string, maxPlayers: number): Promise<number> {
  const players = await queryRows(`SELECT pp.seat_number,u.discord_id FROM pod_players pp LEFT JOIN users u ON u.id=pp.user_id WHERE pp.pod_id=$1`, [podId])
  const seated = new Set(players.map(p => p.discord_id))
  const free = BOTS.filter(b => !seated.has(b.discordId))
  const seats = seatsToFill(maxPlayers, players.map(p => Number(p.seat_number)))
  const count = Math.min(seats.length, free.length)
  for (let i = 0; i < count; i++) {
    const bot = free[i]!
    const user = await query(`INSERT INTO users (username,avatar_url,discord_id) VALUES ($1,$2,$3)
      ON CONFLICT (discord_id) DO UPDATE SET username=$1,avatar_url=$2 RETURNING id`, [bot.name, AVATARS[BOTS.indexOf(bot) % AVATARS.length], bot.discordId])
    await query(`INSERT INTO pod_players (pod_id,user_id,seat_number,pick_status,drafted_cards,leaders,drafted_leaders,is_bot)
      VALUES ($1,$2,$3,'waiting','[]','[]','[]',true)`, [podId, user.rows[0]!.id, seats[i]])
  }
  if (count) await query('UPDATE pods SET current_players=current_players+$1,state_version=state_version+1 WHERE id=$2', [count, podId])
  return count
}
