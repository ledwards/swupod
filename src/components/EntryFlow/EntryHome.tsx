'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../Button'
import Modal from '../Modal'
import UnfinishedRow, { type UnfinishedItem } from './UnfinishedRow'
import { MODE_ART } from '../LandingPage'
import { usePublicPodsSocket } from '@/src/hooks/usePublicPodsSocket'
import EntryShell from './EntryShell'
import { EntrySkeleton } from './EntrySkeleton'
type Art = { name: string; imageUrl: string }
type EntryData = {
  latest: { code: string; name: string; public: boolean; prereleaseDate?: string; releaseDate?: string }
  tableImage?: string
  commons: Art[]
  leaders: Art[]
  packs: string[]
  resumes: UnfinishedItem[]
}
export default function EntryHome() {
  const [unfinishedOpen, setUnfinishedOpen] = useState(false)
  const router = useRouter(),
    pods = usePublicPodsSocket().filter((p) => p.podType === 'draft')
  const [data, setData] = useState<EntryData | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const [lobbies, setLobbies] = useState<
      | {
          matchId: string
          username?: string
          setCode: string
          poolType: string
          packCount: number
        }[]
      | null
    >(null),
    [lobbyError, setLobbyError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/entry', { signal: controller.signal })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw Error(j.error || 'Unable to load your home page.')
        setData(j.data ?? j)
        setError('')
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [retry])
  useEffect(() => {
    let stopped = false
    async function refresh() {
      try {
        const r = await fetch('/api/play/native/public')
        const j = await r.json()
        if (!r.ok) throw Error(j.error || 'Unable to load lobbies.')
        if (!stopped) {
          setLobbies(j.entries ?? [])
          setLobbyError('')
        }
      } catch (e) {
        if (!stopped) setLobbyError(e instanceof Error ? e.message : 'Unable to load lobbies.')
      }
    }
    void refresh()
    const timer = setInterval(refresh, 15000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])
  if (!data && !error) return <EntrySkeleton />
  if (!data)
    return (
      <EntryShell>
        <p role="alert">{error}</p>
        <Button onClick={() => setRetry((x) => x + 1)}>Retry</Button>
      </EntryShell>
    )
  return (
    <EntryShell
      setCode={data.latest.code}
      home
      banner={
        <div className="entry-promo">
          <img src={data.packs[0]} alt="" />
          <div>
            <strong>{data.latest.name} is live!</strong>
            <span>
              Pre-Release Date: {data.latest.prereleaseDate
                ? new Date(`${data.latest.prereleaseDate}T00:00:00Z`).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                  })
                : 'TBA'}
            </span>
            <span>
              Release Date: {data.latest.releaseDate
                ? new Date(`${data.latest.releaseDate}T00:00:00Z`).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                  })
                : 'TBA'}
            </span>
          </div>
        </div>
      }
    >
      {data.resumes.length > 0 && (
        <section className="entry-panel entry-resume">
          {data.resumes.slice(0, 1).map((r) => (
            <UnfinishedRow key={r.id} item={r} heading="Pick up where you left off" onContinue={() => router.push(r.href)} />
          ))}
          <div className="entry-resume-more">
            {data.resumes.length > 1 && (
              <Button size="sm" onClick={() => setUnfinishedOpen(true)} aria-haspopup="dialog">
                More
              </Button>
            )}
          </div>
        </section>
      )}
      <Modal
        isOpen={unfinishedOpen}
        onClose={() => setUnfinishedOpen(false)}
        title="Unfinished games and decks"
        showCloseButton
        variant="wide"
        className="entry-unfinished-modal"
      >
        {data.resumes.map((r) => (
          <UnfinishedRow key={r.id} item={r} onContinue={() => router.push(r.href)} />
        ))}
      </Modal>
      <div
        className="entry-choices"
        style={
          {
            '--entry-table-image': `url("${data.tableImage ?? '/entry-flow/table-dejarik.png'}")`,
          } as CSSProperties
        }
      >
        {(['draft', 'sealed', 'play'] as const).map((mode) => (
          <button
            key={mode}
            className={`entry-choice entry-choice-${mode}`}
            onClick={() => router.push(`/${mode === 'play' ? 'play' : `${mode}/setup`}`)}
          >
            <div className="entry-choice-art">
              {(mode === 'draft'
                ? data.commons
                : mode === 'play'
                  ? data.leaders
                  : data.packs.map((imageUrl) => ({ imageUrl, name: '' }))
              ).map((c, i) => (
                <img key={i} src={c.imageUrl} alt={c.name} />
              ))}
            </div>
            <div className="entry-choice-copy">
              <h2>{mode === 'draft' ? 'Draft' : mode === 'sealed' ? 'Sealed' : 'Play'}</h2>
              <span>
                {mode === 'draft'
                  ? 'Draft with bots or other players'
                  : mode === 'sealed'
                    ? 'Build a deck from 6 or 8 packs'
                    : 'Play a saved deck against a person or AI'}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="entry-discovery">
        <section className="entry-panel">
          <h2>Draft Pods Open ({pods.length})</h2>
          {pods.length ? (
            pods.map((p) => (
              <div className="entry-resume-row" key={p.shareId}>
                <span>
                  {p.setName} · {p.currentPlayers}/{p.maxPlayers}
                </span>
                <Button onClick={() => router.push(`/draft/${p.shareId}`)}>Join pod</Button>
              </div>
            ))
          ) : (
            <p>No pods forming right now.</p>
          )}
          <Button onClick={() => router.push('/draft/setup?group=friends')}>Start a pod</Button>
        </section>
        <section className="entry-panel">
          <h2>Open Lobbies{lobbies ? ` (${lobbies.length})` : ''}</h2>
          {lobbyError ? (
            <p role="status">{lobbyError}</p>
          ) : lobbies === null ? (
            <div className="entry-skeleton entry-skeleton-line" />
          ) : lobbies.length ? (
            lobbies.map((l) => (
              <div className="entry-resume-row" key={l.matchId}>
                <span>
                  {l.username || 'Open game'} · {l.setCode} · {l.poolType}
                  {l.packCount ? ` · ${l.packCount} packs` : ''}
                </span>
                <Button onClick={() => router.push('/play')}>View lobby</Button>
              </div>
            ))
          ) : (
            <p>No open lobbies right now.</p>
          )}
        </section>
      </div>
      <div className="entry-utilities">
        {[
          ['My decks', '/history', MODE_ART.history, 'art-unit'],
          ['My stats', '/me', MODE_ART.myStats, 'art-unit'],
          [
            'Other formats',
            '/formats',
            'https://cdn.starwarsunlimited.com//card_SWH_01_283_Hansolo_Leader_Unit_HYP_6c91c1ab96.png',
            'art-leader-unit',
          ],
        ].map(([title, href, art, framing]) => (
          <button
            key={href}
            className={`mode-button ${framing}`}
            onClick={() => router.push(href!)}
          >
            <div className="mode-button-art" style={{ backgroundImage: `url("${art}")` }} />
            <div className="mode-button-content">
              <span className="mode-button-title">{title}</span>
            </div>
          </button>
        ))}
      </div>
    </EntryShell>
  )
}
