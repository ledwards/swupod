/**
 * swuapi deck-image contract probe.
 *
 * Answers ONE question we cannot answer from unit tests: given a card's
 * NORMAL collector number plus a `variant`, does swuapi render that card?
 *
 * This matters because our catalog gives every treatment its own collector
 * number (ASH-005 Normal, ASH-269 Hyperspace). swuapi takes `id` and
 * `variant` as separate fields, so we send the Normal number and name the
 * treatment. If that contract ever stopped holding, variant cards would
 * silently render as grey "Unknown" tiles in every share image — exactly the
 * bug this probe exists to catch, which shipped once already.
 *
 * The endpoint returns a PNG, so we compare renders rather than parse a
 * response. Hold the whole deck fixed, vary one card, hash the bytes:
 *
 *   unknown   bogus id            -> what an unresolvable card looks like
 *   baseline  ASH_005             -> the Normal printing
 *   variant   ASH_005 +Hyperspace -> the case we depend on
 *   legacy    ASH_269 +Hyperspace -> the payload we used to send
 *
 * Verdicts:
 *   variant == unknown  -> CONTRACT BROKEN. Share images are rendering
 *                          Unknown tiles right now. Drop `variant` from
 *                          toDeckCard and send the Normal id alone.
 *   variant == baseline -> variant ignored; cards render standard art.
 *                          Safe, just not the prettiest. Passes.
 *   otherwise           -> variant honored; real treatment art. Ideal.
 *
 * Exit codes: 0 contract holds (or swuapi is down — see below)
 *             1 contract broken, or swuapi rejected our request shape
 *             2 could not ask: no/stale API key, or no egress to swuapi
 *
 * A swuapi outage is NOT a contract failure. Network errors and 5xx exit 0
 * with a warning, so an unrelated outage cannot turn main red. An auth or
 * proxy refusal exits 2 — loud, but never dressed up as a contract verdict.
 *
 * The key is optional: swuapi answers /export/cards unauthenticated, so the
 * probe tries unauthenticated too rather than assuming. A 401/403 is what
 * decides that a key is needed, and that exits 2.
 *
 * Usage:  [SWUAPI_API_KEY=...] npx tsx scripts/checkDeckImageContract.ts
 */

import { createHash } from 'node:crypto'
import { getAllCards } from '../src/utils/cardData'
import { cardIdentityKey, normalizeCardId } from '../src/utils/cardNormalization'

const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'
const SWUAPI_API_KEY = process.env['SWUAPI_API_KEY'] || ''

/** A card as the deck-image endpoint wants it. */
interface ProbeCard {
  id: string
  variant?: string
  type?: string
  count: number
}

/** Thrown for "swuapi is not answering" — never a contract failure. */
class SwuapiUnavailable extends Error {}

/** Thrown when we could not ask the question: bad key, proxy, no egress. */
class SwuapiUnreachable extends Error {}

function sha(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

async function renderDeck(cards: ProbeCard[]): Promise<Buffer> {
  let res: Response
  try {
    res = await fetch(`${SWUAPI_URL}/deck-image`, {
      method: 'POST',
      // Only send the header when we actually have a key. swuapi does not
      // enforce auth on every endpoint (the hourly card sync fetches
      // /export/cards with no key at all), so an empty Bearer is worse than
      // none: it turns "no credentials" into "bad credentials".
      headers: {
        'Content-Type': 'application/json',
        ...(SWUAPI_API_KEY ? { Authorization: `Bearer ${SWUAPI_API_KEY}` } : {}),
      },
      // Title and branding stay constant across probes so the only thing
      // that can move the bytes is the card under test.
      body: JSON.stringify({
        cards,
        title: 'contract probe',
        subtitle: 'swupod',
        layout: 'limited',
      }),
    })
  } catch (err) {
    throw new SwuapiUnavailable(`could not reach ${SWUAPI_URL}: ${(err as Error).message}`)
  }

  if (res.status >= 500) {
    throw new SwuapiUnavailable(`swuapi returned ${res.status}`)
  }
  // 401/403/407 mean we never got to ask: a missing or stale key, or an
  // egress proxy standing in the way. Loud, but NOT a contract verdict —
  // reporting "contract broken" here would send someone editing the client
  // over what is really a credentials or network problem.
  if (res.status === 401 || res.status === 403 || res.status === 407) {
    throw new SwuapiUnreachable(`${res.status} ${(await res.text()).slice(0, 200)}`)
  }
  if (!res.ok) {
    // Any other 4xx is a real answer about our request shape — surface it.
    throw new Error(`swuapi rejected the probe: ${res.status} ${await res.text()}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Pick the probe fixtures out of the live catalog rather than hardcoding
 * collector numbers, so this keeps working as new sets land.
 */
function pickFixtures() {
  const cards = getAllCards() as any[]

  const normalOf = (card: any): any =>
    cards.find(
      c =>
        c.variantType === 'Normal' &&
        c.set === card.set &&
        cardIdentityKey(c) === cardIdentityKey(card)
    )

  // A leader printed both Normal and Hyperspace, in the newest set that has
  // one — the leader slot is where this bug is most visible.
  const sets = [...new Set(cards.map(c => c.set))]
  let leaderHs: any = null
  for (const set of sets.reverse()) {
    leaderHs =
      cards.find(c => c.set === set && c.isLeader && c.variantType === 'Hyperspace' && normalOf(c)) ||
      leaderHs
    if (leaderHs) break
  }
  if (!leaderHs) throw new Error('no Hyperspace leader with a Normal printing in the catalog')

  const leaderNormal = normalOf(leaderHs)
  const base = cards.find(c => c.set === leaderNormal.set && c.isBase && c.variantType === 'Normal')
  if (!base) throw new Error(`no Normal base in ${leaderNormal.set}`)

  const unit = cards.find(
    c => c.set === leaderNormal.set && c.variantType === 'Normal' && !c.isLeader && !c.isBase
  )
  if (!unit) throw new Error(`no Normal unit in ${leaderNormal.set}`)

  return { leaderNormal, leaderHs, base, unit }
}

async function main(): Promise<void> {
  // No key is not automatically fatal — /export/cards answers unauthenticated,
  // so /deck-image may too. Ask, and let a 401/403 be the one to say otherwise.
  if (!SWUAPI_API_KEY) {
    console.warn('⚠  SWUAPI_API_KEY is not set — probing unauthenticated.')
    console.warn('   If swuapi requires a key here, the request comes back 401/403')
    console.warn('   and this exits 2. Set it locally, or as a repo secret in CI.\n')
  }

  const { leaderNormal, leaderHs, base, unit } = pickFixtures()
  const normalId = normalizeCardId(leaderNormal.cardId)!
  const variantId = normalizeCardId(leaderHs.cardId)!
  const baseId = normalizeCardId(base.cardId)!
  const unitId = normalizeCardId(unit.cardId)!

  console.log(`Probing ${SWUAPI_URL}/deck-image`)
  console.log(`  leader under test: ${leaderNormal.name} — ${normalId} Normal / ${variantId} Hyperspace`)
  console.log(`  holding fixed:     base ${baseId}, deck ${unitId}\n`)

  // Everything except the leader is identical in all four renders.
  const rest: ProbeCard[] = [
    { id: baseId, type: 'Base', count: 1 },
    { id: unitId, count: 1 },
  ]
  const withLeader = (leader: ProbeCard): ProbeCard[] => [leader, ...rest]

  // A collector number far past any real card in the set.
  const bogusId = `${leaderNormal.set}_9999`

  const probes: Array<{ key: string; label: string; leader: ProbeCard }> = [
    { key: 'unknown', label: `bogus ${bogusId}`, leader: { id: bogusId, type: 'Leader', count: 1 } },
    { key: 'baseline', label: `${normalId} (no variant)`, leader: { id: normalId, type: 'Leader', count: 1 } },
    { key: 'variant', label: `${normalId} + Hyperspace`, leader: { id: normalId, variant: 'Hyperspace', type: 'Leader', count: 1 } },
    { key: 'legacy', label: `${variantId} + Hyperspace`, leader: { id: variantId, variant: 'Hyperspace', type: 'Leader', count: 1 } },
  ]

  const hashes: Record<string, string> = {}
  for (const probe of probes) {
    process.stdout.write(`  ${probe.key.padEnd(9)} ${probe.label.padEnd(26)} ... `)
    const png = await renderDeck(withLeader(probe.leader))
    hashes[probe.key] = sha(png)
    console.log(`${hashes[probe.key]}  (${png.length} bytes)`)
  }

  // A render must be reproducible for byte comparison to mean anything. If
  // swuapi stamps a timestamp into the image, every hash differs and the
  // comparisons below are noise — say so rather than reporting a false verdict.
  process.stdout.write(`\n  determinism re-run of baseline ... `)
  const repeat = sha(await renderDeck(withLeader({ id: normalId, type: 'Leader', count: 1 })))
  console.log(repeat)
  if (repeat !== hashes['baseline']) {
    console.warn('\n⚠  swuapi renders are not byte-stable (a timestamp or nonce in the image).')
    console.warn('   Byte comparison cannot decide this contract. Inspect a share image by hand.')
    process.exit(0)
  }

  console.log('\n--- verdict ---')
  if (hashes['legacy'] === hashes['unknown']) {
    console.log('· legacy payload (variant\'s own number + variant) renders Unknown — the original bug, still reproducible.')
  } else if (hashes['legacy'] === hashes['baseline']) {
    console.log('· legacy payload now renders the standard card; swuapi got more forgiving.')
  }

  if (hashes['variant'] === hashes['unknown']) {
    console.error('\n✗ CONTRACT BROKEN: a Normal id + variant renders an Unknown tile.')
    console.error('  Share images are dropping every Hyperspace/Showcase card right now.')
    console.error('  Fix: drop `variant` in toDeckCard (lib/deckImageApi.ts) and send the Normal id alone.')
    process.exit(1)
  }

  if (hashes['variant'] === hashes['baseline']) {
    console.log('\n✓ Contract holds. swuapi ignores `variant` — variant cards render standard art.')
    console.log('  Safe. If you want real treatment art in share images, that needs swuapi support.')
  } else {
    console.log('\n✓ Contract holds. swuapi honors `variant` on the Normal id — real treatment art.')
  }
  process.exit(0)
}

main().catch((err: Error) => {
  if (err instanceof SwuapiUnavailable) {
    // An outage is not a contract failure — never turn the build red for it.
    console.warn(`\n⚠  Skipping: ${err.message}`)
    process.exit(0)
  }
  if (err instanceof SwuapiUnreachable) {
    console.error(`\n✗ Could not reach swuapi to ask: ${err.message}`)
    console.error('  This says nothing about the contract — check SWUAPI_API_KEY,')
    console.error('  or whether this machine is allowed egress to api.swuapi.com.')
    process.exit(2)
  }
  console.error('\n✗ Probe failed:', err.message)
  process.exit(1)
})
