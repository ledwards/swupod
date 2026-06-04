# Admin Tools

Internal page at `/admin` for direct-add of patron and beta access. Visible only to admins (`users.is_admin = true`); 404 for everyone else, including unauthenticated users.

## What the page does

Two actions:

- **Add to Patron** — sets `users.is_patron = TRUE` for the selected user.
- **Add to Beta** — sets `users.is_beta_tester = TRUE` for the selected user.

Each click sets ONE flag. Use the toggle to switch which flag the button targets. To grant both, click Add twice. The toggle is preserved across grants so "grant beta to a list of people" is one keystroke + one click per person.

## Finding a user

Type-ahead by Discord handle (case-insensitive prefix match on `users.username`). Suggestions appear after the second character.

If you type a Discord user ID (17–25 digits) and there is no matching row, a "Pre-provision Discord ID `<X>` (no swupod account yet)" option appears with a distinct visual treatment. Selecting it and clicking Add creates a fresh `users` row with the chosen flag set and `username = <X>` as a placeholder. When that user eventually signs in via Discord OAuth, the callback overwrites `username` / `email` / `avatar_url` with their real Discord values and preserves the flag.

To find a Discord user ID: enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click the user → Copy User ID.

## What this page intentionally does NOT do

- **Revoke flags.** Use `psql` directly (see below).
- **Grant admin.** Use `scripts/makeAdmin.ts`.
- **Refresh the target user's session.** If you grant beta to a currently-logged-in user, their JWT keeps the stale `is_beta_tester: false` value until they hit `/api/auth/refresh` or sign out and back in. The success message tells you this when relevant. `is_patron` is not in the JWT, so patron grants take immediate effect.

## Revoking access (manual)

```sql
-- Revoke patron + beta by Discord ID
UPDATE users SET is_patron = FALSE, is_beta_tester = FALSE
WHERE discord_id = '<snowflake>';

-- Revoke just beta
UPDATE users SET is_beta_tester = FALSE WHERE discord_id = '<snowflake>';

-- Find someone first
SELECT id, discord_id, username, email, is_patron, is_beta_tester
FROM users WHERE LOWER(username) LIKE LOWER('%<fragment>%');
```

Run via Railway:

```bash
railway run --service Postgres -e production psql "$DATABASE_PUBLIC_URL" -c "<sql>"
```

If revoke friction becomes painful, the followup is one additional route mirroring `app/api/admin/grant/route.ts` with `FALSE` instead of `TRUE`.

## Known limitations (webhook overlap)

The Patreon webhook (`app/api/webhooks/patreon/route.ts`) matches users by email. Two consequences for admin-granted state:

1. **Pre-provisioned users with `email = NULL` cannot be auto-revoked by the webhook.** If you pre-provision someone and they're not actually a patron, no automated path will revoke them. Use the `psql` revoke above.
2. **Webhook revoke clears `is_beta_tester` alongside `is_patron`.** If you admin-grant beta to a user whose email later matches a churning Patreon account, the next `members:pledge:delete` for that email will silently clear your beta grant. This is existing webhook behavior, not introduced by the admin page.

Neither is a security gap — they're operational gotchas. Documented for awareness.

## Audit logs

Every grant emits a structured `console.log`:

```
admin-grant { adminId, flag, targetDiscordId, targetUserId, preProvisioned }
```

Railway log grep on `admin-grant` shows the full grant history. The prefix is pinned as a constant in `app/api/admin/grant/route.ts` and asserted by the route test, so prefix drift breaks CI.

Self-debug grep prefix when the page 404s unexpectedly (e.g., your admin flag got revoked):

```
admin-page-blocked { hasSession, sessionId }
```

Both prefixes fire to `console.warn`/`console.log` — Railway captures stderr/stdout.

## Implementation references

- Page shell + 404 stealth: [app/admin/page.tsx](../app/admin/page.tsx)
- Search route: [app/api/admin/users/search/route.ts](../app/api/admin/users/search/route.ts)
- Grant route: [app/api/admin/grant/route.ts](../app/api/admin/grant/route.ts)
- Panel UI: [src/components/admin/AdminGrantPanel.tsx](../src/components/admin/AdminGrantPanel.tsx)
- Design doc: [docs/plans/2026-06-03-001-feat-admin-grant-page-plan.md](plans/2026-06-03-001-feat-admin-grant-page-plan.md)
