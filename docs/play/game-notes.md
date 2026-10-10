# Game notes

Admins and players with `is_alpha_tester` (the same audience that has native play on the alpha line) see one pencil in the table toolbar. The form takes one note, without categories. It freezes the currently displayed frame’s step when opened, even if play continues while writing. Existing access to native play is unchanged. Spectator and replay sessions cannot submit notes in this first release.

The authenticated Purrgil gateway obtains the historical seat-visible frame from the engine. The browser cannot choose a different author, match or seat or provide the saved snapshot. It sends an idempotency UUID, step, reserved entry index (zero for frame notes) and text (1–2,000 characters). PTP checks fresh tester membership again before storing it. Note submissions are rate-limited to 15/minute per player and same-origin only.

Storage: `ptp_game_notes` in Postgres (migration 114). The saved moment survives engine/gateway restarts and works before the game finishes. Existing solo/native completed-game archives supply the full replay, seed, decks and AI actor metadata on download. An unfinished or not-yet-archived game exports a null record and its saved moment; this is not a complete reproduction bundle. Snapshot capture does not add search scores or visits that are not currently persisted.

## Admin collection

`/admin/game-notes` lists private notes. Admin JWTs and current database privilege/version are checked. A download contains the note, saved frame and full completed record when available. It deliberately omits the note author's ID; a completed replay still contains private gameplay information, so these downloads must remain private. Notes do not appear in chat, opponent views or public replays.

## Read-only automated collection

Set a dedicated, random `GAME_NOTES_READ_KEY` of at least 32 characters on PTP and provide it privately to the authorized collector. It is not the gateway service key. No key or new credential is created by this change.

- `GET /api/play/native/internal/notes/export` with `Authorization: Bearer <key>` returns `{notes,nextCursor}` (up to 100 rows, oldest first).
- Pass the opaque `cursor` on the next request. Persist the cursor only after consuming the page; deduplicate by note ID.
- `GET /api/play/native/internal/notes/export?id=<note UUID>` returns the same private bundle as the admin download. Re-fetch incomplete bundles after the game ends.
- Both admin and collector responses use `Cache-Control: no-store`.
- Automated collection is read-only. Player comments are reports, not validated training labels.

## Validation and release

Deploy PTP/migration before Purrgil. Older hosts omit `canAddNotes`, so controls fail closed. Validate alpha and admin access, ordinary-user denial, revoked membership, step preservation while the game advances, same-ID retries, and admin/collector denial without credentials. Monitor HTTP failures on `/api/notes` and `/api/play/native/internal/notes` during initial alpha use. If submission errors occur, keep the user's draft; roll back the Purrgil control if needed without removing stored notes.

## Discord delivery

Feedback posts to PTP channel `1557629344975691858` using the existing `DISCORD_BOT_TOKEN`. The bot needs View Channel, Send Messages, and Embed Links there. Posts contain the comment, game ID, step, and an admin-authenticated record download link; no captured hands, snapshots, or author identity. Mentions are disabled.

Apply migration 115 after 114. Saving feedback attempts delivery; Discord failure never loses or rejects saved feedback. A database lease prevents simultaneous duplicate delivery and Discord nonce enforcement covers short retries. Pending deliveries can be retried with `npx tsx scripts/deliver-game-feedback.ts` in the configured application environment; schedule it every five minutes for automatic retries. This schedule is not provisioned yet. Crash recovery beyond Discord's nonce retention can produce a duplicate notification, never a duplicate saved note.

Local development currently lacks a bot token, so actual channel permissions and posting have not been verified. No production deployment has been performed.
