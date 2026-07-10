// @ts-nocheck
// Custom server for Next.js with Socket.io - v2
//
// MUST be the first import — populates process.env before lib/db,
// lib/anthropic, etc. read their respective vars at module-init time.
import './lib/loadEnv.js'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { spawn } from 'child_process'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'
import next from 'next'
import { Server } from 'socket.io'
import { query, queryRows } from './lib/db.js'
import { broadcastPublicPodsUpdate, broadcastOpenGamesUpdate } from './src/lib/socketBroadcast.js'
import { sweepOpenGames, delistOpenGamesForUser } from './src/services/openGames.js'
import { deleteAbandonedPodRecords } from './src/utils/podCleanup.js'
import { buildAllowedOrigins, makeAllowRequest, setupSocketServer } from './src/lib/socketServer.js'
import { postUserMessageForPod, postLobbyMessage, deletePodMessage, resolveOpenGameMessage } from './lib/discordLfg.js'
import { shouldFailFastOnMigrationFailure } from './lib/migrationPolicy.js'

declare global {
  var io: Server | undefined
}

const dev = process.env.NODE_ENV !== 'production'
const port = process.env.PORT || 3000

console.log('🚀 Starting custom server.ts with Socket.io support')

// Release notes are served from public/RELEASE_NOTES.md, which is generated at
// build time (scripts/postbuild.ts). Dev never builds, so the homepage panel
// would 404 — copy the root file into public/ on startup. Harmless in prod
// (postbuild already produced it).
try {
  const rnSource = join(process.cwd(), 'RELEASE_NOTES.md')
  const rnDest = join(process.cwd(), 'public', 'RELEASE_NOTES.md')
  if (existsSync(rnSource)) copyFileSync(rnSource, rnDest)
} catch (err) {
  console.warn('⚠️  Could not copy RELEASE_NOTES.md to public/:', (err as Error).message)
}

// Run migrations at startup (for Railway where build-time DB access doesn't work).
// U7: in production a migration failure stops the boot (process exits non-zero
// so Railway restarts/rolls back) instead of serving traffic against a stale
// schema. Break-glass: ALLOW_STALE_SCHEMA=1. Dev keeps warn-and-continue.
async function runMigrations(): Promise<void> {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    if (shouldFailFastOnMigrationFailure()) {
      console.error('❌ No database URL set in production — refusing to start.')
      console.error('   Set ALLOW_STALE_SCHEMA=1 to boot anyway (break-glass only).')
      process.exit(1)
    }
    console.log('⚠️  No database URL set, skipping migrations')
    return
  }

  console.log('🔧 Running migrations at startup...')

  return new Promise((resolve) => {
    const migrate = spawn('npx', ['tsx', 'scripts/migrate-on-deploy.ts'], {
      env: { ...process.env, POSTGRES_URL: dbUrl },
      stdio: 'inherit'
    })

    migrate.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Migrations completed')
      } else if (shouldFailFastOnMigrationFailure()) {
        console.error(`❌ Migration process exited with code ${code} in production — refusing to start.`)
        console.error('   Set ALLOW_STALE_SCHEMA=1 to boot anyway (break-glass only).')
        process.exit(code ?? 1)
      } else {
        console.log('⚠️  Migration process exited with code', code)
      }
      resolve()
    })

    migrate.on('error', (err) => {
      console.error('Migration error:', err)
      if (shouldFailFastOnMigrationFailure()) {
        console.error('❌ Could not spawn the migration process in production — refusing to start.')
        process.exit(1)
      }
      resolve()
    })
  })
}

// Dev: force the webpack bundler instead of Turbopack. Next 16's custom-server
// path defaults TURBOPACK to 'auto' (on), and the Turbopack dev server can serve
// a *truncated* built-in chunk while a route is still compiling (HTTP 200 but the
// body is cut off mid-token). The browser then throws "Invalid or unexpected
// token", React can't mount the page or its error boundary, and the route hangs
// on skeletons forever. Webpack dev doesn't have that failure mode. Note: passing
// `turbopack: false` is NOT enough — Next only switches off Turbopack when you
// pass `webpack: true`. Prod (dev=false) is left entirely untouched.
const app = next(dev ? { dev, webpack: true } : { dev })
const handle = app.getRequestHandler()

// Run migrations before starting
await runMigrations()

app.prepare().then(() => {
  // Create server WITHOUT a request handler first
  const server = createServer()

  // Attach Socket.io BEFORE adding request handler.
  // CORS is restricted to the configured app origins (U3) — same-origin
  // clients are unaffected; cross-origin socket access is rejected.
  const allowedOrigins = buildAllowedOrigins(process.env, dev)
  const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    allowRequest: makeAllowRequest(allowedOrigins),
    path: '/socket.io/'
  })

  // Now add request handler for Next.js (non-socket.io requests)
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, socketio: !!io }))
      return
    }
    if (req.url?.startsWith('/socket.io')) {
      console.log('[DEBUG] Socket.io request (letting engine handle):', req.method, req.url)
      return
    }
    handle(req, res)
  })

  // Store globally so API routes can access it
  global.io = io

  // Socket auth middleware + all event handlers (identity derived from the
  // verified session cookie — see src/lib/socketServer.ts)
  const { presenceMap } = setupSocketServer(io, {
    postUserMessageForPod,
    postLobbyMessage,
    delistPods: async (userId: string) => {
      const result = await query(
        `UPDATE pods SET is_public = false WHERE host_id = $1 AND is_public = true AND status = 'waiting'`,
        [userId]
      )
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Delist] Host ${userId} disconnected >60s, delisted ${result.rowCount} public pod(s)`)
        await broadcastPublicPodsUpdate()
      }
    },
    // Host presence dots on the lobby board must update in realtime — a
    // poster sitting on their match page is NOT "stepped away". Debounced:
    // reconnect storms (tab switches) collapse into one broadcast.
    onPresenceChange: (() => {
      let timer: NodeJS.Timeout | null = null
      return () => {
        if (timer) return
        timer = setTimeout(() => {
          timer = null
          broadcastOpenGamesUpdate().catch(() => {})
        }, 1500)
      }
    })(),
    delistOpenGames: async (userId: string) => {
      const delisted = await delistOpenGamesForUser(userId)
      if (delisted.length > 0) {
        console.log(`[Delist] Poster ${userId} offline past grace, delisted ${delisted.length} open game(s)`)
        await broadcastOpenGamesUpdate()
        for (const listing of delisted) {
          if (listing.discordMessageId) {
            resolveOpenGameMessage(listing, listing.discordMessageId, 'expired').catch(() => {})
          }
        }
      }
    },
  })

  // Expose live presence to broadcast/API layers (hostConnected dots on listings)
  global.presenceMap = presenceMap

  // Abandoned pod cleanup
  const CLEANUP_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes
  const ABANDONED_AGE_HOURS = 2

  async function cleanupAbandonedPods(): Promise<void> {
    try {
      // Find waiting pods older than 2 hours with fewer than 2 human players
      const candidates = await queryRows(
        `SELECT p.id, p.share_id, p.set_code, p.name, p.max_players, p.host_id,
                p.pod_type, p.is_public,
                COALESCE(p.set_code, '') as set_name,
                (SELECT COUNT(*) FROM pod_players pp WHERE pp.pod_id = p.id AND pp.is_bot = false) as human_count
         FROM pods p
         WHERE p.status = 'waiting'
           AND p.created_at < NOW() - INTERVAL '${ABANDONED_AGE_HOURS} hours'
           AND (SELECT COUNT(*) FROM pod_players pp WHERE pp.pod_id = p.id AND pp.is_bot = false) < 2`,
        []
      )

      // Filter to pods whose host is offline
      const abandoned = candidates.filter((pod: any) => !presenceMap.has(pod.host_id))

      if (abandoned.length === 0) return

      console.log(`[Cleanup] Found ${abandoned.length} abandoned pod(s), cleaning up...`)

      for (const pod of abandoned) {
        try {
          // Delete Discord message (if any)
          await deletePodMessage({
            id: pod.id as string,
            share_id: pod.share_id as string,
            set_code: pod.set_code as string,
            set_name: pod.set_name as string,
            name: pod.name as string | null,
            max_players: pod.max_players as number,
            current_players: Number(pod.human_count) || 0,
            pod_type: pod.pod_type as string,
            is_public: pod.is_public as boolean,
          })
          // Delete card_pools, pod_players, then the pod — atomically
          await deleteAbandonedPodRecords(pod.id as string)
          console.log(`[Cleanup] Deleted abandoned pod ${pod.share_id}`)
        } catch (err) {
          console.error(`[Cleanup] Failed to delete pod ${pod.share_id}:`, err)
        }
      }

      await broadcastPublicPodsUpdate()
    } catch (err) {
      console.error('[Cleanup] Error during abandoned pod cleanup:', err)
    }
  }

  // Open-games lifecycle sweep (R9/R20): transitions statuses + broadcasts,
  // unlike the pod cleanup which deletes rows. Runs on its own faster cadence
  // so the ~20-min accepted-match expiry stays close to spec.
  const OPEN_GAMES_SWEEP_INTERVAL_MS = 5 * 60 * 1000
  async function sweepOpenGamesJob(): Promise<void> {
    try {
      const { expired, abandoned, expiredListings } = await sweepOpenGames()
      if (expired > 0 || abandoned > 0) {
        console.log(`[OpenGames] Sweep: ${expired} expired, ${abandoned} abandoned`)
        await broadcastOpenGamesUpdate()
        for (const listing of expiredListings) {
          if (listing.discordMessageId) {
            resolveOpenGameMessage(listing, listing.discordMessageId, 'expired').catch(() => {})
          }
        }
      }
    } catch (err) {
      console.error('[OpenGames] Sweep error:', err)
    }
  }

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
    setInterval(cleanupAbandonedPods, CLEANUP_INTERVAL_MS)
    setInterval(sweepOpenGamesJob, OPEN_GAMES_SWEEP_INTERVAL_MS)
  })
})
