// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../../src/contexts/AuthContext'
import Button from '../../../../../src/components/Button'
import PlayerCircle from '../../../../../src/components/PlayerCircle'
import CardWithPreview from '../../../../../src/components/CardWithPreview'
import '../../../../../src/App.css'
import '../../../../../src/styles/backgrounds.css'
import '../../../../../src/components/SealedPod.css'
import '../../log/log.css'
import '../report.css'
import { getPackArtUrl } from '../../../../../src/utils/packArt'
import { parseMarkdownToHTML } from '../../../../../src/utils/markdown'
import { useStickyTab } from '../../../../../src/hooks/useStickyTab'

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
    activeLeaderName: string | null
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
    notes: string | null
    createdAt: string
  } | null
}

const REPORT_TABS = ['seating', 'log', 'pool', 'deck', 'notes', 'gameplay'] as const
type TabId = typeof REPORT_TABS[number]

interface PageProps {
  params: Promise<{ shareId: string; poolShareId: string }>
}

export default function DraftReportPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const shareId = resolvedParams.shareId
  const poolShareId = resolvedParams.poolShareId
  const router = useRouter()
  const { user, isPatron } = useAuth()

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Hash-deep-linked tabs (#deck etc.). No storageKey — a fresh report should
  // open on Seating, not whatever tab you last viewed on a different report.
  const [activeTab, setActiveTab] = useStickyTab<TabId>(REPORT_TABS, 'seating')
  const [message, setMessage] = useState<string | null>(null)
  const [reportPublic, setReportPublic] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showMdHelp, setShowMdHelp] = useState(false)

  useEffect(() => {
    if (!shareId || !poolShareId) return
    async function fetchReport() {
      try {
        setLoading(true)
        const res = await fetch(`/api/draft/${shareId}/report/${poolShareId}`, { credentials: 'include' })
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
    const url = `${window.location.origin}/draft/${shareId}/report/${poolShareId}#${activeTab}`
    await navigator.clipboard.writeText(url)
    setMessage('Report link copied!')
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: notesDraft }),
      })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          pool: prev.pool ? { ...prev.pool, notes: notesDraft || null } : prev.pool,
        } : prev)
        setEditingNotes(false)
      }
    } catch {
      // silently fail
    } finally {
      setSavingNotes(false)
    }
  }

  if (loading) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-loading">Loading report...</div>
      </div>
    )
  }

  if (error || !data) {
    const isPrivate = error === 'This report is private'
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-content">
          <div className="draft-report-error">
            {isPrivate ? (
              <>
                <h2>Private Report</h2>
                <p>This draft report is set to private. Ask the owner to make it public so you can view it.</p>
              </>
            ) : (
              <>
                <h2>Report Not Found</h2>
                <p>{error || 'This report could not be loaded.'}</p>
              </>
            )}
            <Button variant="back" onClick={() => router.push('/')}>Back Home</Button>
          </div>
        </div>
      </div>
    )
  }

  const { draft, players, picks, pool } = data
  const isOwner = data.isOwner ?? (user && data.mySeat != null)
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
    for (const [id, pos] of Object.entries(deckState.cardPositions)) {
      const card = pos.card
      if (!card) continue
      if ((card.isLeader || card.type === 'Leader') && id === deckState.activeLeader) activeLeaderCard = card
      else if ((card.isBase || card.type === 'Base') && id === deckState.activeBase) activeBaseCard = card
      else if (pos.section === 'deck' && pos.visible !== false && pos.enabled !== false) deckCards.push(card)
      else if (pos.section === 'sideboard' && pos.visible !== false) sideboardCards.push(card)
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
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div className="draft-report-page page-background-with-art">
      {packArtUrl && <div className="set-art-header" style={setArtStyle}></div>}
      <div className="draft-report-page-content">
      <div className="draft-report-header">
        <div className="draft-report-header-content">
          <div className="draft-report-header-info">
            <div className="draft-report-label">Draft Report{data.mySeat != null && (players.find(p => p.seatNumber === data.mySeat) || players[data.mySeat])?.username ? <> | <span className="draft-report-username">{(players.find(p => p.seatNumber === data.mySeat) || players[data.mySeat]).username}</span></> : ''}</div>
            <h1 className="draft-report-title">{draft.name || `${draft.setName} Draft`}</h1>
            <div className="draft-report-meta">
              {completedDate && `${completedDate} · `}
              {draft.maxPlayers} Players
              {draft.competitive && ' · Competitive'}
            </div>
          </div>
          <div className="draft-report-header-actions">
            {isOwner && (
              <Button
                variant={reportPublic ? 'primary' : 'danger'}
                onClick={handleToggleVisibility}
                style={{
                  borderColor: reportPublic ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
                  boxShadow: reportPublic ? '0 0 8px rgba(0, 255, 0, 0.2)' : '0 0 8px rgba(255, 0, 0, 0.2)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <span>{reportPublic ? 'Public' : 'Private'}</span>
              </Button>
            )}
            <Button variant="secondary" onClick={handleCopyLink}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>Copy Link</span>
            </Button>
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
                id: p.userId,
                username: p.username,
                avatarUrl: p.avatarUrl,
                seatNumber: p.seatNumber,
                isBot: p.isBot,
                draftedLeaders: p.draftedLeaders,
                activeLeaderName: p.activeLeaderName || null,
                chosenBase: p.chosenBase || null,
              }))}
              maxPlayers={draft.maxPlayers}
              currentUserId={user?.id}
              showLeaderInfo="simple"
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
            {!deckState && (!pool?.cards || pool.cards.length === 0) ? (
              <div className="draft-report-deck-empty">
                Still deckbuilding...
                {pool?.shareId && (
                  <div style={{ marginTop: '1rem' }}>
                    <Button variant="primary" onClick={() => { window.location.href = `/draft/${shareId}/pod` }}>
                      Build Your Deck
                    </Button>
                  </div>
                )}
              </div>
            ) : !deckState ? (
              <>
                <div className="draft-report-pool-section">
                  <h3>Drafted Cards ({pool.cards.length})</h3>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: '12px' }}>Deck not yet built — showing full card pool.</p>
                  <div className="cards-grid">
                    {[...pool.cards].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0)).map((card, i) => (
                      <CardWithPreview key={card.instanceId || i} card={card} />
                    ))}
                  </div>
                </div>
              </>
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

                {!activeLeaderCard && !activeBaseCard && deckCards.length === 0 && sideboardCards.length === 0 && pool?.shareId && (
                  <div className="draft-report-deck-empty">
                    No deck data available.
                    <div style={{ marginTop: '1rem' }}>
                      <Button variant="primary" onClick={() => { window.location.href = `/draft/${shareId}/pod` }}>
                        Build Your Deck
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="draft-report-notes">
            {editingNotes ? (
              <>
                <textarea
                  className="draft-report-notes-edit"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Write your notes here... (Markdown supported)"
                  autoFocus
                />
                <div className="draft-report-notes-actions">
                  <Button variant="primary" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="secondary" onClick={() => { setEditingNotes(false); setNotesDraft(pool?.notes || '') }}>
                    Cancel
                  </Button>
                  <button className="draft-report-md-help-btn" onClick={() => setShowMdHelp(v => !v)} title="Markdown reference">
                    ?
                  </button>
                </div>
                {showMdHelp && (
                  <div className="draft-report-md-help">
                    <div className="draft-report-md-help-header">
                      <strong>Markdown Reference</strong>
                      <button onClick={() => setShowMdHelp(false)}>&times;</button>
                    </div>
                    <table>
                      <tbody>
                        <tr><td><code># Heading 1</code></td><td>Large heading</td></tr>
                        <tr><td><code>## Heading 2</code></td><td>Medium heading</td></tr>
                        <tr><td><code>### Heading 3</code></td><td>Small heading</td></tr>
                        <tr><td><code>**bold text**</code></td><td><strong>bold text</strong></td></tr>
                        <tr><td><code>- item</code></td><td>Bullet list</td></tr>
                        <tr><td><code>[link](url)</code></td><td>Hyperlink</td></tr>
                        <tr><td><code>`code`</code></td><td>Inline code</td></tr>
                        <tr><td><code>---</code></td><td>Horizontal rule</td></tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : pool?.notes ? (
              <>
                {isOwner && (
                  <button className="draft-report-notes-edit-btn" onClick={() => { setNotesDraft(pool.notes || ''); setEditingNotes(true) }} title="Edit notes">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                )}
                <div
                  className="draft-report-notes-view"
                  dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(pool.notes) }}
                />
              </>
            ) : isOwner ? (
              <div
                className="draft-report-notes-empty"
                onClick={() => { setNotesDraft(''); setEditingNotes(true) }}
              >
                Click to add notes...
              </div>
            ) : (
              <div className="draft-report-notes-empty" style={{ cursor: 'default' }}>
                No notes yet.
              </div>
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
            {pool?.shareId && (
              <div style={{ marginTop: '1.5rem' }}>
                <Button variant="primary" onClick={() => { window.location.href = `/pool/${pool.shareId}/deck/play` }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Play
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {message && <div className="draft-report-message">{message}</div>}
      </div>
    </div>
  )
}
