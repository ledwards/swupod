// @ts-nocheck
'use client'

import { Suspense, useState, useEffect } from 'react'
import '../src/App.css'
import LobbyHome from '../src/components/Lobby/LobbyHome'
import TermsOfService from '../src/components/TermsOfService'
import PrivacyPolicy from '../src/components/PrivacyPolicy'
import About from '../src/components/About'
import { initializeCardCache } from '../src/utils/cardCache'

type ViewType = 'landing' | 'terms-of-service' | 'privacy-policy' | 'support-the-pod'

export default function Home() {
  const [view, setView] = useState<ViewType>('landing')

  // Preload all cards on initial page load
  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  // Handle URL-based routing for legal pages
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/terms-of-service') {
      setView('terms-of-service')
    } else if (path === '/privacy-policy') {
      setView('privacy-policy')
    } else if (path === '/support-the-pod') {
      setView('support-the-pod')
    } else if (path === '/sets') {
      // Redirect /sets to /sealed
      window.location.href = '/sealed'
    }
  }, [])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      if (path === '/terms-of-service') {
        setView('terms-of-service')
      } else if (path === '/privacy-policy') {
        setView('privacy-policy')
      } else if (path === '/support-the-pod') {
        setView('support-the-pod')
      } else if (path === '/sets') {
        window.location.href = '/sealed'
      } else if (path === '/' || path === '') {
        setView('landing')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleBack = () => {
    window.history.pushState({}, '', '/')
    setView('landing')
  }

  return (
    <div className="app">
      {view === 'landing' && (
        <Suspense fallback={null}>
          <LobbyHome />
        </Suspense>
      )}
      {view === 'terms-of-service' && (
        <TermsOfService onBack={handleBack} />
      )}
      {view === 'privacy-policy' && (
        <PrivacyPolicy onBack={handleBack} />
      )}
      {view === 'support-the-pod' && (
        <About onBack={handleBack} />
      )}
    </div>
  )
}
