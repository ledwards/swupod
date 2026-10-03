'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Button from '@/src/components/Button'
import {useAuth} from '@/src/contexts/AuthContext'

export default function LocalTest() {
  const {user,loading}=useAuth() as {user:{is_admin?:boolean;is_beta_tester?:boolean}|null;loading:boolean};const beta=user?.is_admin||user?.is_beta_tester
  const params = useSearchParams()
  const pool = params.get('pool')
  const request = params.get('request')
  const seat = params.get('seat')
  const ai = params.get('opponent') === 'ai'
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [retry, setRetry] = useState(0)
  const launching = useRef(false)
  useEffect(() => {
    if (!beta || !pool || !request || seat === null || launching.current) return
    launching.current = true
    setError('')
    void fetch('/api/play/native/local-test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({poolShareId:pool,requestId:request,seat:Number(seat),opponent:ai?'ai':'human'}) })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) { setNeedsLogin(response.status === 401); throw Error(result.error ?? 'Unable to open the test game.') }
        window.location.assign(result.launchUrl)
      }).catch(failure => { setError(failure.message); launching.current = false })
  }, [pool, request, seat, retry, ai, beta])
  const path = `/play/test?pool=${encodeURIComponent(pool ?? '')}&request=${encodeURIComponent(request ?? '')}${ai?'&opponent=ai':''}`
  if(loading||!beta)return <main className="native-play-page page-background"><section className="native-play-shell"><h1>Play · Beta</h1><p>{loading?'Checking access…':'Native play is currently available to beta users.'}</p></section></main>
  return <main className="native-play-page page-background"><section className="native-play-shell native-test-shell">
    <header className="native-play-heading"><h1>{ai?'Play vs AI · WIP':'Test both sides'}</h1><p>{ai?'Test against AI using a copy of your saved deck.':'Test a game using the same account in two windows.'}</p></header>
    <section className="native-play-panel">
      {!pool || !request ? <p>Choose a saved deck on the Play page first.</p> : seat !== null ? <>
        <h2>{ai?'Opening your AI game':`Opening player ${Number(seat) + 1}`}</h2>
        {error ? <div role="alert"><p>{error}</p>{needsLogin ? <a className="btn btn--md btn--discord" href={`/api/auth/signin/discord?return_to=${encodeURIComponent(`${path}&seat=${seat}`)}`}>Sign in with Discord</a> : <Button onClick={() => setRetry(value => value + 1)}>Retry</Button>}</div> : <p role="status">Connecting to the game…</p>}
      </> : <>
        {ai ? <><h2>Resume your AI game</h2><a className="btn btn--lg btn--primary" href={`${path}&seat=0`}>Resume game</a><p>The bot takes its own turns. This test uses decklist-aware search and does not count toward competitive results.</p></> : <><h2>Open each player in a window</h2>
        <p>Both players use a copy of your selected deck. Play each turn in that player’s window. No second account or AI needed.</p>
        <div className="native-play-actions"><a className="btn btn--lg btn--primary" href={`${path}&seat=0`} target="_blank" rel="noopener">Open player 1</a><a className="btn btn--lg btn--primary" href={`${path}&seat=1`} target="_blank" rel="noopener">Open player 2</a></div>
        <p>You can reopen either seat here without starting over. This local test game does not enter matchmaking or your competitive results.</p></>}
      </>}
      <a href={`/play${pool ? `?pool=${encodeURIComponent(pool)}` : ''}`}>Back to Play</a>
    </section>
  </section></main>
}
