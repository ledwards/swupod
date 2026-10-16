'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { trackEvent, AnalyticsEvents } from '../../hooks/useAnalytics'
import { SET_CONFIGS, type SetConfig } from '../../utils/setConfigs'
import { getUnavailableSetReason } from '../../utils/setAvailability'
import { getPackImageUrl } from '../../utils/packArt'
import { getCardsBySet } from '../../utils/cardData'
import { otherFormatsHref } from '../../../lib/otherFormats'
import {
  ROTISSERIE_DEFAULTS, ROTISSERIE_LIMITS, normalizeRotisserieSetup, rotisserieBotCount, rotisserieCreateBody, rotisseriePoolSize, rotisserieSeats, rotisserieShortfall,
  type RotisserieSetupState,
} from '../../services/rotisserieSetup'
import EntryShell from '../EntryFlow/EntryShell'
import Button from '../Button'
import DiscordLoginButton from '../DiscordLoginButton'
import FormatPackFan from './FormatPackFan'
import './other-formats.css'
import './rotisserie-setup.css'

const STORAGE_KEY = 'rotisserie-setup'
const SETUP_PATH = otherFormatsHref('rotisserie')

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error || j?.message || j?.data?.error || 'Could not create the draft')
  return j
}

/** Rotisserie setup (alpha, plan B3): every choice is made here; the draft is created only by the primary. */
export default function RotisserieSetup() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth() as { user: { is_beta_tester?: boolean; is_admin?: boolean } | null; isAuthenticated: boolean; loading: boolean }
  const sets = Object.values(SET_CONFIGS as Record<string, SetConfig>)
    .filter(c => !getUnavailableSetReason(c.setCode, user))
    .sort((a, b) => b.setNumber - a.setNumber)
  const [setup, setSetup] = useState<RotisserieSetupState>({ ...ROTISSERIE_DEFAULTS, setCodes: [] })
  const [restored, setRestored] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const newest = sets[0]?.setCode

  // A setup chosen before signing in survives the Discord round trip.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) setSetup(normalizeRotisserieSetup(JSON.parse(saved)))
      else if (newest) setSetup(s => ({ ...s, setCodes: [newest] }))
    } catch { /* start from the defaults */ }
    setRestored(true)
    // Runs once: a restored setup wins, otherwise start on the newest set, like Draft and Sealed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!restored) return
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(setup)) } catch { /* fine */ }
  }, [setup, restored])

  const available = new Set(sets.map(s => s.setCode))
  const chosen = setup.setCodes.filter(c => available.has(c))

  const update = (patch: Partial<RotisserieSetupState>) => setSetup(s => ({ ...s, ...patch }))
  const toggleSet = (code: string) => update({ setCodes: chosen.includes(code) ? chosen.filter(c => c !== code) : [...chosen, code] })
  const numberInput = (value: number, onChange: (n: number) => void, [min, max]: readonly [number, number], label: string) => (
    <input
      className="rs-number"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ''}
      aria-label={label}
      disabled={busy}
      onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      onBlur={() => onChange(Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min)))}
    />
  )

  const effective = { ...setup, setCodes: chosen }
  const chosenKey = chosen.join(',')
  const poolSize = useMemo(() => chosenKey.split(',').filter(Boolean).reduce((n, code) => n + rotisseriePoolSize(code, getCardsBySet(code)), 0), [chosenKey])
  const short = rotisserieShortfall(effective, poolSize)
  const seats = rotisserieSeats(effective)

  async function create() {
    if (busy || chosen.length === 0) return
    setBusy(true)
    setError('')
    let room: string | undefined
    try {
      const created = await post('/api/formats/rotisserie', rotisserieCreateBody(effective))
      const shareId: string = created?.data?.shareId ?? created?.shareId
      room = otherFormatsHref(`rotisserie/${encodeURIComponent(shareId)}`)
      trackEvent(AnalyticsEvents.ROTISSERIE_CREATED)
      if (setup.solo) {
        // Each bot is a read-modify-write on the draft, so they join one at a time.
        for (let i = 0; i < rotisserieBotCount(effective); i++) await post(`/api/formats/rotisserie/${encodeURIComponent(shareId)}`, { action: 'add-bot' })
        await post(`/api/formats/rotisserie/${encodeURIComponent(shareId)}`, { action: 'start' })
      }
      try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* fine */ }
      router.push(room)
    } catch (e) {
      // The draft exists: continue from its lobby rather than creating another.
      if (room) { router.push(room); return }
      setError(e instanceof Error ? e.message : 'Could not create the draft')
      setBusy(false)
    }
  }

  const table = setup.solo ? `Practice Solo, you and ${seats - 1} ${seats - 1 === 1 ? 'bot' : 'bots'}` : `Up to ${seats} players`
  const picks = setup.draftMode === 'exhausted' ? 'Entire pool' : `${rotisserieCreateBody(effective).picksPerPlayer} each`

  return (
    <EntryShell setCode={chosen[0] ?? null}>
      <h1>Rotisserie Draft</h1>
      <p className="rs-subtitle">Snake draft from every card in the chosen sets, face-up</p>
      <div className="entry-layout rs-layout">
        <section className="entry-panel entry-options" aria-label="Rotisserie setup">
          <h2>Choose sets</h2>
          <div className="rs-setgrid">
            {sets.map(s => (
              <Button key={s.setCode} variant="toggle" className="rs-set" active={chosen.includes(s.setCode)} aria-pressed={chosen.includes(s.setCode)} aria-label={s.setName} disabled={busy} onClick={() => toggleSet(s.setCode)}>
                <img src={getPackImageUrl(s.setCode)} alt="" data-wf-no-card-stats=""/>
                <span>{s.setCode}</span>
              </Button>
            ))}
          </div>
          {chosen.length === 0 && <p className="rs-note">Choose at least one set.</p>}

          <h2>Who’s playing?</h2>
          <div className="entry-toggle">
            <Button variant="toggle" active={setup.solo} aria-pressed={setup.solo} disabled={busy} onClick={() => update({ solo: true, players: Math.min(setup.players, ROTISSERIE_LIMITS.soloPlayers[1]) })}>
              Practice Solo<span>Draft against bots; the draft starts right away</span>
            </Button>
            <Button variant="toggle" active={!setup.solo} aria-pressed={!setup.solo} disabled={busy} onClick={() => update({ solo: false })}>
              With other players<span>Create a draft and invite players with a link</span>
            </Button>
          </div>
          <label className="rs-row">
            <span>{setup.solo ? 'Seats, you included' : 'Max players'}</span>
            {numberInput(setup.players, n => update({ players: n }), setup.solo ? ROTISSERIE_LIMITS.soloPlayers : ROTISSERIE_LIMITS.players, setup.solo ? 'Seats, you included' : 'Max players')}
          </label>
          {setup.solo && <p className="rs-note">{seats - 1} {seats - 1 === 1 ? 'bot takes' : 'bots take'} the other seats.</p>}

          <h2>Draft mode</h2>
          <div className="entry-toggle">
            <Button variant="toggle" active={setup.draftMode === 'exhausted'} aria-pressed={setup.draftMode === 'exhausted'} disabled={busy} onClick={() => update({ draftMode: 'exhausted' })}>
              Entire Pool<span>Draft until every card is taken, equal picks each</span>
            </Button>
            <Button variant="toggle" active={setup.draftMode === 'fixed'} aria-pressed={setup.draftMode === 'fixed'} disabled={busy} onClick={() => update({ draftMode: 'fixed' })}>
              Fixed Picks<span>Each player takes a set number of cards</span>
            </Button>
          </div>
          {setup.draftMode === 'fixed' && (
            <label className="rs-row">
              <span>Picks each</span>
              {numberInput(setup.picksPerPlayer, n => update({ picksPerPlayer: n }), ROTISSERIE_LIMITS.picksPerPlayer, 'Picks each')}
            </label>
          )}

          {!setup.solo && (
            <>
              <h2>Pick timer</h2>
              <div className="entry-toggle">
                <Button variant="toggle" active={!setup.timerEnabled} aria-pressed={!setup.timerEnabled} disabled={busy} onClick={() => update({ timerEnabled: false })}>
                  Off<span>Players take as long as they need</span>
                </Button>
                <Button variant="toggle" active={setup.timerEnabled} aria-pressed={setup.timerEnabled} disabled={busy} onClick={() => update({ timerEnabled: true })}>
                  On<span>Each pick has a time limit</span>
                </Button>
              </div>
              {setup.timerEnabled && (
                <label className="rs-row">
                  <span>Seconds per pick</span>
                  {numberInput(setup.pickTimerSeconds, n => update({ pickTimerSeconds: n }), ROTISSERIE_LIMITS.pickTimerSeconds, 'Seconds per pick')}
                </label>
              )}
            </>
          )}
        </section>

        <aside className="entry-panel entry-summary">
          <FormatPackFan codes={chosen.slice(0, 5)} className="of-fan--summary"/>
          <h2>{chosen.length ? chosen.join(', ') : 'No sets yet'}</h2>
          <dl>
            <div><dt>Format</dt><dd>Rotisserie</dd></div>
            <div><dt>Table</dt><dd>{table}</dd></div>
            <div><dt>Card pool</dt><dd>{poolSize} cards</dd></div>
            <div><dt>Picks</dt><dd>{picks}</dd></div>
            {!setup.solo && <div><dt>Pick timer</dt><dd>{setup.timerEnabled ? `${rotisserieCreateBody(effective).pickTimerSeconds} s` : 'Off'}</dd></div>}
            <div><dt>Next up</dt><dd>{setup.solo ? 'Make your first pick' : 'Invite players'}</dd></div>
          </dl>
          {short > 0 && <p className="rs-warn">The pool is {short} cards short of {seats} × {rotisserieCreateBody(effective).picksPerPlayer} picks. Add sets, lower the picks or draft the Entire Pool.</p>}
          {error && <p role="alert">{error}</p>}
          {!authLoading && !isAuthenticated
            ? <DiscordLoginButton className="entry-go" returnTo={SETUP_PATH}/>
            : (
              <Button className="entry-go" variant="primary" disabled={authLoading || busy || chosen.length === 0} aria-busy={busy || undefined} onClick={() => void create()}>
                {busy ? 'Starting…' : setup.solo ? 'Start practice draft' : 'Create draft'}
              </Button>
            )}
        </aside>
      </div>
    </EntryShell>
  )
}
