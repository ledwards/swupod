/**
 * Socket.io server setup: CORS allow-list, cookie-based authentication
 * middleware, and all connection/event handlers.
 *
 * Extracted from server.ts so the auth + identity rules are unit-testable
 * with a real Socket.io server (see socketServer.test.ts).
 *
 * Identity model (U3, foundations hardening plan):
 * - io.use() middleware verifies the `swupod_session` cookie from the
 *   handshake and stamps `socket.data.user` (same verifyToken path as the
 *   HTTP API — one definition of identity).
 * - Anonymous sockets are allowed: read-only rooms (presence:subscribe,
 *   join-draft, join-pod, ...) keep working without auth.
 * - presence:join and chat sends require auth. Client-supplied identity
 *   fields (userId / username / avatarUrl) are IGNORED — the server only
 *   trusts the verified session, so chat impersonation (relayed into
 *   Discord) is impossible.
 */

import type { Server, Socket } from 'socket.io'
import { getSessionFromCookieHeader, type Session } from '@/lib/auth'

export interface SocketServerDeps {
  /** Relay a pod chat message into the pod's Discord thread. */
  postUserMessageForPod: (shareId: string, username: string, avatarUrl: string | null, text: string) => Promise<unknown>
  /** Relay a lobby chat message into #draft-now / #sealed-now. */
  postLobbyMessage: (lobbyType: 'draft' | 'sealed', username: string, avatarUrl: string | null, text: string) => Promise<unknown>
  /** Delist a disconnected host's public pods (DB update + broadcast). */
  delistPods: (userId: string) => Promise<void>
  /** How long a host may be offline before their public pods are delisted. */
  delistDelayMs?: number
}

export interface SocketServerState {
  /** userId → live socket ids. Used by abandoned-pod cleanup to detect offline hosts. */
  presenceMap: Map<string, Set<string>>
  /** Pending host-delist timers (exposed for shutdown/tests). */
  delistTimers: Map<string, NodeJS.Timeout>
}

const DEFAULT_DELIST_DELAY_MS = 60_000 // 60 seconds

/**
 * Compute the Socket.io CORS origin allow-list from the configured app URLs.
 * Includes www/bare-host variants of each configured origin; localhost
 * origins are added in dev.
 */
export function buildAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
  dev: boolean = env.NODE_ENV !== 'production'
): string[] {
  const origins = new Set<string>()

  const add = (value: string | undefined): void => {
    if (!value) return
    try {
      const url = new URL(value)
      origins.add(url.origin)
      const portSuffix = url.port ? `:${url.port}` : ''
      if (url.hostname.startsWith('www.')) {
        origins.add(`${url.protocol}//${url.hostname.slice(4)}${portSuffix}`)
      } else if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        origins.add(`${url.protocol}//www.${url.hostname}${portSuffix}`)
      }
    } catch {
      // ignore malformed URLs in env config
    }
  }

  add(env.APP_URL)
  add(env.NEXT_PUBLIC_APP_URL)
  add(env.NEXT_PUBLIC_SITE_URL)

  if (dev) {
    origins.add('http://localhost:3000')
    origins.add('http://127.0.0.1:3000')
  }

  return [...origins]
}

/**
 * engine.io allowRequest hook that actively REJECTS handshakes whose Origin
 * header is present but not in the allow-list. The `cors` option alone only
 * controls response headers (browser-enforced); this enforces server-side.
 * Requests without an Origin header (same-process tools, curl, server-side
 * clients) pass through — the auth middleware is the identity boundary.
 */
export function makeAllowRequest(
  allowedOrigins: string[]
): (req: { headers: Record<string, string | string[] | undefined> }, callback: (err: string | null | undefined, success: boolean) => void) => void {
  return (req, callback) => {
    const origin = req.headers.origin
    if (!origin || typeof origin !== 'string') {
      callback(null, true)
      return
    }
    callback(null, allowedOrigins.includes(origin))
  }
}

function socketUser(socket: Socket): Session | null {
  return (socket.data.user as Session | null | undefined) ?? null
}

/**
 * Attach the auth middleware and all event handlers to a Socket.io server.
 * Returns the live presence state used by server.ts's cleanup loop.
 */
export function setupSocketServer(io: Server, deps: SocketServerDeps): SocketServerState {
  const delistDelayMs = deps.delistDelayMs ?? DEFAULT_DELIST_DELAY_MS

  // In-memory presence tracking: userId → Set<socketId>
  const presenceMap = new Map<string, Set<string>>()

  // Delist timers: when a host disconnects, wait before hiding their public pods
  const delistTimers = new Map<string, NodeJS.Timeout>()

  function startDelistTimer(userId: string): void {
    cancelDelistTimer(userId)
    const timer = setTimeout(() => {
      delistTimers.delete(userId)
      deps.delistPods(userId).catch((err) => {
        console.error('[Delist] Failed to delist pods:', err)
      })
    }, delistDelayMs)
    delistTimers.set(userId, timer)
  }

  function cancelDelistTimer(userId: string): void {
    const timer = delistTimers.get(userId)
    if (timer) {
      clearTimeout(timer)
      delistTimers.delete(userId)
    }
  }

  function broadcastPresenceCount(): void {
    const count = presenceMap.size
    io.to('presence').emit('presence:count', { count })
  }

  // Authentication middleware: derive identity from the session cookie that
  // accompanies the polling/upgrade request. Anonymous sockets are allowed
  // (socket.data.user stays null) — per-event gates below decide what
  // requires auth.
  io.use((socket, next) => {
    socket.data.user = getSessionFromCookieHeader(socket.handshake.headers.cookie)
    next()
  })

  io.on('connection', (socket) => {
    // Presence tracking - subscribe to count updates (no auth needed)
    socket.on('presence:subscribe', () => {
      socket.join('presence')
      socket.emit('presence:count', { count: presenceMap.size })
    })

    // Presence tracking - join as a counted user. Identity comes from the
    // verified session ONLY — any client-supplied payload is ignored.
    socket.on('presence:join', () => {
      const user = socketUser(socket)
      if (!user) return
      socket.join('presence')
      if (!presenceMap.has(user.id)) {
        presenceMap.set(user.id, new Set())
      }
      presenceMap.get(user.id)!.add(socket.id)
      cancelDelistTimer(user.id)
      broadcastPresenceCount()
    })

    socket.on('join-draft', (shareId: string) => {
      socket.join(`draft:${shareId}`)
    })

    socket.on('leave-draft', (shareId: string) => {
      socket.leave(`draft:${shareId}`)
    })

    socket.on('join-rotisserie', (shareId: string) => {
      socket.join(`rotisserie:${shareId}`)
    })

    socket.on('leave-rotisserie', (shareId: string) => {
      socket.leave(`rotisserie:${shareId}`)
    })

    socket.on('join-pod', (shareId: string) => {
      socket.join(`pod:${shareId}`)
    })

    socket.on('leave-pod', (shareId: string) => {
      socket.leave(`pod:${shareId}`)
    })

    socket.on('join-sealed', (shareId: string) => {
      socket.join(`sealed:${shareId}`)
    })

    socket.on('leave-sealed', (shareId: string) => {
      socket.leave(`sealed:${shareId}`)
    })

    // Chat room handlers
    socket.on('join-chat', (shareId: string) => {
      socket.join(`chat:${shareId}`)
    })

    socket.on('leave-chat', (shareId: string) => {
      socket.leave(`chat:${shareId}`)
    })

    // Pod chat. Requires auth; username/avatar come from the verified
    // session, never from the payload (Discord relay shows real identities).
    socket.on('chat:send', async (data: { shareId?: string; text?: string }) => {
      const user = socketUser(socket)
      if (!user) return
      const shareId = data?.shareId
      const text = data?.text
      if (!shareId || !text || typeof text !== 'string') return

      const message = {
        username: user.username,
        avatarUrl: user.avatar_url ?? null,
        text,
        timestamp: new Date().toISOString(),
        isSystem: false,
      }

      // Broadcast to all web clients in the chat room
      io.to(`chat:${shareId}`).emit('chat:message', message)

      // Post to Discord thread (fire-and-forget) — Discord is the persistence layer
      deps.postUserMessageForPod(shareId, message.username, message.avatarUrl, text).catch(() => {})
    })

    // Lobby chat room handlers (channel-level, mirrors #draft-now / #sealed-now)
    socket.on('join-lobby-chat', (lobbyType: string) => {
      if (lobbyType === 'draft' || lobbyType === 'sealed') {
        socket.join(`lobby-chat:${lobbyType}`)
      }
    })

    socket.on('leave-lobby-chat', (lobbyType: string) => {
      if (lobbyType === 'draft' || lobbyType === 'sealed') {
        socket.leave(`lobby-chat:${lobbyType}`)
      }
    })

    // Lobby chat. Same identity rules as pod chat.
    socket.on('lobby-chat:send', async (data: { lobbyType?: string; text?: string }) => {
      const user = socketUser(socket)
      if (!user) return
      const lobbyType = data?.lobbyType
      const text = data?.text
      if (!lobbyType || !text || typeof text !== 'string') return
      if (lobbyType !== 'draft' && lobbyType !== 'sealed') return

      const message = {
        username: user.username,
        avatarUrl: user.avatar_url ?? null,
        text,
        timestamp: new Date().toISOString(),
        isSystem: false,
      }

      // Broadcast to all web clients in the lobby chat room
      io.to(`lobby-chat:${lobbyType}`).emit('lobby-chat:message', message)

      // Post to Discord channel (fire-and-forget)
      deps.postLobbyMessage(lobbyType, message.username, message.avatarUrl, text).catch(() => {})
    })

    socket.on('join-public-pods', () => {
      socket.join('public-pods')
    })

    socket.on('leave-public-pods', () => {
      socket.leave('public-pods')
    })

    // Pool builds room: clients viewing /pool/:rootShareId/deck or /...deck/:buildId
    // join `pool-builds:${rootShareId}` to receive builds-changed pings whenever
    // any user (themselves OR another client) saves changes to the pool tree.
    socket.on('join-pool-builds', (rootShareId: string) => {
      if (typeof rootShareId === 'string' && rootShareId) {
        socket.join(`pool-builds:${rootShareId}`)
      }
    })

    socket.on('leave-pool-builds', (rootShareId: string) => {
      if (typeof rootShareId === 'string' && rootShareId) {
        socket.leave(`pool-builds:${rootShareId}`)
      }
    })

    socket.on('disconnect', () => {
      const user = socketUser(socket)
      if (user && presenceMap.has(user.id)) {
        const sockets = presenceMap.get(user.id)!
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          presenceMap.delete(user.id)
          startDelistTimer(user.id)
        }
        broadcastPresenceCount()
      }
    })
  })

  return { presenceMap, delistTimers }
}
