'use client'

import {useCallback, useEffect, useState} from 'react'
import Button from './Button'
import Modal from './Modal'
import VoicePackPicker from './VoicePackPicker'
import {builtInVoicePack} from '../utils/voicePackAssets'

// The lobby's Sound setting: one item, the table's voice. Rendered only in the
// lobby, so the voice cannot change once the draft starts.
export default function DraftVoiceSetup({shareId}: {shareId: string}) {
  const [open, setOpen] = useState(false)
  const [voiceName, setVoiceName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    fetch(`/api/voice-packs/pod/${shareId}`, {credentials: 'include'})
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null)
      .then(json => {
        const id: string | null = json?.data?.voicePackId ?? null
        setVoiceName(id ? (builtInVoicePack(id)?.name ?? json?.data?.pack?.displayName ?? null) : null)
        setLoaded(true)
      })
  }, [shareId])

  useEffect(() => { refresh() }, [refresh])

  return <>
    <span className="draft-voice-current" aria-busy={!loaded}>
      {voiceName ? `Voice: ${voiceName}` : 'Choose a voice'}
    </span>
    <Button variant="secondary" size="xs" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} disabled={!loaded}>
      {voiceName ? 'Change' : 'Choose'}
    </Button>
    <Modal isOpen={open} onClose={() => { setOpen(false); refresh() }} title="Voices" showCloseButton variant="wide" className="draft-voice-modal">
      <Modal.Body>
        <p className="voice-modal-description">Choose the voice for this table. Selecting a voice saves it and plays its greeting.</p>
        {open && <VoicePackPicker shareId={shareId} isHost catalog onChange={refresh} />}
      </Modal.Body>
    </Modal>
  </>
}
