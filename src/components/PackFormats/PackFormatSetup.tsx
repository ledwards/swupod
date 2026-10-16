'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { fetchSets } from '../../utils/api'
import { trackEvent, AnalyticsEvents } from '../../hooks/useAnalytics'
import EntryShell from '../EntryFlow/EntryShell'
import EntryPackFan from '../EntryFlow/EntryPackFan'
import Button from '../Button'
import ContentSkeleton from '../ContentSkeleton'
import DiscordLoginButton from '../DiscordLoginButton'
import { SiteTitle } from '../SiteTheme'
import { PACK_FORMATS, alphaPath, type PackFormatKey } from './packFormats'
import { CheckIcon } from '../PodHub/icons'
import './pack-formats.css'
import { getPackImageUrl } from '../../utils/packArt'

type SetInfo = Awaited<ReturnType<typeof fetchSets>>[number]

/** Setup on the canonical pattern: rules, pick a set, Who's playing?, one primary that opens the packs. */
export default function PackFormatSetup({ format, nativeAiAvailable = false }: { format: PackFormatKey; nativeAiAvailable?: boolean }) {
  const f = PACK_FORMATS[format]
  const router = useRouter()
  const { isAuthenticated, loading: authLoading } = useAuth() as { isAuthenticated: boolean; loading: boolean }
  const [sets, setSets] = useState<SetInfo[] | null>(null)
  const [code, setCode] = useState('')
  const [solo, setSolo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchSets({ includeBeta: true, includeCarbonite: true })
      .then(s => {
        if (!live) return
        const newestFirst = [...s].reverse()
        setSets(newestFirst)
        setCode(newestFirst.find(x => !x.carbonite)?.code ?? newestFirst[0]?.code ?? '')
      })
      .catch(() => { if (live) setError('Unable to load sets. Please reload.') })
    return () => { live = false }
  }, [])

  const selected = sets?.find(s => s.code === code)
  const packsLabel = `${f.packs} ${f.packs === 1 ? 'pack' : 'packs'}`

  const openPacks = async () => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/formats/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ setCode: selected.code }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || 'Failed to open packs')
      trackEvent(format === 'pack-wars' ? AnalyticsEvents.PACK_WARS_CREATED : AnalyticsEvents.PACK_BLITZ_CREATED, { set_code: selected.code, table: solo ? 'solo' : 'friends' })
      router.push(alphaPath(format, `/${body.data.shareId}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open packs')
      setBusy(false)
    }
  }

  return (
    <EntryShell setCode={code || null}>
      <div className="pfx-page">
        <SiteTitle subtitle={f.subtitle}>{f.title}</SiteTitle>
        <div className="pfx-layout">
          <div className="pfx-col">
            <fieldset className="pfx-panel">
              <legend className="pfx-legend">Choose a Set</legend>
              {sets === null ? <ContentSkeleton kind="card" count={6}/> : (
                <div className="pfx-sets">
                  {sets.map(s => (
                    <Button key={s.code} variant="toggle" className="pfx-set" active={s.code === code} aria-pressed={s.code === code} disabled={busy} onClick={() => setCode(s.code)}>
                      <img src={getPackImageUrl(s.code)} alt=""/>
                      <span className="pfx-set-name">{s.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </fieldset>

            <fieldset className="pfx-panel">
              <legend className="pfx-legend">Who&rsquo;s Playing?</legend>
              <div className="pfx-toggle">
                <Button variant="toggle" active={solo} aria-pressed={solo} disabled={busy} onClick={() => setSolo(true)}>
                  Practice Solo
                  <span>{nativeAiAvailable ? 'Open your packs and play the AI' : 'Open your packs and play them on your own table'}</span>
                </Button>
                <Button variant="toggle" active={!solo} aria-pressed={!solo} disabled={busy} onClick={() => setSolo(false)}>
                  With Other Players
                  <span>Each player opens their own packs</span>
                </Button>
              </div>
              {!solo && (
                <div className="pfx-note">
                  <p className="pfx-muted">Playing a friend on Protect the Pod isn&rsquo;t here yet. Until it is:</p>
                  <ol>
                    <li>Open your packs here, and send your opponent this page so they open {packsLabel} from the same set.</li>
                    <li>Each of you picks a leader and base on your own play page.</li>
                    <li>{format === 'pack-wars'
                      ? 'Meet on Tabletop Simulator (copy your deck JSON) or Karabast (copy your deck link).'
                      : 'Meet on Tabletop Simulator: copy your deck JSON and import it there.'}</li>
                  </ol>
                </div>
              )}
            </fieldset>
          </div>

          <aside className="pfx-col">
            <section className="pfx-panel pfx-summary" aria-label="Summary">
              <EntryPackFan code={code} count={f.packs}/>
              <p className="pfx-title">{selected?.name ?? ' '}</p>
              <dl>
                <div><dt>Format</dt><dd>{f.title}</dd></div>
                <div><dt>Packs per player</dt><dd>{f.packs}</dd></div>
                <div><dt>Table</dt><dd>{solo ? 'Practice Solo' : 'With other players'}</dd></div>
                <div><dt>Next up</dt><dd>Pick your leader and base</dd></div>
              </dl>
              {error && <p className="pfx-error" role="alert">{error}</p>}
              {!authLoading && !isAuthenticated
                ? <DiscordLoginButton className="pfx-go" returnTo={alphaPath(format)}/>
                : <Button className="pfx-go" variant="primary" size="lg" disabled={!selected || busy || authLoading} aria-busy={busy || undefined} onClick={() => void openPacks()}>
                    {busy ? 'Opening…' : `Open ${packsLabel}`}
                  </Button>}
            </section>

            <section className="pfx-panel" aria-labelledby="pfx-howto">
              <h2 className="pfx-label" id="pfx-howto">How to Play</h2>
              <ul className="pfx-chips">{f.facts.map(x => <li key={x} className="pfx-chip">{x}</li>)}</ul>
              <ul className="pfx-rules">{f.rules.map(r => <li key={r}><CheckIcon/><span>{r}</span></li>)}</ul>
            </section>
          </aside>
        </div>
      </div>
    </EntryShell>
  )
}
