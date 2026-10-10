import next from 'next'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { setupSocketServer } from '../src/lib/socketServer'

// The local alpha needs real draft sockets, but must not run production's
// Discord relays or background jobs against unrelated development records.
const app = next({ dev: true, hostname: 'localhost', port: 3000, webpack: true } as Parameters<typeof next>[0])
await app.prepare()
const server = createServer(app.getRequestHandler())
const io = new Server(server, { cors: { origin: 'http://localhost:3000', credentials: true } })
globalThis.io = io
setupSocketServer(io, {
  postUserMessageForPod: async () => {},
  postLobbyMessage: async () => {},
  delistPods: async () => {},
})
server.listen(3000, () => console.log('Alpha PTP with draft sockets: http://localhost:3000'))
