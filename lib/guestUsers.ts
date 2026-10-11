import { randomUUID } from 'node:crypto'
import { queryRow } from './db'

/** Guest rows are marked by their discord_id, the way draft bots use `bot_*`. Real Discord ids are numeric. */
export const GUEST_DISCORD_PREFIX = 'guest_'

/**
 * The guest user for a signed-out solo draft. Reuses the row the guest cookie
 * already names, if it is still a guest row; otherwise creates a new one. Guest
 * rows carry no email, no Discord account and no privileges (the users columns
 * default to false), and nobody can sign in as one.
 */
export async function ensureGuestUser(existingGuestId: string | null): Promise<string> {
  if (existingGuestId) {
    const row = await queryRow('SELECT id FROM users WHERE id = $1 AND starts_with(discord_id, $2)', [existingGuestId, GUEST_DISCORD_PREFIX])
    if (row) return String(row.id)
  }
  const row = await queryRow('INSERT INTO users (username, discord_id) VALUES ($1, $2) RETURNING id', ['Guest', `${GUEST_DISCORD_PREFIX}${randomUUID()}`])
  if (!row) throw new Error('Could not start a guest draft')
  return String(row.id)
}
