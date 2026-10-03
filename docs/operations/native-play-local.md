# Separate local gameplay services

Run from the PTP checkout you are testing. The real flow starts at PTP, not the
artwork sandbox: PTP owns login/decks, Purrgil serves the board, and Baize runs
rules and AI. Starting `npm run dev` alone does not start the other two services.

## Local configuration

Keep secrets and machine paths in PTP's ignored `.env.local`. Do not source a
sibling repo's environment: it may target production. Use the same hostname
(`localhost`) for both browser origins, including Discord's callback origin.

```dotenv
PTP_PUBLIC_ORIGIN=http://localhost:3000
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
PURRGIL_PUBLIC_ORIGIN=http://localhost:4397
PURRGIL_INTERNAL_URL=http://127.0.0.1:4397
BAIZE_PVP_URL=http://127.0.0.1:4331
PTP_BETA_EXPERIENCE_ENABLED=true
PTP_NATIVE_PLAY_ENABLED=true
PTP_SOLO_AI_ENABLED=true
PTP_NATIVE_LOCAL_TESTING=false

# Absolute paths; choose the exact binary/revision and retain its journal directory.
PURRGIL_REPO=/absolute/path/to/purrgil
PURRGIL_SESSION_DIR=/absolute/path/to/persistent-local-sessions
BAIZE_BINARY=/absolute/path/to/baize/target/release/baize-pvp
BAIZE_PVP_DATA_DIR=/absolute/path/to/persistent-local-journals
BAIZE_ENGINE_REVISION=<revision-matching-the-existing-binary-and-journals>
PTP_NATIVE_SUPPORT_PATH=/absolute/path/to/reviewed-support.json
```

Also configure a **local** database, Discord OAuth, `JWT_SECRET`,
`PURRGIL_HOST_SERVICE_KEY`, `BAIZE_PVP_SERVICE_KEY`, and `PTP_NATIVE_INVITE_KEY`.
Service keys are distinct high-entropy secrets (at least 32 characters), never
browser environment variables. The local runners translate the PTP names into
the gateway/engine configuration; they do not read Purrgil's `.env` files.

Build Purrgil with `npm run build` in its checkout. Then use three terminals,
all starting from the PTP checkout:

```sh
npm run play:baize
npm run play:purrgil
npm run dev
```

Each process can be restarted independently. Commands run in the foreground,
forward Ctrl-C, and refuse non-loopback destinations. An occupied port is an
error, not permission to kill another running service. Existing services may
already be running; check before starting another copy:

```sh
npm run play:check
```

The check verifies PTP, the browser-facing gateway, gateway-to-engine readiness,
engine readiness, service-key access to the support catalog, and exact manifest
revision agreement. It does not create games or establish a browser session.
Then open `http://localhost:3000/limited/play`, sign in as a beta user, choose a
verified deck, and Play vs AI. The browser must arrive at
`http://localhost:4397/table/<match>/<seat>/` and show engine-driven decisions.
Resume uses the existing game; a failed launch is safe to retry. Do not delete
journals or change their revision to recover a game.

Purrgil serves its built `dist` directory. Rebuild after UI changes and refresh
the browser. No engine restart is needed for frontend changes.

## Production mapping

Deploy each repo independently with its own entrypoint and persistent storage;
do not run the local launchers in production. The same protocol is used locally
and in production—there is no browser-side engine/service URL fallback.

| PTP server variable | Matching service setting | Purpose |
| --- | --- | --- |
| `PTP_PUBLIC_ORIGIN` | Purrgil `HOST_ORIGIN` | Exact HTTPS login/handoff origin |
| `PURRGIL_PUBLIC_ORIGIN` | Purrgil `PUBLIC_ORIGIN` | Exact HTTPS browser game origin |
| `PURRGIL_INTERNAL_URL` | Purrgil private host/port | PTP → Purrgil requests |
| `PURRGIL_HOST_SERVICE_KEY` | Purrgil `HOST_SERVICE_KEY` | Authenticate host requests |
| `BAIZE_PVP_URL` | Purrgil `BAIZE_URL` | Private Baize host/port |
| `BAIZE_PVP_SERVICE_KEY` | Both services' `BAIZE_PVP_SERVICE_KEY` | Authenticate engine requests |
| support manifest `engineRevision` | Baize `BAIZE_ENGINE_REVISION` | Exact reviewed engine revision |

Set Purrgil `NODE_ENV=production` for Secure cookies, `HOST_ISSUER=ptp`,
`SESSION_DIR` on its persistent volume, and Baize `BAIZE_PVP_ISSUER=ptp` with
`BAIZE_PVP_DATA_DIR` on a separate persistent volume. Each service binds its own
`PORT`. Private Railway service URLs may use HTTP; browser origins must use
HTTPS. PTP's URL validation enforces this distinction.

Run `NODE_ENV=production npm run play:check` with deployment-injected values
from a host that can reach the private network (local env files are not loaded).
Then verify a beta user's real browser handoff and gameplay before opening the
beta flags. A health check alone does not verify OAuth, session cookies, game
rules, or AI quality. Keep non-beta accounts on the existing experience.
See [native-play.md](native-play.md) for deployment, persistence, and rollback.

## Verify the actual Play button

Health checks are insufficient for release verification. With an existing signed-in
beta user's Playwright storage state, check a prepared AI game through the real
browser handoff (no mocked APIs):

```sh
npx tsx scripts/native-play/verify-browser-launch.ts \
  'http://localhost:3000/limited/ai?pool=POOL&request=REQUEST' \
  /private/path/beta-user-storage-state.json http://localhost:4397
```

For production, pass the deployed HTTPS setup URL and public game origin, with
storage state from a beta user signed in on that deployment. Treat storage state
as credentials; never commit it. This starts/resumes the specified prepared game,
checks the 303 host authorization redirect, scoped session cookie, real engine
view, and rendered board. It does not submit game decisions. A local pass does
not establish that the production deployment has passed.

During development, a full Fast Refresh reload can interrupt cross-service
navigation. Retry Resume after compilation settles; do not delete the game or
journals. If Play returns to setup, capture the handoff response and browser
navigation sequence—the expected handoff response is 303, not 200.
