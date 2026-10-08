// @ts-nocheck
// GET /api/health - Health check endpoint with memory and connection stats
import { testConnection } from '@/lib/db'
import { NextResponse } from 'next/server'

interface SocketStats {
  connected: boolean
  totalConnections: number
  rooms?: number
  draftRooms?: number
}

interface HealthStats {
  status: 'healthy' | 'warning' | 'error'
  timestamp: string
  uptime: number
  warning?: string
  error?: string
  memory: {
    heapUsed: number
    heapTotal: number
    rss: number
    external: number
  }
  sockets: SocketStats
  database: {
    connected: boolean
  }
}

declare const global: {
  io?: {
    fetchSockets: () => Promise<unknown[]>
    sockets: {
      adapter: {
        rooms: Map<string, Set<string>>
      }
    }
  }
}

export async function GET(): Promise<NextResponse<HealthStats>> {
  try {
    const memUsage = process.memoryUsage()

    // Test database connection
    const dbHealthy = await testConnection()

    // Get Socket.io stats if available
    const io = global.io
    let socketStats: SocketStats = {
      connected: false,
      totalConnections: 0,
      rooms: 0,
    }

    if (io) {
      const sockets = await io.fetchSockets()
      const rooms = io.sockets.adapter.rooms
      // Count draft rooms (rooms that start with "draft:")
      let draftRoomCount = 0
      for (const [roomName] of rooms) {
        if (roomName.startsWith('draft:')) {
          draftRoomCount++
        }
      }

      socketStats = {
        connected: true,
        totalConnections: sockets.length,
        draftRooms: draftRoomCount,
      }
    }

    // Memory stats in MB
    const stats: HealthStats = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      sockets: socketStats,
      database: {
        connected: dbHealthy,
      },
    }

    // Warn if memory usage is high (over 400MB)
    if (stats.memory.heapUsed > 400) {
      stats.status = 'warning'
      stats.warning = 'High memory usage detected'
    }

    // Warn if too many connections
    if (socketStats.totalConnections > 200) {
      stats.status = 'warning'
      stats.warning = 'High connection count'
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      } as HealthStats,
      { status: 500 }
    )
  }
}
