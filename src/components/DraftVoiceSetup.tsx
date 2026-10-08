'use client'

import {useState} from 'react'
import Button from './Button'
import Modal from './Modal'
import VoicePackPicker from './VoicePackPicker'

export default function DraftVoiceSetup({shareId}: {shareId: string}) {
  const [open, setOpen] = useState(false)
  return <>
    <Button variant="icon" aria-label="Voices" title="Voices" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>
    </Button>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title="Voices" showCloseButton variant="wide" className="draft-voice-modal">
      <Modal.Body>
        <p className="voice-modal-description">Choose the voice for this table. Selecting a voice saves it and plays its greeting.</p>
        {open && <VoicePackPicker shareId={shareId} isHost catalog />}
      </Modal.Body>
    </Modal>
  </>
}
