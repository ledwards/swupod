import { notFound } from 'next/navigation'
import { queryRow } from '@/lib/db'
import { formatSetCodeRange } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { resolveCatalogCards } from '@/src/services/cards/cardCatalogResolver'
import { archetypeShortName } from '@/src/utils/archetypeName'
import { getAspectColor } from '@/src/utils/aspectColors'
import { formatRecord } from '@/src/utils/deckRecord'
import { hyperspaceLeaderArt } from '@/src/utils/hyperspaceLeaderArt'
import DeckStatsPageClient from './DeckStatsPageClient'

interface PageProps {
  params: Promise<{ shareId: string }>
}

function cardName(card: any): string | null {
  return card?.name || card?.title || null
}

function deckCount(state: any): number {
  const positions = state?.cardPositions || {}
  return Object.values(positions).filter((pos: any) =>
    pos?.section === 'deck' &&
    pos?.enabled !== false &&
    pos?.visible !== false &&
    !pos?.card?.isLeader &&
    !pos?.card?.isBase
  ).length
}

function fallbackName(row: any, state: any): string {
  if (state?.poolName) return state.poolName
  if (row.name) return row.name
  const poolType = row.pool_type || 'sealed'
  const formatType = state?.isInfinitePool
    ? 'Limited'
    : poolType === 'draft'
      ? 'Draft'
      : poolType === 'rotisserie'
        ? 'Rotisserie Draft'
        : 'Sealed'
  const rawSet = row.set_code || ''
  const setCodes = rawSet.includes(',') ? rawSet.split(',').map((s: string) => s.trim()) : [rawSet]
  return `${formatSetCodeRange(setCodes)} ${formatType}`.trim()
}

function formatLabel(format: string | null | undefined): string {
  switch (format) {
    case 'draft':
      return 'Draft'
    case 'sealed':
      return 'Sealed'
    case 'chaos_sealed':
      return 'Chaos Sealed'
    case 'pack_blitz':
      return 'Pack Blitz'
    case 'pack_wars':
      return 'Pack Wars'
    case 'rotisserie':
      return 'Rotisserie'
    default:
      return String(format || 'Pool')
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Pool'
  }
}

function buildDeckSummary(row: any) {
  const deckBuilderState = resolveCatalogCards(jsonParse(row.deck_builder_state, {}) || {})
  const positions = deckBuilderState?.cardPositions || {}
  const leaderCard = deckBuilderState?.activeLeader ? positions[deckBuilderState.activeLeader]?.card : null
  const baseCard = deckBuilderState?.activeBase ? positions[deckBuilderState.activeBase]?.card : null
  const leaderName = cardName(leaderCard)
  const baseName = cardName(baseCard)
  const leaderImageUrl =
    leaderCard?.imageUrl ||
    leaderCard?.artUrl ||
    leaderCard?.backImageUrl ||
    null
  const leaderListImageUrl =
    hyperspaceLeaderArt(leaderName, row.set_code) ||
    leaderCard?.backImageUrl ||
    leaderImageUrl
  const baseImageUrl = baseCard?.imageUrl || baseCard?.artUrl || null
  const baseColor = baseCard ? getAspectColor(baseCard) : null
  const archetypeName = archetypeShortName({
    archetypeNickname: deckBuilderState?.archetypeNickname,
    leaderName,
    baseAspects: Array.isArray(baseCard?.aspects) ? baseCard.aspects : [],
    baseHp: typeof baseCard?.hp === 'number' ? baseCard.hp : null,
  })

  return {
    id: row.id,
    shareId: row.share_id,
    name: fallbackName(row, deckBuilderState),
    setCode: row.set_code || 'UNK',
    poolType: row.pool_type || 'sealed',
    poolTypeLabel: formatLabel(row.pool_type || 'sealed'),
    ownerName: row.owner_username || null,
    ownerId: row.user_id || null,
    draftLogUrl: row.pool_type === 'draft' && row.draft_share_id
      ? `/draft/${row.draft_share_id}/log`
      : null,
    record: {
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      draws: Number(row.draws || 0),
      label: formatRecord(row.wins, row.losses, row.draws),
    },
    leaderName,
    baseName,
    archetypeName,
    leaderImageUrl,
    leaderListImageUrl,
    baseImageUrl,
    baseColor,
    deckCardCount: deckCount(deckBuilderState),
  }
}

export default async function DeckStatsPage({ params }: PageProps) {
  const { shareId } = await params
  const row = await queryRow(
    `SELECT
       cp.id,
       cp.share_id,
       cp.user_id,
       cp.set_code,
       cp.pool_type,
       cp.name,
       cp.deck_builder_state,
       cp.wins,
       cp.losses,
       cp.draws,
       pod.share_id AS draft_share_id,
       u.username AS owner_username
     FROM card_pools cp
     LEFT JOIN pods pod ON pod.id = cp.pod_id
     LEFT JOIN users u ON u.id = cp.user_id
     WHERE cp.share_id = $1`,
    [shareId],
  )

  if (!row) notFound()

  return <DeckStatsPageClient deck={buildDeckSummary(row)} />
}
