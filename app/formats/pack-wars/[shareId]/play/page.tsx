// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Card from '@/src/components/Card'
import Button from '@/src/components/Button'
import { getPackArtUrl } from '@/src/utils/packArt'
import { useAuth } from '@/src/contexts/AuthContext'
import { isRenderableMatchId } from '@/src/utils/deckRecord'
import './play.css'

function WldBadge({
  wins, losses, draws, matchIds
}: {
  wins: number; losses: number; draws: number; matchIds: string[]
}) {
  if (wins === 0 && losses === 0 && draws === 0) return null
  const wayfinder = process.env.NEXT_PUBLIC_WAYFINDER_URL ?? 'https://plugin.wayfinder.news'
  // Drop synthetic placeholders (e.g. "manual-recover-g2") that have no match page.
  const links = (matchIds ?? []).filter(isRenderableMatchId)
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, fontSize: '14px' }}>
        {wins}W {losses}L {draws}D
      </span>
      {links.map((id, i) => (
        <a
          key={id}
          href={`${wayfinder}/matches/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '12px', color: '#93c5fd' }}
        >
          Match {i + 1}
        </a>
      ))}
    </div>
  )
}

interface CardData {
  id: string
  name: string
  type: string
  cost?: number
  aspects?: string[]
  imageUrl?: string
  backImageUrl?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isShowcase?: boolean
  rarity?: string
}

interface PoolData {
  setCode: string
  setName: string
  leaders: CardData[]
  bases: CardData[]
  deckCards: CardData[]
  packs?: CardData[][]
}

// Porg card ID from LOF (0-cost unit used to pad decks to 30)
const PORG_CARD_ID = '28294'

export default function PackWarsPlayPage() {
  const params = useParams()
  const router = useRouter()
  const shareId = params.shareId as string
  const { user } = useAuth()

  const [poolData, setPoolData] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<string | null>(null)
  const [selectedLeader, setSelectedLeader] = useState<number | null>(null)
  const [selectedBase, setSelectedBase] = useState<number | null>(null)
  const [fillWithPorgs, setFillWithPorgs] = useState(false)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [draws, setDraws] = useState(0)
  const [wayfinderMatchIds, setWayfinderMatchIds] = useState<string[]>([])

  const hasSelection = selectedLeader !== null && selectedBase !== null

  useEffect(() => {
    const loadPool = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/pools/${shareId}`, {
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Pool not found')
        }

        const response_data = await response.json()
        const data = response_data.data

        const poolInfo = typeof data.cards === 'string' ? JSON.parse(data.cards) : data.cards

        setPoolData(poolInfo)
        setWins(data.wins ?? 0)
        setLosses(data.losses ?? 0)
        setDraws(data.draws ?? 0)
        setWayfinderMatchIds(data.wayfinderMatchIds ?? [])
      } catch (err) {
        setError(err.message || 'Failed to load pool')
      } finally {
        setLoading(false)
      }
    }

    loadPool()
  }, [shareId])

  // Fire-and-forget personal-stats instrumentation. Logged-in users only —
  // anonymous visits are not tracked. Errors are swallowed; the row landing
  // is what matters. The endpoint is idempotent via UPSERT.
  useEffect(() => {
    if (!user || !shareId) return
    fetch('/api/me/play-visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ shareId }),
    }).catch(() => {})
  }, [user, shareId])

  const getDeckData = () => {
    if (!poolData || selectedLeader === null || selectedBase === null) return null

    const leader = poolData.leaders[selectedLeader]
    const base = poolData.bases[selectedBase]

    if (!leader || !base) return null

    const deckCards = poolData.packs?.flatMap(pack =>
      pack.filter(c => c.type !== 'Leader' && c.type !== 'Base')
    ) || poolData.deckCards

    const deckCounts = new Map()
    deckCards.forEach(card => {
      const id = card.id
      deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
    })

    // Build deck array
    const deck = Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count }))

    // Calculate total card count
    const totalCards = deck.reduce((sum, entry) => sum + entry.count, 0)

    // Add Porgs to reach 30 cards if option is enabled
    if (fillWithPorgs && totalCards < 30) {
      const porgsNeeded = 30 - totalCards
      deck.push({ id: PORG_CARD_ID, count: porgsNeeded })
    }

    return {
      metadata: {
        name: `[PTP Pack Wars] ${poolData.setName}`,
        author: "Protect the Pod"
      },
      leader: { id: leader.id, count: 1 },
      base: { id: base.id, count: 1 },
      deck,
      sideboard: []
    }
  }

  const copyToClipboard = async () => {
    const deckData = getDeckData()
    if (!deckData) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(deckData, null, 2))
      setMessage('Copied! Now paste it into Tabletop Simulator and prepare for surprises...')
      setMessageType('success')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 4000)
    } catch (err) {
      setMessage('Failed to copy to clipboard')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const downloadJSON = () => {
    const deckData = getDeckData()
    if (!deckData) return

    const jsonString = JSON.stringify(deckData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `[PTP Pack Wars] ${poolData?.setName || 'deck'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const packArtUrl = poolData?.setCode ? getPackArtUrl(poolData.setCode) : null

  // Count deck cards for display
  const deckCardCount = poolData?.packs?.reduce((total, pack) =>
    total + pack.filter(c => c.type !== 'Leader' && c.type !== 'Base').length
  , 0) || poolData?.deckCards?.length || 0

  if (loading) {
    return (
      <div className="pack-wars-play-page">
        <div className="loading"></div>
      </div>
    )
  }

  if (error || !poolData) {
    return (
      <div className="pack-wars-play-page">
        <div className="pack-wars-play-content">
          <div className="error-message">{error || 'Pool not found'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="pack-wars-play-page">
      {packArtUrl && (
        <div className="set-art-header" style={{
          backgroundImage: `url("${packArtUrl}")`,
        }}></div>
      )}

      <div className="pack-wars-play-content">
        <div className="play-header">
          <h1>Pack Wars</h1>
          <p className="play-pool-type">{poolData.setName}</p>
          <WldBadge
            wins={wins}
            losses={losses}
            draws={draws}
            matchIds={wayfinderMatchIds}
          />
        </div>

        {/* Instructions */}
        <div className="play-instructions">
          <h2>How to Play</h2>
          <p className="play-instructions-note">
            Pack Wars ignores aspect penalties, so you'll need <strong>Tabletop Simulator</strong> which doesn't enforce game rules.
          </p>
          <div className="play-steps">
            <div className="play-step">
              <span className="step-number">1</span>
              <div className="step-content">
                <h3>Select Your Leader & Base</h3>
                <p>Choose one leader and one base for this game. You can switch between games in a best-of-3!</p>
              </div>
            </div>

            <div className="play-step">
              <span className="step-number">2</span>
              <div className="step-content">
                <h3>Copy Your Deck</h3>
                <p>Copy your deck in JSON format. <strong>No peeking at your cards!</strong> That's the whole point of Pack Wars.</p>
              </div>
            </div>

            <div className="play-step">
              <span className="step-number">3</span>
              <div className="step-content">
                <h3>Play on Tabletop Simulator</h3>
                <p>Open the <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3005471208" target="_blank" rel="noopener noreferrer">Star Wars: Unlimited TTS mod</a> and paste your deck JSON to import it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Selection section */}
        <div className="selection-section">
          <h2>{hasSelection ? 'Ready to Play!' : 'Select Your Leader & Base'}</h2>
          <p>
            {hasSelection
              ? `Your deck has ${deckCardCount} cards from the packs.`
              : 'Choose a leader and base for this game.'}
          </p>

          {/* Leaders and Bases picker */}
          <div className="leaders-bases-picker">
            <div className="picker-group">
              <h3>Leaders</h3>
              <div className="leaders-bases-container">
                {poolData.leaders.map((leader, index) => (
                  <Card
                    key={`leader-${index}`}
                    card={{ ...leader, isLeader: true }}
                    active={selectedLeader === index}
                    disabled={selectedLeader !== null && selectedLeader !== index}
                    onClick={() => setSelectedLeader(selectedLeader === index ? null : index)}
                  />
                ))}
              </div>
            </div>

            <div className="picker-group">
              <h3>Bases</h3>
              <div className="leaders-bases-container">
                {poolData.bases.map((base, index) => (
                  <Card
                    key={`base-${index}`}
                    card={{ ...base, isBase: true }}
                    active={selectedBase === index}
                    disabled={selectedBase !== null && selectedBase !== index}
                    onClick={() => setSelectedBase(selectedBase === index ? null : index)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Porg padding option */}
        <div className="porg-option">
          <label className="porg-checkbox">
            <input
              type="checkbox"
              checked={fillWithPorgs}
              onChange={(e) => setFillWithPorgs(e.target.checked)}
            />
            <span>Fill empty slots with Porgs</span>
          </label>
          <p className="porg-explanation">
            Your deck has exactly {deckCardCount} cards (not counting leader and base). Enable this to add 0-cost Porgs to reach 30.
          </p>
        </div>

        {message && (
          <div className={`play-message ${messageType}`}>
            {message}
          </div>
        )}

        {/* Action buttons */}
        <div className="play-actions">
          <Button
            variant="back"
            size="lg"
            onClick={() => router.push(`/formats/pack-wars/${shareId}`)}
          >
            Back to Pool
          </Button>

          <Button
            variant={hasSelection ? "primary" : "danger"}
            size="lg"
            disabled={!hasSelection}
            onClick={copyToClipboard}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy to Clipboard
          </Button>

          <Button
            variant={hasSelection ? "secondary" : "danger"}
            size="lg"
            disabled={!hasSelection}
            onClick={downloadJSON}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download JSON
          </Button>
        </div>

        {!hasSelection && (
          <p className="selection-required-message">
            Select a leader and base for your game before exporting.
          </p>
        )}
      </div>
    </div>
  )
}
