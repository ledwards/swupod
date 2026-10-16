'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { deletePool } from '../../utils/poolApi'
import { SET_CONFIGS, type SetConfig } from '../../utils/setConfigs'
import { getUnavailableSetReason } from '../../utils/setAvailability'
import { otherFormatsHref } from '../../../lib/otherFormats'
import EntryShell from '../EntryFlow/EntryShell'
import { ArtRow, ArtRows } from '../SharedPlay/ArtRows'
import LiveStrip from '../PlayHomepage/LiveStrip'
import Button from '../Button'
import ConfirmModal from '../ConfirmModal'
import ContentSkeleton from '../ContentSkeleton'
import FormatPackFan from './FormatPackFan'
import { formatPoolAction, formatPoolName, formatPoolSetCode } from './formatPools'
import '../../App.css'
import '../SharedPlay/shared-play.css'
import '../SharedPlay/limited-landing.css'
import './other-formats.css'

type Access = 'open' | 'beta' | 'coming-soon'
interface FormatTile { sub: string; name: string; how: string; access: Access; table: string; fan: (sets: string[]) => string[] }
interface FormatPool { id: string; shareId: string; setCode: string; setName: string; poolType: string; name: string; createdAt: string }

// Solo vs friends is chosen on each format's own setup, never here (plan B1).
// Each tile sits on a theme table, like the homepage's three choices, but the
// chaos formats lean dark: Sith and Imperial tables, packs thrown at angles.
const FORMATS: FormatTile[] = [
  { sub: 'chaos-sealed', name: 'Chaos Sealed', how: 'Open packs from different sets and build a sealed deck', access: 'open', table: 'sith-wayfinder', fan: s => s.slice(0, 3) },
  { sub: 'chaos-draft', name: 'Chaos Draft', how: 'Draft packs from different sets, against bots or with friends', access: 'open', table: 'mustafar-command', fan: s => [s[2], s[0], s[1]].filter(Boolean) as string[] },
  { sub: 'rotisserie', name: 'Rotisserie Draft', how: 'Take turns picking face-up from every card in the chosen sets', access: 'open', table: 'vaders-castle', fan: s => [s[1], s[2], s[0]].filter(Boolean) as string[] },
  // On-platform Pack Wars/Blitz is parked (plan C; maybe an April Fools' Day launch).
  { sub: 'pack-wars', name: 'Pack Wars', how: 'Open 2 packs and battle with only those cards', access: 'coming-soon', table: 'petranaki', fan: s => s[0] ? [s[0], s[0]] : [] },
  { sub: 'pack-blitz', name: 'Pack Blitz', how: 'Open 1 pack and battle with what you pull', access: 'coming-soon', table: 'hyperspace', fan: s => s.slice(0, 1) },
]

const trash = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
const lock = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>

const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function OtherFormatsHub() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth() as { user: { is_beta_tester?: boolean; is_admin?: boolean; is_alpha_tester?: boolean } | null; isAuthenticated: boolean }
  // Same gate the format APIs enforce (requireBetaAccess): beta, alpha or admin.
  const hasBetaAccess = !!(user?.is_beta_tester || user?.is_admin || user?.is_alpha_tester)
  const [pools, setPools] = useState<FormatPool[]>()
  const [deleting, setDeleting] = useState<FormatPool | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) { setPools([]); return }
    const c = new AbortController()
    setPools(undefined)
    fetch('/api/formats/history', { credentials: 'include', signal: c.signal })
      .then(r => r.ok ? r.json() : null)
      .then(j => setPools(j?.pools || j?.data?.pools || []))
      .catch(() => { if (!c.signal.aborted) setPools([]) })
    return () => c.abort()
  }, [isAuthenticated, user])

  const sets = Object.values(SET_CONFIGS as Record<string, SetConfig>)
    .filter(c => !getUnavailableSetReason(c.setCode, user))
    .sort((a, b) => b.setNumber - a.setNumber)
    .map(c => c.setCode)

  const removePool = async () => {
    if (!deleting || busy) return
    setBusy(true); setDeleteError(null)
    try {
      await deletePool(deleting.shareId)
      setPools(prev => prev?.filter(p => p.shareId !== deleting.shareId))
      setDeleting(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this pool. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryShell>
      <section className="sp-workspace of-hub" aria-label="Other formats">
        <header className="sp-title"><h1>Other Formats</h1><p>Alternative ways to play limited</p></header>

        <div className="of-grid">
          {FORMATS.map(f => {
            const locked = f.access === 'coming-soon' || (f.access === 'beta' && !hasBetaAccess)
            const style = { '--of-table': `url("/table-environments/${f.table}.webp")` } as CSSProperties
            const body = <>
              <span className="of-tile-stage" aria-hidden="true"><FormatPackFan codes={f.fan(sets)} scatter/></span>
              <span className="of-tile-copy">
                <strong>{f.name}</strong>
                <span>{f.how}</span>
                {locked && <span className="of-tag">{lock}{f.access === 'beta' ? 'Beta' : 'Coming Soon'}</span>}
              </span>
            </>
            return locked
              ? <div key={f.sub} className="of-tile" style={style} aria-disabled="true" aria-label={`${f.name}, ${f.access === 'beta' ? 'beta testers only' : 'coming soon'}`}>{body}</div>
              : <Link key={f.sub} className="of-tile" style={style} href={otherFormatsHref(f.sub)}>{body}</Link>
          })}
        </div>

        {isAuthenticated && !(pools && pools.length === 0) && (
          <section className="sp-panel of-pools" aria-label="Your format pools">
            <h2>Your Format Pools{pools ? ` (${pools.length})` : ''}</h2>
            {pools === undefined ? <ContentSkeleton kind="row" count={3}/> : (
              <ArtRows items={pools} keyOf={p => p.shareId} render={p => {
                const action = formatPoolAction(p.poolType, p.shareId)
                const name = p.name || p.setName || p.setCode
                return (
                  <ArtRow setCode={formatPoolSetCode(p.setCode)} title={name} meta={<>{formatPoolName(p.poolType)} · {formatDate(p.createdAt)}</>}>
                    <Button onClick={() => router.push(action.href)}>{action.label}</Button>
                    <Button variant="icon" className="sp-row-del" aria-label={`Delete ${name}`} title="Delete pool" onClick={() => { setDeleteError(null); setDeleting(p) }}>{trash}</Button>
                  </ArtRow>
                )
              }}/>
            )}
          </section>
        )}

        <LiveStrip/>

        <ConfirmModal isOpen={!!deleting} title="Delete pool?" confirmLabel="Delete" confirming={busy} onConfirm={removePool} onCancel={() => setDeleting(null)}>
          {deleteError && <p role="alert">{deleteError}</p>}
          <p>This removes &quot;{deleting?.name || deleting?.setName}&quot; and its cards. This cannot be undone.</p>
        </ConfirmModal>
      </section>
    </EntryShell>
  )
}
