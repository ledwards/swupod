import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';

const root = process.cwd();
const purrgil = process.env.PURRGIL_SOURCE ?? resolve(root, '../../../../purrgil/.worktrees/codex/alpha');
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const dir = resolve('.happy-path-runtime');
await mkdir(dir, { recursive: true });
const runtimeFile = resolve(dir, 'runtime.env');
const { engine } = JSON.parse(await readFile(resolve(purrgil, 'engine.lock.json'), 'utf8'));
const runtime = {
  BAIZE_PVP_SERVICE_KEY: randomBytes(32).toString('hex'),
  BAIZE_ENGINE_REVISION: engine.rev,
  BAIZE_PVP_ISSUER: 'ptp',
};
await writeFile(runtimeFile, Object.entries(runtime).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
const binary = process.env.PTP_RUNTIME_BINARY ?? resolve(purrgil, 'target/debug/purrgil-runtime');
const env = {
  ...process.env,
  ...runtime,
  // Authentication is seeded; test accounts must never contact Discord.
  DISCORD_BOT_TOKEN: '',
  DISCORD_GUILD_ID: '',
  PTP_BETA_EXPERIENCE_ENABLED: 'true',
  PTP_NATIVE_PLAY_ENABLED: 'true',
  PTP_SOLO_AI_ENABLED: 'true',
  PTP_SITE_THEME_ENABLED: 'true',
  APP_URL: 'http://localhost:3025',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3025',
  PTP_PUBLIC_ORIGIN: 'http://localhost:3025',
  PTP_NATIVE_SUPPORT_PATH: resolve(dir, 'support.json'),
  BAIZE_PVP_URL: 'http://localhost:4335',
  PURRGIL_HOST_SERVICE_KEY: randomBytes(32).toString('hex'),
  PURRGIL_PUBLIC_ORIGIN: 'http://localhost:8085',
  PURRGIL_INTERNAL_URL: 'http://localhost:8085',
  NEXT_DIST_DIR: '.next-happy-path',
};
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch { /* Already exited. */ }
  }
}
process.on('exit', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
function start(args, cwd, environment, persistent = true) {
  const child = spawn(args[0], args.slice(1), { cwd, env: environment, stdio: 'inherit' });
  children.push(child);
  child.on('exit', code => {
    if (persistent && !stopping) { process.exitCode = code || 1; stop(); }
  });
  return child;
}
async function assertFree(port) {
  const occupied = await new Promise(resolve => {
    const socket = createConnection({ host: 'localhost', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (occupied) throw Error(`Happy-path port ${port} is already in use; no existing service was stopped.`);
}
try {
  for (const port of [3025, 4335, 8085]) await assertFree(port);
  start([binary], root, { ...env, PORT: '4335', BAIZE_PVP_DATA_DIR: resolve(dir, 'engine') });
  let ready = false;
  for (let n = 0; n < 120 && !stopping; n++) {
    try { ready = (await fetch('http://localhost:4335/healthz', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw Error('Purrgil test runtime did not start. Build target/debug/purrgil-runtime first.');
  await new Promise((accept, reject) => {
    const child = start([process.execPath, 'node_modules/tsx/dist/cli.mjs', 'scripts/native-play/build-support-manifest.ts',
      '--env-file', runtimeFile, '--output', env.PTP_NATIVE_SUPPORT_PATH, '--engine', env.BAIZE_PVP_URL, '--sets', 'all'], root, env, false);
    child.once('error', reject);
    child.once('exit', code => code ? reject(Error('Support manifest failed')) : accept());
  });
  start([process.execPath, 'server/index.mjs'], purrgil, {
    ...env, PUBLIC_ORIGIN: env.PURRGIL_PUBLIC_ORIGIN, HOST_ORIGIN: env.PTP_PUBLIC_ORIGIN,
    HOST_SERVICE_KEY: env.PURRGIL_HOST_SERVICE_KEY, BAIZE_URL: env.BAIZE_PVP_URL,
    PORT: '8085', SESSION_DIR: resolve(dir, 'gateway'), LOBBY_ENABLED: 'true', LOBBY_SHARED_PLAY_ENABLED: 'true',
  });
  start([process.execPath, 'node_modules/tsx/dist/cli.mjs', 'tests/happy-path/web-server.ts'], root, env);
} catch (error) {
  stop();
  throw error;
}
