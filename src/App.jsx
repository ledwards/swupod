import { useState, useEffect } from 'react'
import './App.css'
import LandingPage from './components/LandingPage'
import SetSelection from './components/SetSelection'
import SealedPod from './components/SealedPod'
import DeckBuilder from './components/DeckBuilder'
import TermsOfService from './components/TermsOfService'
import PrivacyPolicy from './components/PrivacyPolicy'
import Modal from './components/Modal'
import Button from './components/Button'
import { initializeCardCache } from './utils/cardCache'

function getInitialView() {
  if (typeof window === 'undefined') return 'landing'

  const path = window.location.pathname
  if (path === '/terms-of-service') return 'terms-of-service'
  if (path === '/privacy-policy') return 'privacy-policy'
  return 'landing'
}

function getInitialSelectedSet() {
  if (typeof window === 'undefined') return null

  const savedSealedPod = window.sessionStorage.getItem('sealedPod')
  if (!savedSealedPod) return null

  try {
    const data = JSON.parse(savedSealedPod)
    return data.setCode || null
  } catch (e) {
    console.error('Failed to load saved sealed pod:', e)
    return null
  }
}

function App() {
  const [view, setView] = useState(getInitialView) // 'landing', 'set-selection', 'sealed-pod', 'deck-builder'
  const [selectedSet, setSelectedSet] = useState(getInitialSelectedSet)
  const [deckCards, setDeckCards] = useState([])
  const [showWarning, setShowWarning] = useState(false)

  // Preload all cards on initial page load
  // This happens synchronously since cards are loaded from JSON import
  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      if (path === '/terms-of-service') {
        setView('terms-of-service')
      } else if (path === '/privacy-policy') {
        setView('privacy-policy')
      } else if (path === '/' || path === '') {
        setView('landing')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleSealedClick = () => {
    setView('set-selection')
  }

  const handleSetSelect = (setCode) => {
    setSelectedSet(setCode)
    setView('sealed-pod')
    // Clear any existing sealed pod data
    sessionStorage.removeItem('sealedPod')
  }

  const handleBack = () => {
    if (view === 'terms-of-service' || view === 'privacy-policy') {
      // Navigate back to landing page
      window.history.pushState({}, '', '/')
      setView('landing')
    } else if (view === 'deck-builder') {
      // Deck builder state is auto-saved, just navigate back
      setView('sealed-pod')
      // Don't clear deckCards - keep them for restoration
    } else if (view === 'sealed-pod') {
      // Check if sealed pod exists in session
      const savedSealedPod = sessionStorage.getItem('sealedPod')
      if (savedSealedPod) {
        setShowWarning(true)
      } else {
        // No saved pod, safe to go back
        setView('set-selection')
        setSelectedSet(null)
      }
    } else if (view === 'set-selection') {
      // Clear all deck state when going to homepage
      sessionStorage.removeItem('sealedPod')
      sessionStorage.removeItem('deckBuilderState')
      setDeckCards([])
      setSelectedSet(null)
      setView('landing')
    }
  }

  const handleConfirmBack = () => {
    // Clear saved sealed pod and deck builder state
    sessionStorage.removeItem('sealedPod')
    sessionStorage.removeItem('deckBuilderState')
    setView('set-selection')
    setSelectedSet(null)
    setShowWarning(false)
  }

  const handleCancelBack = () => {
    setShowWarning(false)
  }

  const handleBuildDeck = (cards, setCode) => {
    // Clear any previous deck builder state so we start fresh with the new pool
    sessionStorage.removeItem('deckBuilderState')
    setDeckCards(cards)
    setSelectedSet(setCode) // Keep setCode for deck builder
    setView('deck-builder')
  }

  const handleSealedPodGenerated = (packs, setCode) => {
    // Save sealed pod to sessionStorage
    sessionStorage.setItem('sealedPod', JSON.stringify({
      setCode,
      packs,
      timestamp: Date.now()
    }))
  }

  return (
    <div className="app">
      <Modal
        isOpen={showWarning}
        onClose={handleCancelBack}
        title="Warning"
        variant="danger"
      >
        <Modal.Body>
          <p>Going back will lose your current sealed pod and regenerate a new one. Are you sure you want to continue?</p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="danger" onClick={handleConfirmBack}>
            Yes, Go Back
          </Button>
          <Button variant="secondary" onClick={handleCancelBack}>
            Cancel
          </Button>
        </Modal.Actions>
      </Modal>
      {view === 'landing' && (
        <LandingPage onSealedClick={handleSealedClick} />
      )}
      {view === 'set-selection' && (
        <SetSelection onSetSelect={handleSetSelect} onBack={handleBack} />
      )}
      {view === 'sealed-pod' && selectedSet && (
        <SealedPod 
          setCode={selectedSet} 
          onBack={handleBack} 
          onBuildDeck={handleBuildDeck}
          onPacksGenerated={handleSealedPodGenerated}
        />
      )}
      {view === 'deck-builder' && deckCards.length > 0 && selectedSet && (
        <DeckBuilder 
          cards={deckCards} 
          setCode={selectedSet} 
          onBack={handleBack}
          savedState={sessionStorage.getItem('deckBuilderState')}
        />
      )}
      {view === 'terms-of-service' && (
        <TermsOfService onBack={handleBack} />
      )}
      {view === 'privacy-policy' && (
        <PrivacyPolicy onBack={handleBack} />
      )}
    </div>
  )
}

export default App
