'use client'

/**
 * VoicePackPicker — the host chooses which unlocked voice pack a pod uses.
 *
 * Two modes, one control:
 *
 *   <VoicePackPicker isHost shareId={shareId} />                      // live pod
 *   <VoicePackPicker isHost value={packId} onChange={setPackId} />    // draft setup,
 *                                                                     // before the pod exists
 *
 * With a `shareId` it fetches the pod's current selection and PUTs every change. With
 * `value`/`onChange` it is controlled by the setup page, which applies the choice to
 * the pod the moment the pod is created. Either way it fetches the viewer's
 * entitlements itself and renders NOTHING when the viewer is not the host or has
 * unlocked no packs, so a call site can drop it in unconditionally.
 *
 * CHOOSING IS ALSO THE AUDIO GESTURE. Browsers block programmatic playback until a
 * user gesture, so the click is spent immediately — synchronously, before any await —
 * on `prime(packId, { announce: 'greeting' })`: every clip of the chosen pack is
 * unlocked for this page, and the pack's own greeting plays back as confirmation. A
 * pack without a usable greeting simply stays quiet.
 *
 * The server re-checks both host-ness and ownership on every write — hiding the
 * control here is presentation, not a gate.
 */
import { useEffect, useState } from 'react'
import useVoicePackAudio from '@/src/hooks/useVoicePackAudio'
import StyledSelect from '@/src/components/StyledSelect'
import type { StyledSelectOption } from '@/src/components/StyledSelect'
import { BUILT_IN_VOICE_PACKS, DEFAULT_VOICE_PACK_ID } from '@/src/utils/voicePackAssets'
import './VoicePackPicker.css'

/**
 * The host's most recent choice, so a new pod starts on the pack they used
 * last rather than resetting to the built-in pack every time. Purely a convenience
 * default — a pod's stored selection always wins once it has one.
 */
export const LAST_VOICE_PACK_KEY = 'ptp-last-voice-pack'

interface OwnedPack {
  id: string
  code: string
  displayName: string
  creatorName: string | null
  logoUrl: string
}

interface Props {
  /** Pod to write to. Omit before the pod exists (draft setup) and pass value/onChange. */
  shareId?: string
  isHost: boolean
  /** Controlled selection, for the pre-creation mode. Ignored when `shareId` is set. */
  value?: string | null
  /** Called with the new selection in the pre-creation mode. */
  onChange?: (packId: string | null) => void
  /** Tighter layout for a settings header rather than a controls panel. */
  compact?: boolean
}

export default function VoicePackPicker({ shareId, isHost, value, onChange, compact }: Props) {
  const [packs, setPacks] = useState<OwnedPack[]>([])
  const [selected, setSelected] = useState<string | null>(value ?? null)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { prime } = useVoicePackAudio(selected)

  // Controlled mode: the setup page owns the value.
  useEffect(() => {
    if (shareId === undefined && value !== undefined) setSelected(value)
  }, [shareId, value])

  useEffect(() => {
    if (!isHost) return
    let alive = true
    Promise.all([
      fetch('/api/voice-packs/entitlements', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      shareId
        ? fetch(`/api/voice-packs/pod/${shareId}`, { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([entitlements, podSelection]) => {
      if (!alive) return
      const owned = entitlements?.data?.packs || []
      setPacks(owned)
      if (shareId) {
        const podPick = podSelection?.data?.voicePackId ?? null
        if (podPick) {
          setSelected(podPick)
        } else {
          // No pack chosen for this pod yet — start on whatever the host used
          // last, but only if they still own it.
          let remembered: string | null = null
          try {
            remembered = window.localStorage.getItem(LAST_VOICE_PACK_KEY)
          } catch { /* private browsing / quota */ }
          const stillOwned = remembered && owned.some((p: { id: string }) => p.id === remembered)
          setSelected(stillOwned ? remembered : null)
        }
      }
    })
    return () => {
      alive = false
    }
  }, [shareId, isHost])

  async function choose(packId: string | null) {
    if (saving) return
    // FIRST, and synchronously: the click is the gesture that unlocks audio on this
    // page, and it also plays back the chosen pack's greeting. Anything awaited
    // before this point would spend the gesture.
    prime(packId, { announce: 'greeting' })

    const previous = selected
    setSelected(packId)
    setErrorMessage(null)
    try {
      if (packId) window.localStorage.setItem(LAST_VOICE_PACK_KEY, packId)
      else window.localStorage.removeItem(LAST_VOICE_PACK_KEY)
    } catch { /* private browsing / quota — a forgotten default is harmless */ }

    if (!shareId) {
      onChange?.(packId)
      return
    }

    setSaving(true)
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

  // Always render for a host: the built-in packs mean there is always
  // something to choose, even before anyone unlocks a creator pack.
  if (!isHost) return null

  // Leebo heads the list; everything after him is a language pack.
  const leebo = BUILT_IN_VOICE_PACKS.find(p => p.id === DEFAULT_VOICE_PACK_ID)
  const languagePacks = BUILT_IN_VOICE_PACKS.filter(p => p.id !== DEFAULT_VOICE_PACK_ID)

  // Order the user asked for: Leebo alone at the top with no header, then
  // anything they have unlocked under "Special", then the language packs.
  const options: StyledSelectOption[] = [
    ...(leebo ? [{
      value: leebo.id,
      label: leebo.name,
      description: leebo.description,
      iconUrl: leebo.icon,
    }] : []),
    ...packs.map((pack, i): StyledSelectOption => ({
      value: pack.id,
      label: pack.displayName,
      ...(pack.creatorName ? { description: `by ${pack.creatorName}` } : {}),
      ...(pack.logoUrl ? { iconUrl: pack.logoUrl } : {}),
      ...(i === 0 ? { groupLabel: 'Special' } : {}),
    })),
    ...languagePacks.map((pack, i): StyledSelectOption => ({
      value: pack.id,
      label: pack.name,
      description: pack.description,
      iconUrl: pack.icon,
      ...(i === 0 ? { groupLabel: 'Default' } : {}),
    })),
  ]

  return (
    <div className={`voice-pack-picker${compact ? ' voice-pack-picker--compact' : ''}`}>
      <StyledSelect
        options={options}
        value={selected ?? DEFAULT_VOICE_PACK_ID}
        onChange={choose}
        disabled={saving}
        ariaLabel="Voice pack for this draft"
      />
      {errorMessage && (
        <p className="voice-pack-picker-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
