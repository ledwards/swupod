// Discord API utilities for beta access role checking
// Requires: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_FRIEND_OF_THE_POD_ROLE_ID

const BOT_TOKEN = process.env['DISCORD_BOT_TOKEN']
const GUILD_ID = process.env['DISCORD_GUILD_ID']
const FRIEND_ROLE_ID = process.env['DISCORD_FRIEND_OF_THE_POD_ROLE_ID']
const BETA_TESTER_ROLE_ID = process.env['DISCORD_BETA_TESTER_ROLE_ID']

/**
 * Check if a Discord user has the "Friend of the Pod" role in the server.
 * Returns false gracefully if env vars are not configured, user is not
 * in the server, or the Discord API is unavailable.
 */
export async function isPatron(discordId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID || !FRIEND_ROLE_ID) {
    return false
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
        },
      }
    )

    if (!response.ok) {
      // 404 = user not in server, other errors = API issue
      return false
    }

    const member = await response.json()
    return Array.isArray(member.roles) && member.roles.includes(FRIEND_ROLE_ID)
  } catch {
    // Network error, Discord API down, etc.
    return false
  }
}

/**
 * Check if a Discord user is a member of the server.
 * Returns false gracefully if env vars are not configured or API is unavailable.
 */
export async function isGuildMember(discordId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID) {
    console.error('isGuildMember: missing env vars', { hasBotToken: !!BOT_TOKEN, hasGuildId: !!GUILD_ID })
    return false
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
        },
      }
    )

    if (!response.ok) {
      const body = await response.text()
      console.error('isGuildMember: Discord API error', response.status, body)
    }

    return response.ok
  } catch (err) {
    console.error('isGuildMember: fetch error', err)
    return false
  }
}

/**
 * Add a role to a Discord user in the server.
 * Returns true if successful, false on any error.
 */
export async function addRole(discordId: string, roleId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID) {
    console.error('addRole: missing env vars', { hasBotToken: !!BOT_TOKEN, hasGuildId: !!GUILD_ID })
    return false
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
        },
      }
    )

    if (!response.ok && response.status !== 204) {
      const body = await response.text()
      console.error('addRole: Discord API error', { discordId, roleId, status: response.status, body })
    }

    return response.ok || response.status === 204
  } catch (err) {
    console.error('addRole: fetch error', { discordId, roleId, error: err })
    return false
  }
}

/**
 * Remove a role from a Discord user in the server.
 * Returns true if successful, false on any error.
 */
export async function removeRole(discordId: string, roleId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID) {
    console.error('removeRole: missing env vars', { hasBotToken: !!BOT_TOKEN, hasGuildId: !!GUILD_ID })
    return false
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
        },
      }
    )

    if (!response.ok && response.status !== 204) {
      const body = await response.text()
      console.error('removeRole: Discord API error', { discordId, roleId, status: response.status, body })
    }

    return response.ok || response.status === 204
  } catch (err) {
    console.error('removeRole: fetch error', { discordId, roleId, error: err })
    return false
  }
}

/**
 * Add the "Friend of the Pod" patron role to a Discord user.
 */
export async function addPatronRole(discordId: string): Promise<boolean> {
  if (!FRIEND_ROLE_ID) {
    return false
  }
  return addRole(discordId, FRIEND_ROLE_ID)
}

/**
 * Remove the "Friend of the Pod" patron role from a Discord user.
 */
export async function removePatronRole(discordId: string): Promise<boolean> {
  if (!FRIEND_ROLE_ID) {
    return false
  }
  return removeRole(discordId, FRIEND_ROLE_ID)
}

/**
 * Add the beta tester role to a Discord user.
 * No-op if DISCORD_BETA_TESTER_ROLE_ID is not configured.
 */
export async function addBetaTesterRole(discordId: string): Promise<boolean> {
  if (!BETA_TESTER_ROLE_ID) {
    return false
  }
  return addRole(discordId, BETA_TESTER_ROLE_ID)
}
