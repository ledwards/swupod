// Discord LFG (Looking for Group) integration
// Posts pod announcements to #draft-now / #sealed-now channels,
// creates threads for pod chat, and manages webhooks for user messages.

import { queryRow, query } from '@/lib/db'
import { captureDeckImage } from '@/lib/deckScreenshot'

const BOT_TOKEN = process.env['DISCORD_BOT_TOKEN']
const DRAFT_NOW_CHANNEL_ID = process.env['DISCORD_DRAFT_NOW_CHANNEL_ID']
const SEALED_NOW_CHANNEL_ID = process.env['DISCORD_SEALED_NOW_CHANNEL_ID']
const DRAFTBOTS_CHANNEL_ID = process.env['DISCORD_DRAFTBOTS_CHANNEL_ID']
const POOL_DISCUSSION_CHANNEL_ID = process.env['DISCORD_POOL_DISCUSSION_CHANNEL_ID']
const APP_URL = process.env['APP_URL'] || process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000'
const DISCORD_API = 'https://discord.com/api/v10'

interface PodInfo {
  id: string
  share_id: string
  set_code: string
  set_name: string
  name: string | null
  max_players: number
  current_players: number
  pod_type?: string
  is_public?: boolean
}

interface DiscordIds {
  messageId: string
  threadId: string
  webhookId: string
  webhookToken: string
}

// === Internal helpers ===

function getChannelId(podType: string): string | undefined {
  return podType === 'sealed' ? SEALED_NOW_CHANNEL_ID : DRAFT_NOW_CHANNEL_ID
}

async function discordFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function buildPodEmbed(pod: PodInfo, hostUsername: string, playerNames: string[]): Record<string, unknown> {
  const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
  const emoji = pod.pod_type === 'sealed' ? '🐳' : '🐋'
  const joinUrl = pod.pod_type === 'sealed'
    ? `${APP_URL}/sealed/${pod.share_id}`
    : `${APP_URL}/draft/${pod.share_id}`

  // Build player list: crown on its own line, other players on next line
  const otherPlayers = playerNames.filter(n => n !== hostUsername)
  const playerLines = [`👑 ${hostUsername}`]
  if (otherPlayers.length > 0) {
    playerLines.push(otherPlayers.join(', '))
  }

  return {
    title: `${emoji} ${pod.name || `${pod.set_name} ${podType}`}`,
    description: [
      `**Set:** ${pod.set_name} (${pod.set_code})`,
      `**Seats:** ${pod.current_players}/${pod.max_players}`,
      '',
      ...playerLines,
      '',
      `👉 **[Join ${podType}](${joinUrl})**`,
    ].join('\n'),
    color: 0x2ECC71, // Green
    timestamp: new Date().toISOString(),
  }
}

function buildStartedEmbed(pod: PodInfo, hostUsername: string, playerNames: string[]): Record<string, unknown> {
  const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
  const emoji = pod.pod_type === 'sealed' ? '🐳' : '🐋'

  // Build player list: crown on its own line, other players on next line
  const otherPlayers = playerNames.filter(n => n !== hostUsername)
  const playerLines = [`👑 ${hostUsername}`]
  if (otherPlayers.length > 0) {
    playerLines.push(otherPlayers.join(', '))
  }

  return {
    title: `${emoji} ${pod.name || `${pod.set_name} ${podType}`}`,
    description: [
      `**Set:** ${pod.set_name} (${pod.set_code})`,
      `**Seats:** ${pod.current_players}/${pod.max_players}`,
      '',
      ...playerLines,
      '',
      `🚀 **Started!**`,
    ].join('\n'),
    color: 0x3498DB, // Blue
    timestamp: new Date().toISOString(),
  }
}

function buildCancelledEmbed(pod: PodInfo, hostUsername: string, playerNames: string[]): Record<string, unknown> {
  const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'

  // Build player list: crown on its own line, other players on next line
  const otherPlayers = playerNames.filter(n => n !== hostUsername)
  const playerLines = [`👑 ${hostUsername}`]
  if (otherPlayers.length > 0) {
    playerLines.push(otherPlayers.join(', '))
  }

  return {
    title: `❌ ~~${pod.name || `${pod.set_name} ${podType}`}~~`,
    description: [
      `**Set:** ${pod.set_name} (${pod.set_code})`,
      `**Seats:** ${pod.current_players}/${pod.max_players}`,
      '',
      ...playerLines,
      '',
      `❌ **Cancelled**`,
    ].join('\n'),
    color: 0xE74C3C, // Red
    timestamp: new Date().toISOString(),
  }
}

// === Public API ===

/**
 * Post a new pod announcement to the appropriate Discord channel,
 * create a thread for chat, create a webhook for user messages,
 * and store all IDs on the pod.
 *
 * Returns the Discord IDs or null if posting failed.
 */
export async function postPodCreated(
  pod: PodInfo,
  hostUsername: string
): Promise<DiscordIds | null> {
  if (!BOT_TOKEN) return null
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return null

  try {
    // 1. Post embed message to channel
    const msgRes = await discordFetch(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        embeds: [buildPodEmbed(pod, hostUsername, [hostUsername])],
      }),
    })

    if (!msgRes.ok) {
      console.error('[Discord LFG] Failed to post embed:', msgRes.status, await msgRes.text())
      return null
    }

    const msg = await msgRes.json()
    const messageId = msg.id

    // 2. Create a thread off the embed message
    const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
    const threadName = pod.name || `${pod.set_name} ${podType}`
    const threadRes = await discordFetch(`/channels/${channelId}/messages/${messageId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        name: threadName.slice(0, 100), // Discord limit
        auto_archive_duration: 1440, // 24 hours
      }),
    })

    if (!threadRes.ok) {
      console.error('[Discord LFG] Failed to create thread:', threadRes.status, await threadRes.text())
      return null
    }

    const thread = await threadRes.json()
    const threadId = thread.id

    // 3. Create a webhook on the parent channel (not the thread — Discord doesn't allow
    //    webhooks directly on threads). We post to threads via ?thread_id= param.
    let webhookId: string | null = null
    let webhookToken: string | null = null

    const webhookRes = await discordFetch(`/channels/${channelId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Protect the Pod Chat',
      }),
    })

    if (webhookRes.ok) {
      const webhook = await webhookRes.json()
      webhookId = webhook.id
      webhookToken = webhook.token
    } else {
      console.error('[Discord LFG] Failed to create webhook:', webhookRes.status, await webhookRes.text())
      // Continue — thread still usable for bot messages and history
    }

    // 4. Post initial system message in thread
    await discordFetch(`/channels/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `💬 Pod chat for **${threadName}**. Messages here sync with the web app!`,
      }),
    }).catch(() => {}) // Non-critical

    // 5. Store IDs on the pod (always store thread/message even if webhook failed)
    const ids: DiscordIds = {
      messageId,
      threadId,
      webhookId: webhookId || '',
      webhookToken: webhookToken || '',
    }

    await query(
      `UPDATE pods SET
        discord_message_id = $1,
        discord_thread_id = $2,
        discord_webhook_id = $3,
        discord_webhook_token = $4
       WHERE id = $5`,
      [ids.messageId, ids.threadId, webhookId, webhookToken, pod.id]
    )

    return ids
  } catch (err) {
    console.error('[Discord LFG] Error posting pod created:', err)
    return null
  }
}

/**
 * Post a player joined message in the pod's Discord thread.
 */
export async function postPlayerJoined(threadId: string, username: string): Promise<void> {
  if (!BOT_TOKEN || !threadId) return
  try {
    await discordFetch(`/channels/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `📥 **${username}** joined the pod.`,
      }),
    })
  } catch (err) {
    console.error('[Discord LFG] Error posting player joined:', err)
  }
}

/**
 * Post a player left message in the pod's Discord thread.
 */
export async function postPlayerLeft(threadId: string, username: string): Promise<void> {
  if (!BOT_TOKEN || !threadId) return
  try {
    await discordFetch(`/channels/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `📤 **${username}** left the pod.`,
      }),
    })
  } catch (err) {
    console.error('[Discord LFG] Error posting player left:', err)
  }
}

/**
 * Update the pod embed with current player list and count.
 */
export async function updatePodEmbed(
  pod: PodInfo,
  hostUsername: string,
  playerNames: string[]
): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return

  // Look up the discord_message_id from the pod
  const podRow = await queryRow(
    'SELECT discord_message_id FROM pods WHERE id = $1',
    [pod.id]
  )
  if (!podRow?.discord_message_id) return

  try {
    await discordFetch(`/channels/${channelId}/messages/${podRow.discord_message_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        embeds: [buildPodEmbed(pod, hostUsername, playerNames)],
      }),
    })
  } catch (err) {
    console.error('[Discord LFG] Error updating pod embed:', err)
  }
}

/**
 * Edit the embed to show that the pod has started (remove join link).
 */
export async function markPodStarted(
  pod: PodInfo,
  hostUsername: string,
  playerNames: string[]
): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return

  const podRow = await queryRow(
    'SELECT discord_message_id, discord_thread_id FROM pods WHERE id = $1',
    [pod.id]
  )
  if (!podRow?.discord_message_id) return

  try {
    // Update embed
    await discordFetch(`/channels/${channelId}/messages/${podRow.discord_message_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        embeds: [buildStartedEmbed(pod, hostUsername, playerNames)],
      }),
    })

    // Post system message in thread
    if (podRow.discord_thread_id) {
      const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
      const podLabel = pod.name || `${pod.set_name} ${podType}`
      await discordFetch(`/channels/${podRow.discord_thread_id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: `🚀 **${podLabel}** has started! Good luck everyone!`,
        }),
      })
    }
  } catch (err) {
    console.error('[Discord LFG] Error marking pod started:', err)
  }
}

/**
 * Edit the embed to show that the pod was cancelled.
 * Changes emoji to ❌, color to red, removes join link.
 * Posts cancellation notice in thread.
 */
export async function markPodCancelled(
  pod: PodInfo,
  hostUsername: string,
  playerNames: string[]
): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return

  const podRow = await queryRow(
    'SELECT discord_message_id, discord_thread_id FROM pods WHERE id = $1',
    [pod.id]
  )
  if (!podRow?.discord_message_id) return

  try {
    // Update embed to cancelled state
    await discordFetch(`/channels/${channelId}/messages/${podRow.discord_message_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        embeds: [buildCancelledEmbed(pod, hostUsername, playerNames)],
      }),
    })

    // Post cancellation notice in thread
    if (podRow.discord_thread_id) {
      const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
      const podLabel = pod.name || `${pod.set_name} ${podType}`
      await discordFetch(`/channels/${podRow.discord_thread_id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: `❌ **${podLabel}** was cancelled by the host.`,
        }),
      })
    }
  } catch (err) {
    console.error('[Discord LFG] Error marking pod cancelled:', err)
  }
}

/**
 * Update a pod's Discord thread name and embed when settings change.
 * Called when name, maxPlayers, or other properties are updated on a public pod.
 * If oldName is provided and differs from pod.name, posts a rename notice in the thread.
 */
export async function updatePodDiscord(
  pod: PodInfo,
  hostUsername: string,
  playerNames: string[],
  oldName?: string | null
): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return

  const podRow = await queryRow(
    'SELECT discord_message_id, discord_thread_id FROM pods WHERE id = $1',
    [pod.id]
  )
  if (!podRow?.discord_message_id) return

  try {
    // Update the embed message
    await discordFetch(`/channels/${channelId}/messages/${podRow.discord_message_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        embeds: [buildPodEmbed(pod, hostUsername, playerNames)],
      }),
    })

    // Update the thread name
    if (podRow.discord_thread_id && pod.name) {
      const podType = pod.pod_type === 'sealed' ? 'Sealed' : 'Draft'
      const threadName = pod.name || `${pod.set_name} ${podType}`
      await discordFetch(`/channels/${podRow.discord_thread_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: threadName.slice(0, 100),
        }),
      })

      // Post rename notice in thread
      if (oldName && oldName !== pod.name) {
        await discordFetch(`/channels/${podRow.discord_thread_id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: `✏️ Pod renamed to **${pod.name}**`,
          }),
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('[Discord LFG] Error updating pod Discord:', err)
  }
}

/**
 * Delete the pod's embed message from the channel.
 * The thread will become orphaned/archived.
 */
export async function deletePodMessage(pod: PodInfo): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getChannelId(pod.pod_type || 'draft')
  if (!channelId) return

  const podRow = await queryRow(
    'SELECT discord_message_id, discord_webhook_id FROM pods WHERE id = $1',
    [pod.id]
  )
  if (!podRow?.discord_message_id) return

  try {
    await discordFetch(`/channels/${channelId}/messages/${podRow.discord_message_id}`, {
      method: 'DELETE',
    })
  } catch (err) {
    console.error('[Discord LFG] Error deleting pod message:', err)
  }

  // Cleanup webhook
  if (podRow.discord_webhook_id) {
    try {
      await discordFetch(`/webhooks/${podRow.discord_webhook_id}`, {
        method: 'DELETE',
      })
    } catch {
      // Non-critical — webhook may already be deleted
    }
  }
}

/**
 * Post a user's chat message to the Discord thread via webhook.
 * The message appears with the user's name and avatar + BOT tag.
 */
export async function postUserMessage(
  webhookId: string,
  webhookToken: string,
  threadId: string,
  username: string,
  avatarUrl: string | null,
  text: string
): Promise<void> {
  if (!webhookId || !webhookToken || !threadId) return

  try {
    // Webhook execute doesn't use bot token — uses webhook token in URL
    const res = await fetch(
      `${DISCORD_API}/webhooks/${webhookId}/${webhookToken}?thread_id=${threadId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          username: username,
          avatar_url: avatarUrl || undefined,
        }),
      }
    )

    if (!res.ok) {
      console.error('[Discord LFG] Failed to post user message:', res.status)
    }
  } catch (err) {
    console.error('[Discord LFG] Error posting user message:', err)
  }
}

/**
 * Fetch message history from a Discord thread.
 * Returns formatted messages suitable for the chat UI.
 */
export async function fetchThreadMessages(
  threadId: string,
  limit: number = 100
): Promise<{ username: string; avatarUrl: string | null; text: string; timestamp: string; isSystem: boolean; source?: 'discord' }[]> {
  if (!BOT_TOKEN || !threadId) return []

  try {
    const res = await discordFetch(`/channels/${threadId}/messages?limit=${limit}`)
    if (!res.ok) {
      console.error('[Discord LFG] Failed to fetch messages:', res.status)
      return []
    }

    const messages = await res.json()

    // Discord returns newest first, reverse for chronological order
    return messages.reverse().map((msg: {
      author: { username: string; avatar: string | null; id: string; bot?: boolean }
      content: string
      timestamp: string
      webhook_id?: string
    }) => ({
      username: msg.author.username,
      avatarUrl: msg.author.avatar
        ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`
        : null,
      text: msg.content,
      timestamp: msg.timestamp,
      isSystem: msg.author.bot === true && !msg.webhook_id,
      ...(msg.webhook_id ? {} : { source: 'discord' as const }),
    }))
  } catch (err) {
    console.error('[Discord LFG] Error fetching thread messages:', err)
    return []
  }
}

// === Lobby Chat (channel-level, not thread-level) ===

type LobbyType = 'draft' | 'sealed'

// In-memory cache for lobby channel webhooks
const lobbyWebhookCache: Map<string, { id: string; token: string }> = new Map()

function getLobbyChannelId(lobbyType: LobbyType): string | undefined {
  return lobbyType === 'sealed' ? SEALED_NOW_CHANNEL_ID : DRAFT_NOW_CHANNEL_ID
}

/**
 * Get or create a webhook for a lobby channel.
 * Caches in memory so we only create once per server lifetime.
 */
async function getLobbyWebhook(channelId: string): Promise<{ id: string; token: string } | null> {
  if (lobbyWebhookCache.has(channelId)) {
    return lobbyWebhookCache.get(channelId)!
  }

  try {
    // Check for existing webhook we created
    const res = await discordFetch(`/channels/${channelId}/webhooks`)
    if (!res.ok) {
      console.error(`[Discord Lobby] Failed to list webhooks for channel ${channelId}:`, res.status, await res.text().catch(() => ''))
      return null
    }

    const webhooks = await res.json()
    const existing = webhooks.find((w: { name: string }) => w.name === 'Protect the Pod Lobby')

    if (existing) {
      lobbyWebhookCache.set(channelId, { id: existing.id, token: existing.token })
      return { id: existing.id, token: existing.token }
    }

    // Create new webhook
    const createRes = await discordFetch(`/channels/${channelId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Protect the Pod Lobby' }),
    })
    if (!createRes.ok) {
      console.error(`[Discord Lobby] Failed to create webhook for channel ${channelId}:`, createRes.status, await createRes.text().catch(() => ''))
      return null
    }

    const webhook = await createRes.json()
    lobbyWebhookCache.set(channelId, { id: webhook.id, token: webhook.token })
    return { id: webhook.id, token: webhook.token }
  } catch (err) {
    console.error('[Discord Lobby] Error getting webhook:', err)
    return null
  }
}

/**
 * Fetch recent messages from a lobby channel (#draft-now or #sealed-now).
 * Filters out bot embeds (pod announcements) and returns only text messages.
 */
export async function fetchLobbyMessages(
  lobbyType: LobbyType,
  limit: number = 50
): Promise<{ username: string; avatarUrl: string | null; text: string; timestamp: string; isSystem: boolean; source?: 'discord' }[]> {
  if (!BOT_TOKEN) return []
  const channelId = getLobbyChannelId(lobbyType)
  if (!channelId) return []

  try {
    // Always fetch more from Discord since many messages are embeds that get filtered out
    const fetchLimit = Math.min(100, Math.max(50, limit * 5))
    const res = await discordFetch(`/channels/${channelId}/messages?limit=${fetchLimit}`)
    if (!res.ok) {
      console.error('[Discord Lobby] Failed to fetch messages:', res.status)
      return []
    }

    const messages = await res.json()

    // Filter to only text messages (skip embeds-only messages like pod announcements),
    // reverse for chronological order, then take the last `limit` messages
    const filtered = messages
      .filter((msg: { content: string }) => msg.content && msg.content.trim().length > 0)
      .reverse()
      .map((msg: {
        author: { username: string; avatar: string | null; id: string; bot?: boolean }
        content: string
        timestamp: string
        webhook_id?: string
      }) => ({
        username: msg.author.username,
        avatarUrl: msg.author.avatar
          ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`
          : null,
        text: msg.content,
        timestamp: msg.timestamp,
        isSystem: msg.author.bot === true && !msg.webhook_id,
        // Webhook messages came from the web app; non-webhook messages came from Discord
        ...(msg.webhook_id ? {} : { source: 'discord' as const }),
      }))

    // Return the last `limit` messages (most recent)
    return filtered.slice(-limit)
  } catch (err) {
    console.error('[Discord Lobby] Error fetching channel messages:', err)
    return []
  }
}

/**
 * Post a user's chat message to a lobby channel via webhook.
 * Message appears with the user's name and avatar.
 */
export async function postLobbyMessage(
  lobbyType: LobbyType,
  username: string,
  avatarUrl: string | null,
  text: string
): Promise<void> {
  if (!BOT_TOKEN) return
  const channelId = getLobbyChannelId(lobbyType)
  if (!channelId) return

  try {
    const webhook = await getLobbyWebhook(channelId)
    if (!webhook) {
      console.error('[Discord Lobby] No webhook available for', lobbyType)
      return
    }

    const res = await fetch(
      `${DISCORD_API}/webhooks/${webhook.id}/${webhook.token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          username: username,
          avatar_url: avatarUrl || undefined,
        }),
      }
    )

    if (!res.ok) {
      console.error('[Discord Lobby] Failed to post message:', res.status)
    }
  } catch (err) {
    console.error('[Discord Lobby] Error posting message:', err)
  }
}

/**
 * Post bot deck summaries to the #draftbots channel after a draft completes.
 * Posts one message per bot with leader image, strategy, base, and pool link.
 */
export async function postBotDeckSummaries(
  _podName: string,
  setCode: string,
  botSummaries: Array<{
    botName: string
    strategyDisplayName: string
    mixinDisplayName: string
    strategyDescription: string
    mixinDescription: string
    poolUrl: string
    poolShareId: string
    leaderName: string
    leaderImageUrl: string
    baseDisplay: string
    deckSize: number
  }>,
  podInfo: {
    hostName: string
    playerNames: string[]
  }
): Promise<void> {
  if (!BOT_TOKEN) return
  if (!DRAFTBOTS_CHANNEL_ID) return

  for (const bot of botSummaries) {
    // Generate the deck image (canvas-rendered export, not a screenshot)
    const screenshot = await captureDeckImage(bot.poolShareId).catch(err => {
      console.error('[Discord Bots] Screenshot failed:', err)
      return null
    })

    const embed: Record<string, unknown> = {
      title: `${bot.botName}`,
      description: [
        `**Strategy:** ${bot.strategyDisplayName} + ${bot.mixinDisplayName}`,
        `*${bot.strategyDescription} ${bot.mixinDescription}*`,
        '',
        `**Leader:** ${bot.leaderName}`,
        `**Base:** ${bot.baseDisplay}`,
        `**Deck:** ${bot.deckSize} cards`,
        '',
        `**Pool & Deck:** ${bot.poolUrl}`,
        '',
        `**Host:** ${podInfo.hostName} | **${setCode}** draft`,
        `**Players:** ${podInfo.playerNames.join(', ')}`,
      ].join('\n'),
      color: 0x9B59B6,
      timestamp: new Date().toISOString(),
    }

    // If we have a screenshot, attach it and reference in embed
    if (screenshot) {
      embed.image = { url: 'attachment://deck.jpg' }
    } else if (bot.leaderImageUrl) {
      // Fall back to leader card image if screenshot fails
      embed.image = { url: bot.leaderImageUrl }
    }

    try {
      let res: Response
      if (screenshot) {
        // Use multipart/form-data to attach the screenshot
        const formData = new FormData()
        formData.append('payload_json', JSON.stringify({ embeds: [embed] }))
        formData.append('files[0]', new Blob([screenshot as BlobPart], { type: 'image/jpeg' }), 'deck.jpg')

        res = await fetch(`${DISCORD_API}/channels/${DRAFTBOTS_CHANNEL_ID}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          body: formData,
        })
      } else {
        res = await discordFetch(`/channels/${DRAFTBOTS_CHANNEL_ID}/messages`, {
          method: 'POST',
          body: JSON.stringify({ embeds: [embed] }),
        })
      }

      if (!res.ok) {
        console.error('[Discord Bots] Failed to post bot deck summary:', res.status, await res.text())
      }
    } catch (err) {
      console.error('[Discord Bots] Error posting bot deck summary:', err)
    }
  }
}

/**
 * Post a user message to Discord for a given pod (looks up webhook info from DB).
 * Fire-and-forget — does not throw.
 */
export async function postUserMessageForPod(
  podShareId: string,
  username: string,
  avatarUrl: string | null,
  text: string
): Promise<void> {
  try {
    const pod = await queryRow(
      'SELECT discord_webhook_id, discord_webhook_token, discord_thread_id FROM pods WHERE share_id = $1',
      [podShareId]
    )
    if (!pod?.discord_webhook_id || !pod?.discord_webhook_token || !pod?.discord_thread_id) return

    await postUserMessage(
      pod.discord_webhook_id as string,
      pod.discord_webhook_token as string,
      pod.discord_thread_id as string,
      username,
      avatarUrl,
      text
    )
  } catch (err) {
    console.error('[Discord LFG] Error posting user message for pod:', err)
  }
}

/**
 * Post a user's deck to the #pool-discussion channel and create a thread.
 * Returns the thread ID and message ID, or null on failure.
 */
export async function postDeckToDiscord(opts: {
  username: string
  poolShareId: string
  leaderName: string
  leaderImageUrl: string
  baseName: string
  deckSize: number
  setCode: string
  poolType: string
}): Promise<{ threadId: string; messageId: string } | null> {
  if (!BOT_TOKEN) return null
  if (!POOL_DISCUSSION_CHANNEL_ID) return null

  const poolUrl = `${APP_URL}/pool/${opts.poolShareId}/deck`

  // Generate deck image (same as bot deck summaries)
  const screenshot = await captureDeckImage(opts.poolShareId).catch(err => {
    console.error('[Discord Deck] Screenshot failed:', err)
    return null
  })

  const embed: Record<string, unknown> = {
    title: `${opts.username}'s ${opts.setCode} Deck`,
    description: [
      `**Leader:** ${opts.leaderName}`,
      `**Base:** ${opts.baseName}`,
      `**Deck:** ${opts.deckSize} cards`,
      `**Format:** ${opts.poolType === 'draft' ? 'Draft' : opts.poolType === 'sealed' ? 'Sealed' : opts.poolType}`,
      '',
      `**[View Deck & Pool](${poolUrl})**`,
    ].join('\n'),
    color: 0x2ECC71,
    timestamp: new Date().toISOString(),
  }

  if (screenshot) {
    embed.image = { url: 'attachment://deck.jpg' }
  }

  try {
    // 1. Post the embed (with image attachment if available)
    let msgRes: Response
    if (screenshot) {
      const formData = new FormData()
      formData.append('payload_json', JSON.stringify({ embeds: [embed] }))
      formData.append('files[0]', new Blob([screenshot as BlobPart], { type: 'image/jpeg' }), 'deck.jpg')

      msgRes = await fetch(`${DISCORD_API}/channels/${POOL_DISCUSSION_CHANNEL_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
        body: formData,
      })
    } else {
      msgRes = await discordFetch(`/channels/${POOL_DISCUSSION_CHANNEL_ID}/messages`, {
        method: 'POST',
        body: JSON.stringify({ embeds: [embed] }),
      })
    }

    if (!msgRes.ok) {
      console.error('[Discord Deck] Failed to post deck:', msgRes.status, await msgRes.text())
      return null
    }

    const msg = await msgRes.json()
    const messageId = msg.id

    // 2. Create a thread off the message
    const threadName = `${opts.username}'s ${opts.setCode} ${opts.poolType === 'draft' ? 'Draft' : 'Sealed'} Deck`
    const threadRes = await discordFetch(`/channels/${POOL_DISCUSSION_CHANNEL_ID}/messages/${messageId}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        name: threadName.slice(0, 100),
        auto_archive_duration: 1440,
      }),
    })

    if (!threadRes.ok) {
      console.error('[Discord Deck] Failed to create thread:', threadRes.status, await threadRes.text())
      return { threadId: '', messageId }
    }

    const thread = await threadRes.json()

    // 3. Post CTA message in the thread
    await discordFetch(`/channels/${thread.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `**${opts.username}** is looking for feedback on this pool and deck, discuss it here!\n\n${poolUrl}`,
      }),
    }).catch(() => {}) // Non-critical

    return { threadId: thread.id, messageId }
  } catch (err) {
    console.error('[Discord Deck] Error posting deck to Discord:', err)
    return null
  }
}
