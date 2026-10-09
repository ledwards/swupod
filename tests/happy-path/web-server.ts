import next from 'next';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { setupSocketServer } from '../../src/lib/socketServer';
const app = next({ dev: true, hostname: 'localhost', port: 3025, webpack: true } as Parameters<typeof next>[0]);
await app.prepare();
const server = createServer(app.getRequestHandler());
const io = new Server(server, { cors: { origin: 'http://localhost:3025', credentials: true } });
(globalThis as {
    io?: Server;
}).io = io;
// No Discord relays or background maintenance against unrelated development users.
setupSocketServer(io, { postUserMessageForPod: async () => { }, postLobbyMessage: async () => { }, delistPods: async () => { } });
server.listen(3025, () => console.log('Happy-path PTP listening on 3025'));
