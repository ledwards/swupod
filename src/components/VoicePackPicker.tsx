'use client'

/**
 * VoicePackPicker — the host chooses which unlocked voice pack a pod uses.
 *
 * Fully self-contained: give it a shareId and whether the viewer is the host, and it
 * fetches the viewer's entitlements plus the pod's current selection, renders the
 * toggle row, and PUTs changes. It renders NOTHING when the viewer is not the host or
 * has not unlocked any packs, so a call site can drop it in unconditionally.
 *
 *   <VoicePackPicker shareId={shareId} isHost={isHost} />
 *
 * The server re-checks both host-ness and ownership on every write — hiding the
 * control here is presentation, not a gate.
 */
import { useEffect, useState } from 'react'
import Button from '@/src/components/Button'
import './VoicePackPicker.css'

interface OwnedPack {
  id: string
  code: string
  displayName: string
  creatorName: string | null
  logoUrl: string
}

interface Props {
  shareId: string
  isHost: boolean
}

export default function VoicePackPicker({ shareId, isHost }: Props) {
  const [packs, setPacks] = useState<OwnedPack[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isHost) return
    let alive = true
    Promise.all([
      fetch('/api/voice-packs/entitlements', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch(`/api/voice-packs/pod/${shareId}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([entitlements, podSelection]) => {
      if (!alive) return
      setPacks(entitlements?.data?.packs || [])
      setSelected(podSelection?.data?.voicePackId ?? null)
    })
    return () => {
      alive = false
    }
  }, [shareId, isHost])

  async function choose(packId: string | null) {
    if (saving) return
    const previous = selected
    setSelected(packId)
    setSaving(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/voice-packs/pod/${shareId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voicePackId: packId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message ?? 'Could not save')
    } catch (err) {
      setSelected(previous)
      setErrorMessage(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (!isHost || packs.length === 0) return null

  return (
    <div className="voice-pack-picker">
      <h3 className="voice-pack-picker-title">Voice Pack</h3>
      <p className="voice-pack-picker-subtitle">
        Everyone at this table hears the pack you choose.
      </p>
      <div className="voice-pack-picker-row">
        <Button
          variant="toggle"
          glowColor="blue"
          active={selected === null}
          disabled={saving}
          onClick={() => choose(null)}
        >
          Default
        </Button>
        {packs.map((pack) => (
          <Button
            key={pack.id}
            variant="toggle"
            glowColor="blue"
            active={selected === pack.id}
            disabled={saving}
            onClick={() => choose(pack.id)}
          >
            <span className="voice-pack-picker-option">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="voice-pack-picker-logo" src={pack.logoUrl} alt="" />
              {pack.displayName}
            </span>
          </Button>
        ))}
      </div>
      {errorMessage && (
        <p className="voice-pack-picker-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
