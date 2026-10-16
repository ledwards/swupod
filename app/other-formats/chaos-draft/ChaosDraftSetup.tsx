'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '../../../src/components/Button'
import ContentSkeleton from '../../../src/components/ContentSkeleton'
import DiscordLoginButton from '../../../src/components/DiscordLoginButton'
import EntryShell from '../../../src/components/EntryFlow/EntryShell'
import ChaosPackGrid from '../../../src/components/ChaosPackPicker/ChaosPackGrid'
import ChaosPackSummary from '../../../src/components/ChaosPackPicker/ChaosPackSummary'
import { useChaosPackSets } from '../../../src/components/ChaosPackPicker/useChaosPackSets'
import { useChaosPicker } from '../../../src/components/ChaosPackPicker/useChaosPicker'
import { AFTER_DRAFT_CHOICES } from '../../../src/components/PodHub/afterDraftChoices'
import { useAuth } from '../../../src/contexts/AuthContext'
import { trackEvent, AnalyticsEvents } from '../../../src/hooks/useAnalytics'
import { CHAOS_DRAFT_PACK_LIMITS, pickerSummary } from '../../../src/services/chaosPackPicker'
import { createDraft, startDraft } from '../../../src/utils/draftApi'

type AfterDraft = (typeof AFTER_DRAFT_CHOICES)[number]['value']

/**
 * The one Chaos Draft setup (alpha): Who's playing?, then build your 3 packs Practice Solo
 * drafts against seven bots; With Other Players creates a chaos pod. Chaos drafts need a
 * Discord login (POST /api/draft has no guest path for chaos), asked for on the primary.
 */
export default function ChaosDraftSetup() {
  const router = useRouter()
  const params = useSearchParams()
  const { isAuthenticated, loading: authLoading } = useAuth() as { isAuthenticated: boolean; loading: boolean }
  const { sets, error: setsError, peekVariant } = useChaosPackSets()
  const picker = useChaosPicker('other-formats:chaos-draft', CHAOS_DRAFT_PACK_LIMITS, sets)
  const [solo, setSolo] = useState(params.get('group') !== 'friends')
  const [isPublic, setPublic] = useState(true)
  const [afterDraft, setAfterDraft] = useState<AfterDraft>('none')
  const [emptySeats, setEmptySeats] = useState<'bots' | 'humans'>('bots')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const summary = pickerSummary(picker.state)

  useEffect(() => { try { setPublic(localStorage.getItem('pod-visibility') !== 'private') } catch { /* default public */ } }, [])
  const chooseVisibility = (pub: boolean) => {
    setPublic(pub)
    try { localStorage.setItem('pod-visibility', pub ? 'public' : 'private') } catch { /* fine */ }
  }

  async function go() {
    if (!summary.complete || busy) return
    setBusy(true)
    setError('')
    let created: string | undefined
    try {
      const chaosSets = summary.ordered
      const pod = await createDraft(summary.setPacks[0]!, {
        isPublic: solo ? false : isPublic,
        settings: solo
          ? { isSolo: true, draftMode: 'chaos', chaosSets }
          : { draftMode: 'chaos', chaosSets, afterDraft, emptySeats },
      })
      created = `/draft/${pod.shareId}`
      picker.clear()
      trackEvent(AnalyticsEvents.CHAOS_DRAFT_CREATED, {
        set_codes: summary.setPacks,
        unique_sets: new Set(summary.setPacks).size,
        event_packs: summary.eventPacks.length,
        solo,
      })
      if (solo) {
        const r = await fetch(`/api/draft/${pod.shareId}/dev/add-bots?count=7`, { method: 'POST', credentials: 'include' })
        if (!r.ok) throw Error('Your draft was created, but the bots could not join. Continue from the pod.')
        await startDraft(pod.shareId)
      }
      router.push(created)
    } catch (e) {
      // Keep a created pod resumable rather than making a duplicate.
      if (created) { router.push(created); return }
      setError(e instanceof Error ? e.message : 'Unable to start.')
      setBusy(false)
    }
  }

  const returnTo = solo ? '/other-formats/chaos-draft' : '/other-formats/chaos-draft?group=friends'
  return (
    <EntryShell>
      <h1>Chaos Draft</h1>
      <div className="entry-layout">
        <section className="entry-panel entry-options">
          <h2>Who’s playing?</h2>
          <div className="entry-toggle">
            <Button variant="toggle" active={solo} aria-pressed={solo} disabled={busy} onClick={() => setSolo(true)}>
              Practice Solo<span>Draft against seven bots</span>
            </Button>
            <Button variant="toggle" active={!solo} aria-pressed={!solo} disabled={busy} onClick={() => setSolo(false)}>
              With Other Players<span>Create a pod for up to eight players</span>
            </Button>
          </div>
          {!solo && (
            <>
              <h2>Who can join your pod?</h2>
              <div className="entry-toggle">
                <Button variant="toggle" active={isPublic} aria-pressed={isPublic} disabled={busy} onClick={() => chooseVisibility(true)}>
                  Public<span>Listed publicly for anyone to join</span>
                </Button>
                <Button variant="toggle" active={!isPublic} aria-pressed={!isPublic} disabled={busy} onClick={() => chooseVisibility(false)}>
                  Private<span>Unlisted; share a link to invite players</span>
                </Button>
              </div>
              <h2>Empty seats</h2>
              <div className="entry-toggle">
                <Button variant="toggle" active={emptySeats === 'bots'} aria-pressed={emptySeats === 'bots'} disabled={busy} onClick={() => setEmptySeats('bots')}>
                  Fill with bots<span>Bots take any seat still empty when you start</span>
                </Button>
                <Button variant="toggle" active={emptySeats === 'humans'} aria-pressed={emptySeats === 'humans'} disabled={busy} onClick={() => setEmptySeats('humans')}>
                  Players only<span>Draft with just the players who joined</span>
                </Button>
              </div>
              <h2>After the draft</h2>
              <div className="cpk-choices" role="group" aria-label="After the draft">
                {AFTER_DRAFT_CHOICES.map((choice) => (
                  <Button key={choice.value} variant="toggle" active={afterDraft === choice.value} aria-pressed={afterDraft === choice.value}
                    disabled={busy} onClick={() => setAfterDraft(choice.value)}>
                    {choice.icon}{choice.label}
                  </Button>
                ))}
              </div>
            </>
          )}
          <h2>Build your packs</h2>
          <p className="cpk-hint">Pick 3 packs from any sets, drafted in the order shown. An Event Pack can fill the 4th slot.</p>
          {sets
            ? <ChaosPackGrid sets={sets} state={picker.state} limits={CHAOS_DRAFT_PACK_LIMITS} onAdd={picker.add} peekVariant={peekVariant} disabled={busy} />
            : setsError ? <p role="alert">{setsError}</p> : <ContentSkeleton kind="card" count={8} />}
          {sets && summary.remaining === 0 && <p className="cpk-note">All 3 packs are chosen. Tap a pack in the fan to swap it out.</p>}
        </section>
        <aside className="entry-panel entry-summary">
          <ChaosPackSummary
            state={picker.state}
            limits={CHAOS_DRAFT_PACK_LIMITS}
            sets={sets}
            onStep={picker.step}
            onRemoveAt={picker.removeAt}
            countLabel="Packs per player"
            eventNote="Your Event Pack is drafted as a bonus 4th round."
            disabled={busy}
            removeFrom="fan"
          />
          <dl>
            <div><dt>Format</dt><dd>Chaos Draft</dd></div>
            <div><dt>Table</dt><dd>{solo ? 'Practice Solo' : isPublic ? 'Public pod' : 'Private pod'}</dd></div>
            <div><dt>Next up</dt><dd>{solo ? 'Pick your leaders' : 'Invite players'}</dd></div>
          </dl>
          {(error || summary.error) && <p role="alert">{error || summary.error}</p>}
          {!authLoading && !isAuthenticated
            ? <DiscordLoginButton className="entry-go" returnTo={returnTo} disabled={!summary.complete} />
            : (
              <Button className="entry-go" variant="primary" disabled={authLoading || !summary.complete || busy} onClick={() => void go()}>
                {busy ? 'Starting…' : solo ? 'Start practice draft' : 'Create pod'}
              </Button>
            )}
        </aside>
      </div>
    </EntryShell>
  )
}
