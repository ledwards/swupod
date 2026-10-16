'use client'
import { useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import ContentSkeleton from '../ContentSkeleton'
import DiscordLoginButton from '../DiscordLoginButton'
import { SiteTitle } from '../SiteTheme'
import SiteFooter from '../SiteFooter'
import { initializeCardCache } from '../../utils/cardCache'
import ImportWizard from './ImportWizard'
import '../ImportPool/ImportPool.css'
import './import-alpha.css'

/**
 * Import Pool (alpha): bring a photographed registration sheet into the deck
 * builder. A Friends of the Pod feature; everyone else sees what it does and
 * how to get it.
 */
export default function ImportPage() {
  const { isAuthenticated, isPatron, loading } = useAuth() as { isAuthenticated: boolean; isPatron: boolean | null; loading: boolean }

  useEffect(() => {
    initializeCardCache().catch((error: unknown) => console.error('Failed to load cards:', error))
  }, [])

  let body
  if (loading) {
    body = <div className="ipa-wizard" aria-busy="true"><ContentSkeleton kind="control" count={3}/><section className="ipa-panel"><ContentSkeleton kind="card" count={2}/></section></div>
  } else if (!isAuthenticated || isPatron === false) {
    body = (
      <section className="ipa-panel ipa-lock" aria-label="Friends of the Pod feature">
        <img src="/patreon/friendofthepod.png" alt="" width={72} height={72}/>
        <h2>Import Your Registered Pool</h2>
        <p>Upload a photo of your registered competitive sealed pool sheet to bring it into the deckbuilder.</p>
        <p className="ipa-lock-note">
          {isAuthenticated ? <>This feature is available to <strong>Friends of the Pod</strong>.</> : <>Sign in with Discord to continue. This feature is available to <a href="/support-the-pod">Friends of the Pod</a>.</>}
        </p>
        {isAuthenticated
          ? <a className="btn btn--primary btn--md" href="/support-the-pod">Become a Friend of the Pod</a>
          : <DiscordLoginButton returnTo="/import"/>}
      </section>
    )
  } else {
    body = <ImportWizard/>
  }

  return (
    <div className="ipa-page">
      <SiteTitle subtitle="Bring a registered sealed pool sheet into the deckbuilder">Import Pool</SiteTitle>
      <main className="ipa-content">{body}</main>
      <SiteFooter/>
    </div>
  )
}
