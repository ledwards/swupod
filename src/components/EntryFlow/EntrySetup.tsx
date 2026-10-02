'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '../Button'
import Modal from '../Modal'
import SetSelection from '../SetSelection'
import { fetchSets } from '@/src/utils/api'
import EntryPackFan from './EntryPackFan'
import { createDraft, startDraft } from '@/src/utils/draftApi'
import { getOrCreateLimitedFlowId } from '@/src/analytics/limitedEvents'
import EntryShell from './EntryShell'
export default function EntrySetup({ format }: { format: 'draft' | 'sealed' }) {
  const router = useRouter(),
    params = useSearchParams()
  const [sets, setSets] = useState<Awaited<ReturnType<typeof fetchSets>>>([]),
    [code, setCode] = useState(''),
    [picker, setPicker] = useState(false)
  const [solo, setSolo] = useState(params.get('group') !== 'friends'),
    [isPublic, setPublic] = useState(true),
    [packs, setPacks] = useState(6),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const selected = sets.find((s) => s.code === code),
    count = format === 'draft' ? 3 : packs
  useEffect(() => {
    let live = true
    fetchSets({ includeBeta: true })
      .then((s) => {
        if (live) {
          setSets(s)
          setCode(s.at(-1)?.code ?? '')
        }
      })
      .catch(() => setError('Unable to load sets. Please reload.'))
    return () => {
      live = false
    }
  }, [])
  async function go() {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    let created: string | undefined
    try {
      const flowId = getOrCreateLimitedFlowId(`${format}:${solo ? 'solo' : 'pod'}`)
      if (format === 'sealed' && solo) {
        router.push(
          `/pools/new?set=${code}&packs=${packs}&flowId=${encodeURIComponent(flowId ?? '')}`
        )
        return
      }
      if (format === 'draft') {
        const pod = await createDraft(code, {
          isPublic: solo ? false : isPublic,
          competitive: false,
          flowId,
          ...(solo ? { settings: { isSolo: true } } : {}),
        })
        created = `/draft/${pod.shareId}`
        if (solo) {
          const r = await fetch(`/api/draft/${pod.shareId}/dev/add-bots?count=7`, {
            method: 'POST',
          })
          if (!r.ok)
            throw Error(
              'Your draft was created, but the bots could not join. Continue from the pod.'
            )
          await startDraft(pod.shareId)
        }
        router.push(created)
      } else {
        const r = await fetch('/api/sealed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setCode: code,
            isPublic,
            packsPerPlayer: packs,
            competitive: false,
            flowId,
          }),
        })
        const j = await r.json()
        if (!r.ok) throw Error(j.error || 'Unable to create sealed pod.')
        router.push(`/sealed/${(j.data ?? j).shareId}`)
      }
    } catch (e) {
      if (created) {
        router.push(created)
        return
      }
      setError(e instanceof Error ? e.message : 'Unable to start.')
      setBusy(false)
    }
  }
  return (
    <EntryShell setCode={code} back={{ label: 'Back', onClick: () => router.push('/') }}>
      <h1>{format === 'draft' ? 'Draft' : 'Sealed'}</h1>
      <div className="entry-layout">
        <section className="entry-panel entry-options">
          <h2>Choose a set</h2>
          <Button
            className="entry-set-button"
            aria-haspopup="dialog"
            onClick={() => setPicker(true)}
            disabled={!selected || busy}
          >
            {selected ? (
              <>
                <img src={selected.imageUrl ?? ''} alt="" />
                <span>{selected.name}</span>
              </>
            ) : (
              <span className="entry-skeleton entry-skeleton-line" />
            )}
          </Button>
          <h2>Who’s playing?</h2>
          <div className="entry-toggle">
            <Button
              variant="toggle"
              active={solo}
              aria-pressed={solo}
              disabled={busy}
              onClick={() => setSolo(true)}
            >
              Practice Solo
              <span>
                {format === 'draft'
                  ? 'Draft against seven bots'
                  : 'Open packs and build a sealed deck'}
              </span>
            </Button>
            <Button
              variant="toggle"
              active={!solo}
              aria-pressed={!solo}
              disabled={busy}
              onClick={() => setSolo(false)}
            >
              With other players
              <span>
                {format === 'draft'
                  ? 'Create a pod for up to eight players'
                  : 'Create a pod; each player gets a sealed pool'}
              </span>
            </Button>
          </div>
          {!solo && (
            <>
              <h2>Who can join your pod?</h2>
              <div className="entry-toggle">
                <Button
                  variant="toggle"
                  active={isPublic}
                  aria-pressed={isPublic}
                  disabled={busy}
                  onClick={() => setPublic(true)}
                >
                  Public<span>Listed publicly for anyone to join</span>
                </Button>
                <Button
                  variant="toggle"
                  active={!isPublic}
                  aria-pressed={!isPublic}
                  disabled={busy}
                  onClick={() => setPublic(false)}
                >
                  Private<span>Unlisted; share a link to invite players</span>
                </Button>
              </div>
            </>
          )}
          {format === 'sealed' && (
            <>
              <h2>Packs per player</h2>
              <div className="entry-toggle">
                {[6, 8].map((n) => (
                  <Button
                    key={n}
                    variant="toggle"
                    active={packs === n}
                    aria-pressed={packs === n}
                    disabled={busy}
                    onClick={() => setPacks(n)}
                  >
                    {n} packs
                  </Button>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="entry-panel entry-summary">
          <EntryPackFan code={code} count={count} />
          <h2>{selected?.name ?? <span className="entry-skeleton entry-loading-line" style={{ height: 31, width: "65%" }} />}</h2>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>{format === 'draft' ? 'Draft' : 'Sealed'}</dd>
            </div>
            <div>
              <dt>Packs per player</dt>
              <dd>{count}</dd>
            </div>
            <div>
              <dt>Table</dt>
              <dd>{solo ? 'Practice Solo' : isPublic ? 'Public pod' : 'Private pod'}</dd>
            </div>
            <div>
              <dt>Next up</dt>
              <dd>
                {solo
                  ? format === 'draft'
                    ? 'Pick your leaders'
                    : 'Open your packs'
                  : 'Invite players'}
              </dd>
            </div>
          </dl>
          {error && <p role="alert">{error}</p>}
          <Button className="entry-go" variant="primary" disabled={!selected || busy} onClick={go}>
            {busy
              ? 'Starting…'
              : solo
                ? format === 'draft'
                  ? 'Start practice draft'
                  : `Open ${packs} packs`
                : 'Create pod'}
          </Button>
        </aside>
      </div>
      <Modal
        isOpen={picker}
        onClose={() => setPicker(false)}
        variant="wide"
        showCloseButton
        title="Choose a set"
        className="entry-set-modal"
      >
        <SetSelection
          onSetSelect={(c) => {
            setCode(c)
            setPicker(false)
          }}
        />
      </Modal>
    </EntryShell>
  )
}
