'use client'
import { useEffect, useState } from 'react'
import EntryShell from '../EntryFlow/EntryShell'
import Button from '../Button'
import ContentSkeleton from '../ContentSkeleton'
import PluginCTA, { usePluginCTA } from '../PluginCTA'
import { SiteTitle } from '../SiteTheme'
import { PlayIcon, ShareIcon } from '../PodHub/icons'
import { useAuth } from '../../contexts/AuthContext'
import { PACK_FORMATS, buildKarabastDeckState, buildTtsDeck, deckCardsOf, type PackFormatKey } from './packFormats'
import { CopyIcon, DownloadIcon, PackCardTile, RecordRow } from './PackFormatBits'
import { usePackPool } from './usePackPool'
import './pack-formats.css'

const TTS_MOD_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3005471208'
type Status = { tone: 'success' | 'error'; text: string } | null

/**
 * The play step: pick a leader and base for this game, then where to play it — the AI (Pack Wars,
 * when on-platform play is on), Tabletop Simulator, or Karabast.
 */
export default function PackFormatPlay({ format, shareId, nativeAiAvailable }: { format: PackFormatKey; shareId: string; nativeAiAvailable: boolean }) {
  const f = PACK_FORMATS[format]
  const { user } = useAuth() as { user: { id: string } | null }
  const { record, error } = usePackPool(shareId)
  const { state: pluginState } = usePluginCTA()
  const [leader, setLeader] = useState<number | null>(null)
  const [base, setBase] = useState<number | null>(null)
  const [fillWithPorgs, setFillWithPorgs] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const pool = record?.pool
  const ready = leader !== null && base !== null
  const showAi = nativeAiAvailable && format === 'pack-wars'
  const deckSize = pool ? deckCardsOf(pool).length : 0

  // Personal-stats instrumentation, as on the legacy play page: signed-in users only, fire and forget.
  useEffect(() => {
    if (!user || !shareId) return
    fetch('/api/me/play-visit', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ shareId }) }).catch(() => {})
  }, [user, shareId])

  const flash = (next: Status) => {
    setStatus(next)
    setTimeout(() => setStatus(s => (s === next ? null : s)), 4000)
  }
  const ttsDeck = () => (pool ? buildTtsDeck(pool, format, leader, base, { fillWithPorgs }) : null)

  const copyJson = async () => {
    const deck = ttsDeck()
    if (!deck) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(deck, null, 2))
      flash({ tone: 'success', text: 'Copied. Paste it into Tabletop Simulator and prepare for surprises.' })
    } catch {
      flash({ tone: 'error', text: 'Failed to copy to clipboard' })
    }
  }

  const downloadJson = () => {
    const deck = ttsDeck()
    if (!deck) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${deck.metadata.name}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // The site's one deck link (/pool/[shareId]/deck, which Karabast reads through deck.json).
  // The link serves the pool's saved deck, so save this game's leader and base first.
  const copyKarabastLink = async () => {
    if (!pool || linkBusy) return
    const state = buildKarabastDeckState(pool, format, leader, base, { fillWithPorgs })
    if (!state) return
    setLinkBusy(true)
    const link = `${window.location.origin}/pool/${encodeURIComponent(shareId)}/deck`
    try {
      const saved = await fetch(`/api/pools/${encodeURIComponent(shareId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deckBuilderState: state }),
      })
      if (!saved.ok) {
        const body = await saved.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Could not save this deck for Karabast')
      }
      try {
        await navigator.clipboard.writeText(link)
        flash({ tone: 'success', text: 'Deck link copied. Paste it as your decklist on Karabast.' })
      } catch {
        flash({ tone: 'error', text: `Couldn't copy. Your deck link: ${link}` })
      }
    } catch (err) {
      flash({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save this deck for Karabast' })
    } finally {
      setLinkBusy(false)
    }
  }

  const playAi = async () => {
    if (!pool || !ready || aiBusy) return
    const pickedLeader = pool.leaders[leader]
    const pickedBase = pool.bases[base]
    if (!pickedLeader || !pickedBase) return
    setAiBusy(true)
    setAiError(null)
    try {
      const response = await fetch(`/api/formats/pack-wars/${encodeURIComponent(shareId)}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leaderId: pickedLeader.id, baseId: pickedBase.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || typeof body.url !== 'string') throw new Error(body.message || 'Could not start a game against the AI')
      window.location.assign(body.url)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Could not start a game against the AI')
      setAiBusy(false)
    }
  }

  return (
    <EntryShell setCode={pool?.setCode ?? null} loading={!pool && !error}>
      <div className="pfx-page">
        <SiteTitle subtitle={pool?.setName ?? f.subtitle}>{f.title}</SiteTitle>
        {error ? <p className="pfx-error" role="alert">{error}</p> : !pool || !record ? (
          <><ContentSkeleton kind="card" count={4}/><ContentSkeleton kind="row" count={3}/></>
        ) : (
          <>
            <RecordRow wins={record.wins} losses={record.losses} draws={record.draws} matchIds={record.wayfinderMatchIds} bestOf={format === 'pack-wars'}/>

            <section className="pfx-panel" aria-labelledby="pfx-play-pick">
              <h2 className="pfx-label" id="pfx-play-pick">{ready ? 'Ready to Play' : 'Pick Your Leader and Base'}</h2>
              <p className="pfx-muted">
                {ready
                  ? `Your deck is the other ${deckSize} cards from your ${f.packs === 1 ? 'pack' : 'packs'}. No peeking: you meet them as you draw them.`
                  : format === 'pack-wars'
                    ? 'Choose one leader and one base for this game. You can switch between games in a best of 3.'
                    : 'Choose one leader and one base for this game.'}
              </p>
              <div className="pfx-row">
                {(['leader', 'base'] as const).map(kind => {
                  const cards = kind === 'leader' ? pool.leaders : pool.bases
                  const chosen = kind === 'leader' ? leader : base
                  const choose = kind === 'leader' ? setLeader : setBase
                  return (
                    <div key={kind} className="pfx-stack" role="group" aria-labelledby={`pfx-play-${kind}`}>
                      <h3 className="pfx-card-name" id={`pfx-play-${kind}`}>{kind === 'leader' ? 'Leaders' : 'Bases'} ({cards.length})</h3>
                      <div className="pfx-cards">
                        {cards.map((card, i) => (
                          <PackCardTile
                            key={`${kind}-${i}`}
                            card={card}
                            kind={kind}
                            active={chosen === i}
                            disabled={chosen !== null && chosen !== i}
                            onClick={() => choose(chosen === i ? null : i)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {f.porgFill && (
                <label className="pfx-check">
                  <input type="checkbox" checked={fillWithPorgs} onChange={e => setFillWithPorgs(e.target.checked)}/>
                  <span className="pfx-check-copy">
                    <b>Fill Empty Slots with Porgs</b>
                    <span className="pfx-meta">Your deck has exactly {deckSize} cards (not counting leader and base). Turn this on to add 0-cost Porgs to reach 30.</span>
                  </span>
                </label>
              )}
            </section>

            <section className="pfx-panel" aria-labelledby="pfx-play-where">
              <h2 className="pfx-label" id="pfx-play-where">Play This Game</h2>
              <div className="pfx-options">
                {showAi && (
                  <div className="pfx-option">
                    <div className="pfx-actions">
                      <Button variant="primary" size="lg" disabled={!ready || aiBusy} aria-busy={aiBusy || undefined} onClick={() => void playAi()}>
                        <PlayIcon/>Play vs the AI
                      </Button>
                    </div>
                    <p className="pfx-meta">Beta: aspect penalties apply in games against the AI.</p>
                    {aiError && <p className="pfx-error" role="alert">{aiError}</p>}
                  </div>
                )}

                <div className="pfx-option">
                  <div className="pfx-actions">
                    <Button variant={showAi ? 'secondary' : 'primary'} size="lg" disabled={!ready} onClick={() => void copyJson()}>
                      <CopyIcon/>Copy deck JSON for Tabletop Simulator
                    </Button>
                    <Button disabled={!ready} onClick={downloadJson}>
                      <DownloadIcon/>Download JSON
                    </Button>
                  </div>
                  <p className="pfx-meta">
                    {format === 'pack-wars'
                      ? <>Tabletop Simulator doesn&rsquo;t enforce aspect penalties. Open the <a href={TTS_MOD_URL} target="_blank" rel="noopener noreferrer">Star Wars: Unlimited TTS mod</a> and paste your deck JSON to import it.</>
                      : <>A deck this small plays best on Tabletop Simulator. Open the <a href={TTS_MOD_URL} target="_blank" rel="noopener noreferrer">Star Wars: Unlimited TTS mod</a> and paste your deck JSON to import it.</>}
                  </p>
                </div>

                {format === 'pack-wars' && (
                  <div className="pfx-option">
                    <div className="pfx-actions">
                      <Button disabled={!ready || linkBusy} aria-busy={linkBusy || undefined} onClick={() => void copyKarabastLink()}>
                        <ShareIcon/>Copy deck link for Karabast
                      </Button>
                    </div>
                    <p className="pfx-meta">Karabast applies aspect penalties and needs 30 cards, so turn on the Porgs.</p>
                  </div>
                )}

                {status && <p className={status.tone === 'success' ? 'pfx-success' : 'pfx-error'} role="status">{status.text}</p>}
                {!ready && <p className="pfx-meta">Select a leader and base for your game before you play.</p>}

                {pluginState === 'install' && (
                  <div className="pfx-option pfx-nudge">
                    <p className="pfx-muted">Get the Wayfinder plugin to keep your game data.</p>
                    <PluginCTA variant="compact"/>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </EntryShell>
  )
}
