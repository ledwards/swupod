// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../src/contexts/AuthContext'
import Button from '../../../../src/components/Button'
import PlayerCircle from '../../../../src/components/PlayerCircle'
import CardWithPreview from '../../../../src/components/CardWithPreview'
import '../../../../src/App.css'
import '../../../../src/styles/backgrounds.css'
import '../../../../src/components/SealedPod.css'
import '../log/log.css'
import './report.css'
import { getPackArtUrl } from '../../../../src/utils/packArt'

interface ReportData {
  draft: {
    shareId: string
    name: string
    setCode: string
    setName: string
    status: string
    maxPlayers: number
    currentPlayers: number
    isPublic: boolean
    startedAt: string | null
    completedAt: string | null
    competitive: boolean
  }
  players: Array<{
    seatNumber: number
    userId: string
    username: string
    avatarUrl: string | null
    isBot: boolean
    draftedLeaders: unknown[]
    strategyName: string | null
    mixinName: string | null
  }>
  mySeat: number
  picks: Array<{
    type: 'leader' | 'card'
    packNumber: number
    pickInPack: number
    overallPickNumber: number
    visibleCards: Array<{ instanceId: string; [key: string]: unknown }>
    pickedInstanceId: string | null
  }>
  pool: {
    shareId: string
    cards: unknown[]
    packs: Array<{ cards: unknown[]; name?: string }>
    deckBuilderState: unknown
    reportPublic: boolean
    createdAt: string
  } | null
}

type TabId = 'seating' | 'log' | 'pool' | 'deck' | 'gameplay'

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DraftReportPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const shareId = resolvedParams.shareId
  const router = useRouter()
  const { user, isPatron } = useAuth()

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('seating')
  const [message, setMessage] = useState<string | null>(null)
  const [reportPublic, setReportPublic] = useState(false)

  useEffect(() => {
    if (!shareId) return
    async function fetchReport() {
      try {
        setLoading(true)
        const res = await fetch(`/api/draft/${shareId}/report`, { credentials: 'include' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to load report' }))
          setError(err.error || 'Failed to load report')
          return
        }
        const reportData = await res.json()
        setData(reportData)
        setReportPublic(reportData.pool?.reportPublic || false)
      } catch {
        setError('Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [shareId])

  const handleToggleVisibility = async () => {
    const newValue = !reportPublic
    setReportPublic(newValue)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reportPublic: newValue }),
      })
      if (res.ok) {
        setMessage(newValue ? 'Report is now public' : 'Report is now private')
        setTimeout(() => setMessage(null), 3000)
      } else {
        setReportPublic(!newValue)
      }
    } catch {
      setReportPublic(!newValue)
    }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/draft/${shareId}/report`
    await navigator.clipboard.writeText(url)
    setMessage('Report link copied!')
    setTimeout(() => setMessage(null), 3000)
  }

  if (loading) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-loading">Loading report...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-content">
          <div className="draft-report-error">
            <h2>Error</h2>
            <p>{error || 'Report not found'}</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  if (isPatron === false) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-content">
          <div className="draft-report-error">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are available exclusively for Friends of the Pod.</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  const { draft, players, picks, pool } = data
  const completedDate = draft.completedAt
    ? new Date(draft.completedAt).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      })
    : null

  const leaderPicks = picks.filter(p => p.type === 'leader')
  const pack1Picks = picks.filter(p => p.type === 'card' && p.packNumber === 1)
  const pack2Picks = picks.filter(p => p.type === 'card' && p.packNumber === 2)
  const pack3Picks = picks.filter(p => p.type === 'card' && p.packNumber === 3)
  const logSections = [
    { title: 'Leader Draft', picks: leaderPicks },
    { title: 'Pack 1', picks: pack1Picks },
    { title: 'Pack 2', picks: pack2Picks },
    { title: 'Pack 3', picks: pack3Picks },
  ].filter(s => s.picks.length > 0)

  const poolPacks = pool?.packs || []

  const deckState = pool?.deckBuilderState || null
  const deckCards = []
  const sideboardCards = []
  let activeLeaderCard = null
  let activeBaseCard = null

  if (deckState && typeof deckState === 'object' && deckState.cardPositions) {
    const allCards = pool?.cards || []
    const cardMap = new Map()
    for (const card of allCards) {
      cardMap.set(card.instanceId || card.id, card)
    }
    for (const [id, pos] of Object.entries(deckState.cardPositions)) {
      const card = cardMap.get(id)
      if (!card) continue
      if (card.isLeader && id === deckState.activeLeader) activeLeaderCard = card
      else if (card.isBase && id === deckState.activeBase) activeBaseCard = card
      else if (pos.section === 'deck' && pos.visible !== false && pos.enabled !== false) deckCards.push(card)
      else if (pos.section === 'sideboard') sideboardCards.push(card)
    }
  }

  deckCards.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))

  const packArtUrl = data?.draft?.setCode ? getPackArtUrl(data.draft.setCode) : null
  const setArtStyle = packArtUrl ? { backgroundImage: `url("${packArtUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}

  const tabs = [
    { id: 'seating', label: 'Draft Seating' },
    { id: 'log', label: 'Draft Log' },
    { id: 'pool', label: 'Pool' },
    { id: 'deck', label: 'Deck' },
    { id: 'gameplay', label: 'Gameplay', placeholder: true },
  ]

  return (
    <div className="draft-report-page page-background-with-art">
      {packArtUrl && <div className="set-art-header" style={setArtStyle}></div>}
      <div className="draft-report-page-content">
      <div className="draft-report-header">
        <div className="draft-report-header-content">
          <div className="draft-report-header-info">
            <div className="draft-report-label">Draft Report</div>
            <h1 className="draft-report-title">{draft.name || `${draft.setName} Draft`}</h1>
            <div className="draft-report-meta">
              {completedDate && `${completedDate} · `}
              {draft.maxPlayers} Players
              {draft.competitive && ' · Competitive'}
            </div>
          </div>
          <div className="draft-report-header-actions">
            <button
              className={`draft-report-visibility-toggle ${reportPublic ? 'public' : ''}`}
              onClick={handleToggleVisibility}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {reportPublic ? (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                  </>
                ) : (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </>
                )}
              </svg>
              {reportPublic ? 'Public' : 'Private'}
            </button>
            <button className="draft-report-copy-link" onClick={handleCopyLink}>
              Copy Link
            </button>
          </div>
        </div>
      </div>

      <div className="draft-report-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`draft-report-tab ${activeTab === tab.id ? 'active' : ''} ${tab.placeholder ? 'placeholder' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="draft-report-content">
        {activeTab === 'seating' && (
          <div className="draft-report-seating">
            <PlayerCircle
              players={players.map(p => ({
                odId: p.userId,
                username: p.username,
                avatarUrl: p.avatarUrl,
                seatNumber: p.seatNumber,
                isBot: p.isBot,
                pickStatus: 'picked',
                leaders: p.draftedLeaders,
                draftedLeaders: p.draftedLeaders,
              }))}
              maxPlayers={draft.maxPlayers}
              currentUserId={user?.id}
              showLeaderInfo={true}
            />
          </div>
        )}

        {activeTab === 'log' && (
          <div className="draft-report-log">
            {logSections.length === 0 ? (
              <div className="draft-report-deck-empty">No draft log data available.</div>
            ) : (
              logSections.map(section => (
                <div key={section.title} className="draft-log-section">
                  <h3>{section.title}</h3>
                  {section.picks.map((pick, i) => (
                    <div key={i} className="draft-log-pick-row">
                      <div className="draft-log-pick-label">
                        {section.title === 'Leader Draft' ? 'Leaders' : `Pack ${pick.packNumber}`}
                        <span>Pick {pick.pickInPack}</span>
                      </div>
                      <div className="draft-log-pack-cards cards-grid">
                        {pick.visibleCards.map(card => (
                          <CardWithPreview
                            key={card.instanceId}
                            card={card}
                            selected={card.instanceId === pick.pickedInstanceId}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pool' && (
          <div className="draft-report-pool">
            {poolPacks.length === 0 ? (
              <div className="draft-report-deck-empty">No pool data available.</div>
            ) : (
              poolPacks.map((pack, index) => (
                <div key={index} className="draft-report-pool-section">
                  <h3>{pack.name || `Round ${index + 1}`}</h3>
                  <div className="cards-grid">
                    {(pack.cards || []).map((card, ci) => (
                      <CardWithPreview key={card.instanceId || ci} card={card} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'deck' && (
          <div className="draft-report-deck">
            {!deckState ? (
              <div className="draft-report-deck-empty">Still deckbuilding...</div>
            ) : (
              <>
                {(activeLeaderCard || activeBaseCard) && (
                  <div className="draft-report-pool-section">
                    <h3>Leader & Base</h3>
                    <div className="cards-grid">
                      {activeLeaderCard && <CardWithPreview card={activeLeaderCard} selected />}
                      {activeBaseCard && <CardWithPreview card={activeBaseCard} selected />}
                    </div>
                  </div>
                )}

                {deckCards.length > 0 && (
                  <div className="draft-report-pool-section">
                    <h3>Deck ({deckCards.length})</h3>
                    <div className="cards-grid">
                      {deckCards.map((card, i) => (
                        <CardWithPreview key={card.instanceId || i} card={card} />
                      ))}
                    </div>
                  </div>
                )}

                {sideboardCards.length > 0 && (
                  <div className="draft-report-pool-section">
                    <h3>Sideboard ({sideboardCards.length})</h3>
                    <div className="cards-grid" style={{ opacity: 0.6 }}>
                      {sideboardCards.map((card, i) => (
                        <CardWithPreview key={card.instanceId || i} card={card} />
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        )}

        {activeTab === 'gameplay' && (
          <div className="draft-report-gameplay-placeholder">
            <h3>Gameplay — Coming Soon</h3>
            <p>
              Match results, replay links, deck validation, and tournament brackets will appear here
              once integrated with the Wayfinder extension.
            </p>
            <p>
              <a href="https://wayfinder.news" target="_blank" rel="noopener noreferrer">
                Learn more about Wayfinder
              </a>
            </p>
          </div>
        )}
      </div>

      {message && <div className="draft-report-message">{message}</div>}
      </div>
    </div>
  )
}
