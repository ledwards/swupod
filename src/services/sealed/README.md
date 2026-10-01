# Trusted solo sealed generation

Authenticated `/pools/new` openings now prepare a real 24-pack box on the server.
The existing opening animation and random consecutive 6/8-pack window selection
use that returned box. On completion, the browser submits only the artifact ID
and selected start index. Finalization locks the owned artifact and atomically
creates the saved pool plus immutable `ptp_native_pool_evidence`; the browser's
cards, counts, ownership and provenance are never accepted as authority.

`POST /api/sealed/generate` requires a current authenticated session and same-origin
request. `action: prepare` accepts `setCode`, numeric `packCount` (6 or 8), and a
UUID `requestId`. Repeating the request uses the same stored box. `action: finalize`
accepts `generationId` and integer `windowStart`. Repeating the same finalization
returns the same pool; changing the selected window afterward conflicts. Every
artifact belongs to its user and expires after 24 hours if unopened. Retry after
successful finalization remains safe even after artifact expiry. Unknown sets,
unavailable beta sets, unsupported Carbonite combinations, and supplied card
payloads are rejected. Existing belt and full-box collation functions are reused.

Migration 100 follows native migrations 096–099. The artifact table prohibits
updates. Its boxes contain full card data; limit creation to six per user per
minute. Expired artifacts can be pruned by operations after their retry window;
this change does not schedule retention jobs or silently delete provenance.

Anonymous openings retain the existing browser-generated practice flow and cannot
become certified just by claiming their mutable pool later. That remaining product
path requires a server-owned guest artifact and secure claim flow. Historical pools
are not backfilled. Engine support policy still controls whether any generated set
or card is eligible to launch; generation alone does not promise rules coverage.

Focused checks: `node --import tsx --test src/services/sealed/soloGeneration.test.ts
app/api/sealed/generate/route.test.ts`. Database atomicity uses the existing
`withTransaction` boundary; deployed browser flow should also exercise real PG
migration, pack randomization, retry and deck continuation before enabling play.
