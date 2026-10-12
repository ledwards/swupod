'use client'
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ConfirmModal from '../ConfirmModal'
import CardWithPreview from '../CardWithPreview'
import { ShareIcon } from '../PodHub/icons'
import { logRounds, type RoundKey } from '../../services/draftLog/logModel'
import { useDraftLog } from './useDraftLog'
import DraftReviewButton from './DraftReviewButton'
import PlayerLine from './PlayerLine'
import { EventSummaryButton, PlayerResults } from './ResultsSection'
import { DownloadIcon, LockIcon } from './icons'
import '../../App.css'
import '../PodHub/pod-hub.css'
import './draft-log.css'

/**
 * The Draft Log: every seat's picks, round by round, and the pod's results.
 * The host makes the whole draft public or private. When the host is a Friend
 * of the Pod, the draft also has a review (its slideshow page), linked in gold.
 */
export default function DraftLog({ shareId }: { shareId: string }) {
  const router = useRouter()
  const seat = useSearchParams().get('seat')
  const { data, hub, error, loading, setDraftPublic, downloadJson } = useDraftLog(shareId, seat)
  const [round, setRound] = useState<RoundKey | null>(null)
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const rounds = useMemo(() => logRounds(data?.picks ?? []), [data])
  const current = rounds.find(r => r.key === round) ?? rounds.find(r => r.key === 'pack1') ?? rounds[0] ?? null

  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(null), 3000) }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/draft/${shareId}/log?seat=${data?.meta.targetSeat ?? 1}`)
      flash('Link copied')
    } catch { flash('The link could not be copied') }
  }

  if (loading && !data) return <section className="pod-hub dlog" aria-label="Draft log" aria-busy="true">
    <h1 data-site-title="skip" className="pod-visually-hidden">Draft log</h1>
    <div className="skeleton-block dlog-skeleton-line"/>
    <div className="skeleton-block dlog-skeleton-panel"/>
    <div className="skeleton-block dlog-skeleton-panel"/>
  </section>

  if (error && !data) return <section className="pod-hub pod-hub--empty" aria-label="Draft log">
    <h1>Draft log</h1>
    <p role="alert">{error}</p>
  </section>
  if (!data) return null

  const { meta } = data
  const podName = hub?.pod.name || `${meta.setName} Draft`
  const players = [...meta.players].sort((a, b) => a.seatNumber - b.seatNumber)
  const active = meta.players.find(p => p.seatNumber === meta.targetSeat) ?? null
  const blank = meta.viewableSeats.length === 0 || meta.targetSeat === null
  const hubPlayer = active ? hub?.players.find(p => p.seat === active.seatNumber) ?? null : null
  const lockLabel = meta.isDraftPublic ? 'Public: anyone with the link sees every seat' : 'Private: each drafter sees only their own picks'
  const select = (n: number) => { setRound(null); router.push(`/draft/${shareId}/log?seat=${n}`) }

  return <section className="pod-hub dlog" aria-label="Draft log">
    <h1>{podName}</h1>
    <p>Draft log · {meta.setName}</p>
    <div className="pod-toolbar">
      {meta.reviewAvailable && <DraftReviewButton shareId={shareId}/>}
      {hub && <EventSummaryButton hub={hub} shareId={shareId}/>}
      <button type="button" className="pod-ic" aria-label="Copy log link" title="Copy log link" onClick={() => void copyLink()}><ShareIcon/></button>
      <button type="button" className="pod-ic" aria-label="Download JSON" title="Download JSON" onClick={() => void downloadJson().catch(() => flash('The download failed'))}><DownloadIcon/></button>
      {meta.isHost
        ? <button type="button" className={`pod-ic dlog-lock ${meta.isDraftPublic ? 'is-public' : 'is-private'}`} aria-pressed={meta.isDraftPublic}
            aria-label={`${lockLabel}. Make it ${meta.isDraftPublic ? 'private' : 'public'}`} title={`${lockLabel}. Click to make it ${meta.isDraftPublic ? 'private' : 'public'}.`}
            onClick={() => (meta.isDraftPublic ? void setDraftPublic(false) : setConfirmPublic(true))}><LockIcon open={meta.isDraftPublic}/></button>
        : <span className={`pod-ic dlog-lock is-status ${meta.isDraftPublic ? 'is-public' : 'is-private'}`} role="img" aria-label={lockLabel} title={lockLabel}><LockIcon open={meta.isDraftPublic}/></span>}
    </div>

    {blank ? <div className="pod-pn dlog-blank">
      <p>This draft is private.</p>
      <p className="pod-hint">The host{meta.hostUsername ? ` (${meta.hostUsername})` : ''} can make it public.{!meta.myPlayerId && ' If you drafted, log in to see your own picks.'}</p>
    </div> : active && <div key={active.seatNumber} className="dlog-seat-view fade-presence">
      <PlayerLine players={players} active={active} viewableSeats={meta.viewableSeats} myPlayerId={meta.myPlayerId} isHost={meta.isHost}
        hubPlayer={hubPlayer} shareId={shareId} onSelect={select}
        record={hubPlayer && hub?.tournament ? hub.tournament.standings.find(s => s.id === hubPlayer.id)?.record ?? null : null}>
        {hub && hubPlayer && <PlayerResults hub={hub} playerId={hubPlayer.id}/>}
      </PlayerLine>

      {current && <>
        <div className="dlog-rounds">
          <div className="pod-seg" role="group" aria-label="Round">
            {rounds.map(r => <button key={r.key} type="button" aria-pressed={r.key === current.key} onClick={() => setRound(r.key)}>{r.label}</button>)}
          </div>
          <nav className="dlog-jump" aria-label="Jump to pick">
            {current.picks.map(p => <a key={p.pickInPack} href={`#pick-${current.key}-${p.pickInPack}`}>{p.pickInPack}</a>)}
          </nav>
        </div>
        <div key={current.key} className="dlog-picks fade-presence">
          {current.picks.map(pick => <section key={pick.pickInPack} id={`pick-${current.key}-${pick.pickInPack}`} className="dlog-pick" aria-label={`${current.label} pick ${pick.pickInPack}`}>
            <h3 className="dlog-pick-label">{current.key === 'leaders' ? 'Leaders' : `Pack ${pick.packNumber}`} Pick {pick.pickInPack}</h3>
            <div className="dlog-cards">
              {pick.visibleCards.map(card => <CardWithPreview key={card.instanceId} card={card} selected={card.instanceId === pick.pickedInstanceId}/>)}
            </div>
          </section>)}
        </div>
      </>}
    </div>}

    <ConfirmModal isOpen={confirmPublic} title="Make this draft public?" confirmLabel="Make Public" cancelLabel="Cancel"
      onConfirm={() => { setConfirmPublic(false); void setDraftPublic(true) }} onCancel={() => setConfirmPublic(false)}>
      <p>Anyone with the link will see every player&apos;s picks, deck and results, and the draft review if this pod has one.</p>
      <p>You can make it private again at any time.</p>
    </ConfirmModal>
    {message && <div className="dlog-toast" role="status">{message}</div>}
  </section>
}
