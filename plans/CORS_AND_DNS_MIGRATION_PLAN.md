# CORS Fix + DNS Migration Plan

**Status:** in progress
**Started:** 2026-05-21
**Trigger:** Veld (Karabast) reported that `protectthepod.com` doesn't return CORS headers on all responses, blocking their migration to a new CORS-required architecture.

---

## Background

### The CORS problem

Veld needed `Access-Control-Allow-Origin: *` headers on **every** response from the deck JSON endpoint (`/api/pools/:shareId/deck.json`), not just the OPTIONS preflight. He found:

- ✅ `OPTIONS` preflight had CORS headers (working)
- ✅ `GET` 200 success had CORS headers (working)
- ❌ `GET` 404/400/500 error paths had no CORS headers — they go through `errorResponse()` / `handleApiError()` in `lib/utils.ts`, which never added CORS
- ❌ `http://www.protectthepod.com/*` 301-redirects to `https://www.` via Railway's edge, and the redirect doesn't carry CORS headers — Karabast was hitting this
- ❌ Apex `protectthepod.com/*` worse: Squarespace's hosting 301-redirects it to `http://www.` (note: http, not https), creating a 2-hop chain `apex → http://www. → https://www.`

### The DNS problem

Investigating the redirect chain revealed:

- Registrar: **Squarespace Domains** (acquired Google Domains in 2024)
- Nameservers: Google Cloud DNS (`ns-cloud-eN.googledomains.com`)
- Apex `protectthepod.com` has 4 A records pointing at **Squarespace hosting IPs** (198.185.x.x, 198.49.x.x) — these IPs do the broken `http://www.` redirect
- `www.protectthepod.com` is a CNAME to Railway (working correctly)
- `swag.protectthepod.com` is on **Fourthwall** (creator merch platform, not Squarespace as we initially assumed) — MX records to `fourthwall.com`, Zendesk + SendGrid for support email

Squarespace's apex forwarding can't be cleanly fixed because it always redirects to HTTP. The clean solution is to move DNS off Squarespace to a provider that supports CNAME-at-apex flattening so the apex can point directly at Railway.

---

## Decision: Cloudflare DNS

Cloudflare supports CNAME flattening at the apex, is free, takes ~15 minutes, and keeps Squarespace as the registrar (no domain transfer). Fourthwall, Zendesk, and SendGrid records all move over as CNAMEs/MX/TXT and continue working.

Alternatives considered:
- **Fix Squarespace's redirect target in their UI** — they only allow HTTP, so this isn't actually possible
- **Use Railway's resolved IP as an A record** — works today but Railway can rotate IPs without warning
- **Move registrar to Cloudflare/Porkbun/Namecheap** — overkill, no benefit beyond DNS

---

## What's done

### Code change (shipped in this branch, not yet deployed)

**File:** `app/api/pools/[shareId]/deck.json/route.ts`

Added `CORS_HEADERS` constant and `withCors()` helper. Applied CORS headers to all response paths including the 404/400/500 error branches that previously went through `errorResponse()` / `handleApiError()` without them.

Verified:
- OPTIONS still returns 204 with CORS headers
- 200 success still returns CORS headers
- 404/400/500 error responses now also return CORS headers
- Lint passes (zero new errors)

### Railway

Added `protectthepod.com` as a custom domain on the production `swupod` service via the Railway dashboard. Railway is provisioning SSL and waiting for DNS to point at it. Required DNS records:

- **CNAME** `@` → `omitrg2y.up.railway.app`
- **TXT** `_railway-verify` → `railway-verify=f913ea1ea1e0bee48773285710c67a2d148325409a96ed8eeb98b684fc1078a9`

### DNS snapshot

`scripts/dns-snapshot.sh` captures all DNS records by querying a known list of names. Used to diff before/after the migration. Current snapshot saved to `dns-squarespace.txt`. Gitignored.

---

## What's left

### 1. Create Cloudflare account + zone

1. Sign up at https://cloudflare.com (free plan)
2. **+ Add a Site** → `protectthepod.com`
3. Cloudflare auto-scans and imports DNS records. **Verify the import:**
   ```bash
   ./scripts/dns-snapshot.sh dns-cloudflare.txt <cloudflare-ns>
   diff dns-squarespace.txt dns-cloudflare.txt
   ```
   Expected differences: only NS and SOA records. Everything else should be byte-identical.

### 2. Add the new Railway records at Cloudflare (BEFORE cutover)

In Cloudflare DNS:

- **CNAME** `@` → `omitrg2y.up.railway.app`
  - Proxy status: **DNS only (gray cloud)** — orange cloud proxying interferes with Railway's Let's Encrypt provisioning
- **TXT** `_railway-verify` → `railway-verify=f913ea1ea1e0bee48773285710c67a2d148325409a96ed8eeb98b684fc1078a9`
- **Delete** the 4 imported apex A records pointing to Squarespace's `198.185.x.x` / `198.49.x.x`

These don't take effect until nameservers cut over, but having them in place means cutover is instant.

### 3. Verify expected diff

```bash
./scripts/dns-snapshot.sh dns-cloudflare.txt <cloudflare-ns>
diff dns-squarespace.txt dns-cloudflare.txt
```

**Acceptable differences:**

| Squarespace (old) | Cloudflare (new) |
|---|---|
| 4× A records → Squarespace IPs | CNAME → `omitrg2y.up.railway.app` |
| — | TXT `_railway-verify` → `railway-verify=f913...` |
| 4× NS → `ns-cloud-eN.googledomains.com` | 2× NS → Cloudflare nameservers |
| SOA → Google Cloud DNS | SOA → Cloudflare |

**Everything else must be identical.** If anything else differs, **stop**, investigate, fix Cloudflare side, re-snapshot, re-diff.

### 4. Cut nameservers at Squarespace

1. Log into Squarespace → **Settings** → **Domains** → `protectthepod.com` → **Nameservers**
2. Change from Squarespace defaults to the 2 Cloudflare nameservers Cloudflare gave you
3. Save

Propagation: usually 5–30 min, can be up to 48 hours. Cloudflare's dashboard will flip to "Active" when it detects authoritative NS change.

### 5. Verify post-cutover

```bash
# Apex should resolve via Cloudflare's CNAME flattening to Railway's edge
dig +short A protectthepod.com
# Expect: a Railway edge IP like 66.33.22.x

# www should be unchanged
dig +short www.protectthepod.com
# Expect: Railway CNAME chain → Railway edge IP

# Railway SSL should provision within a few minutes of DNS resolving correctly
curl -sI https://protectthepod.com/
# Expect: 200 or a clean 301 to https://www. (depending on Step 6 below)

# Swag store should be unchanged
curl -sI https://swag.protectthepod.com/
# Expect: 200 from Fourthwall
```

Also: Karabast's CORS check against `https://www.protectthepod.com/api/pools/.../deck.json` should pass on all response types now (including 404). Veld confirmed this is the fix they need.

### 6. Decide: apex → www redirect, or serve both?

Railway will serve both `protectthepod.com` and `www.protectthepod.com` after this is done. Code references `https://www.protectthepod.com` everywhere (`SITE_URL`, OG image URLs, hardcoded strings). To keep `www` canonical, add a Next.js redirect:

```js
// next.config.js
async redirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'protectthepod.com' }],
      destination: 'https://www.protectthepod.com/:path*',
      permanent: true,
    },
  ]
}
```

This puts the apex→www hop inside Next.js (with full control over headers, CORS, etc.) instead of relying on edge behavior.

**Not strictly required for this migration to succeed** — punt to a follow-up if you want.

---

## Reply already sent to Veld

> Just shipped a fix on our side — error responses (404/400/500) weren't including CORS headers, only the success path was. Should be consistent across all responses now once the deploy lands.
>
> One thing on your end: you mentioned hitting `http://www.protectthepod.com/...` and getting a 301 to `https://`. That redirect happens at Railway's edge layer, and it doesn't include CORS headers (nor can I add them there). If you can just point Karabast at `https://www.protectthepod.com/api/pools/SHAREID/deck.json` directly, the redirect goes away entirely and you'll be on the canonical URL we already advertise.

---

## Rollback

If anything goes wrong after the NS cutover:

1. **Fastest rollback (DNS):** in Squarespace, change nameservers back to the original `ns-cloud-eN.googledomains.com` set. All original records are still there at Google Cloud DNS — they weren't deleted, just orphaned. Propagation: 5–30 min back to original.

2. **Code rollback:** the CORS fix in `app/api/pools/[shareId]/deck.json/route.ts` is purely additive (more headers on more responses). Reverting it returns to the previous "CORS on success only" behavior. No data impact.

3. **Railway custom domain:** safe to leave attached even if not used — Railway just keeps a Let's Encrypt cert ready. Or remove via dashboard.

---

## Files touched

- `app/api/pools/[shareId]/deck.json/route.ts` — CORS on all response paths
- `scripts/dns-snapshot.sh` — new, reusable DNS diff tool
- `dns-squarespace.txt` — current snapshot (gitignored)
- `.gitignore` — added `dns-*.txt` patterns
- `plans/CORS_AND_DNS_MIGRATION_PLAN.md` — this file

---

## Cloudflare API automation (reference, if doing the migration)

Cloudflare's REST API can automate nearly everything in steps 1–3 above. CF account already exists. Manual steps remaining: API token creation (~1 min) and Squarespace nameserver cutover (~1 min, Squarespace has no public registrar API).

### Manual prerequisites

1. Create a scoped API token at https://dash.cloudflare.com/profile/api-tokens
   - Permissions: `Zone:Edit`, `DNS:Edit`
   - Zone resources: `All zones` (or scope to `protectthepod.com` once the zone exists)
   - Save the token value somewhere safe (only shown once)

### Useful endpoints

All endpoints are `https://api.cloudflare.com/client/v4/...` with header `Authorization: Bearer $CF_API_TOKEN`.

| Endpoint | Purpose |
|---|---|
| `POST /zones` body `{name: "protectthepod.com", account: {id: "..."}}` | Create the zone. Response includes `result.name_servers` — the 2 nameservers to paste at Squarespace. |
| `GET /accounts` | Get your account ID (needed for zone creation). |
| `GET /zones?name=protectthepod.com` | Look up an existing zone by name. |
| `POST /zones/:id/dns_records/import` form-data with `file=@zone.bind` | Bulk-import a BIND zone file. Generate from `dns-squarespace.txt`. |
| `POST /zones/:id/dns_records` body `{type, name, content, ttl, proxied}` | Create one record at a time. Use this for the new Railway CNAME if you want explicit `proxied: false` (orange cloud interferes with Railway SSL). |
| `GET /zones/:id/dns_records?per_page=100` | List all records — use to generate a `dns-cloudflare.txt` snapshot for diff. |
| `GET /zones/:id` | Returns `status: "pending"` until Squarespace nameserver cutover is detected, then `status: "active"`. Poll this to know when activation completes. |

### One-pass migration sketch (~150 lines TS)

```ts
// scripts/migrate-dns-to-cloudflare.ts (not yet built)
// 1. Get account ID
// 2. Create zone protectthepod.com (or look up if it exists)
// 3. Parse dns-squarespace.txt into records
// 4. Filter: drop the 4 Squarespace apex A records (198.x.x.x)
// 5. Append: CNAME @ -> omitrg2y.up.railway.app (proxied: false)
//            TXT _railway-verify -> railway-verify=f913...
// 6. POST each record via /zones/:id/dns_records (gives us proxied control per-record)
// 7. GET back all records, write dns-cloudflare.txt
// 8. Print the diff vs dns-squarespace.txt
// 9. Print the 2 CF nameservers prominently — "paste these at Squarespace"
// 10. (Optional) --watch mode: poll GET /zones/:id until status === "active"
```

Cloudflare's dashboard "Add a Site" flow does roughly equivalent work (scan, import, assign nameservers) but doesn't give per-record proxy control during import and doesn't generate a diff against our pre-snapshot.

### Skipping automation

Doing it in the CF dashboard is also fine — slower, more clicks, but no script to write/maintain. ~5 min instead of 1 min. Snapshot/diff verification still happens via `scripts/dns-snapshot.sh` either way.

---

## Open questions

- Should we also add the apex→www redirect in `next.config.js` (see Step 6) as part of this work, or punt to a follow-up?
