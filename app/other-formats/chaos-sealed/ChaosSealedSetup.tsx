'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../../../src/components/Button'
import ContentSkeleton from '../../../src/components/ContentSkeleton'
import EntryShell from '../../../src/components/EntryFlow/EntryShell'
import PackOpeningAnimation, { type PackOpeningAnimationProps } from '../../../src/components/PackOpeningAnimation'
import ChaosPackGrid from '../../../src/components/ChaosPackPicker/ChaosPackGrid'
import ChaosPackSummary from '../../../src/components/ChaosPackPicker/ChaosPackSummary'
import { useChaosPackSets } from '../../../src/components/ChaosPackPicker/useChaosPackSets'
import { useChaosPicker } from '../../../src/components/ChaosPackPicker/useChaosPicker'
import { trackEvent, AnalyticsEvents } from '../../../src/hooks/useAnalytics'
import { CHAOS_SEALED_PACK_LIMITS, pickerSummary } from '../../../src/services/chaosPackPicker'
import { getRandomPackImageUrl } from '../../../src/utils/packArt'

interface OpenedPool {
  shareId: string
  packs: NonNullable<PackOpeningAnimationProps['packs']>
  packImageUrls: string[]
}

/**
 * Chaos Sealed setup (alpha): build your packs, open them, build a deck. Practice Solo only for
 * now: a pod of chaos pools needs server support POST /api/sealed doesn't have yet, so
 * With Other Players is shown as coming soon. Signed-out players can open a pool.
 */
export default function ChaosSealedSetup() {
  const router = useRouter()
  const { sets, error: setsError, peekVariant } = useChaosPackSets()
  const picker = useChaosPicker('other-formats:chaos-sealed', CHAOS_SEALED_PACK_LIMITS, sets)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState<OpenedPool | null>(null)
  const summary = pickerSummary(picker.state)
  const total = summary.ordered.length

  async function go() {
    if (!summary.complete || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/formats/chaos-sealed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ setCodes: summary.ordered, packCount: picker.state.count }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw Error(result?.message || result?.error || 'Unable to open your packs.')
      const shareId: string = result.data.shareId
      picker.clear()
      trackEvent(AnalyticsEvents.CHAOS_SEALED_CREATED, {
        set_codes: summary.ordered,
        unique_sets: new Set(summary.ordered).size,
        pack_count: picker.state.count,
      })
      const poolResponse = await fetch(`/api/pools/${shareId}`, { credentials: 'include' })
      if (!poolResponse.ok) { router.push(`/pools/${shareId}`); return }
      const pool = (await poolResponse.json()).data
      const packs: OpenedPool['packs'] = typeof pool.packs === 'string' ? JSON.parse(pool.packs) : pool.packs
      setOpened({ shareId, packs, packImageUrls: packs.map((p) => getRandomPackImageUrl(String(p['setCode']))) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open your packs.')
      setBusy(false)
    }
  }

  const done = useCallback(() => { if (opened) router.push(`/pools/${opened.shareId}`) }, [opened, router])

  if (opened) {
    return (
      <PackOpeningAnimation
        // Every generated pack opens, Event Packs included, so this can exceed the slot count.
        packCount={opened.packs.length}
        packImageUrls={opened.packImageUrls}
        cardBackUrl="/card-images/card-back.png"
        onComplete={done}
        packs={opened.packs}
      />
    )
  }

  return (
    <EntryShell>
      <h1>Chaos Sealed</h1>
      <div className="entry-layout">
        <section className="entry-panel entry-options">
          <h2>Build your packs</h2>
          <p className="cpk-hint">Tap a set to add a pack. Mix any sets; packs open in the order shown in the summary.</p>
          {sets
            ? <ChaosPackGrid sets={sets} state={picker.state} limits={CHAOS_SEALED_PACK_LIMITS} onAdd={picker.add} peekVariant={peekVariant} disabled={busy} />
            : setsError ? <p role="alert">{setsError}</p> : <ContentSkeleton kind="card" count={8} />}
          {sets && summary.remaining === 0 && <p className="cpk-note">Every pack is chosen. Remove one in the summary, or raise the count, to add another.</p>}
          <h2>Who’s playing?</h2>
          <div className="entry-toggle">
            <Button variant="toggle" active aria-pressed="true" disabled={busy}>
              Practice Solo<span>Open packs and build a sealed deck</span>
            </Button>
            <Button variant="toggle" aria-pressed="false" disabled aria-describedby="cpk-sealed-soon">
              With Other Players<span id="cpk-sealed-soon">Coming soon: a pod where everyone opens the same chaos packs</span>
            </Button>
          </div>
        </section>
        <aside className="entry-panel entry-summary">
          <ChaosPackSummary
            state={picker.state}
            limits={CHAOS_SEALED_PACK_LIMITS}
            sets={sets}
            onStep={picker.step}
            onRemoveAt={picker.removeAt}
            countLabel="Packs"
            eventNote="Event Packs are added to your pool on top of your set packs."
            disabled={busy}
          />
          <dl>
            <div><dt>Format</dt><dd>Chaos Sealed</dd></div>
            <div><dt>Table</dt><dd>Practice Solo</dd></div>
            <div><dt>Next up</dt><dd>Open your packs</dd></div>
          </dl>
          {(error || summary.error) && <p role="alert">{error || summary.error}</p>}
          <Button className="entry-go" variant="primary" disabled={!summary.complete || busy} onClick={() => void go()}>
            {busy ? 'Opening…' : `Open ${total} ${total === 1 ? 'pack' : 'packs'}`}
          </Button>
        </aside>
      </div>
    </EntryShell>
  )
}
