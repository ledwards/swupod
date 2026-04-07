// @ts-nocheck
'use client'

import { use, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getPackArtUrl } from '../../../../src/utils/packArt'
import { useAuth } from '../../../../src/contexts/AuthContext'
import { usePodSocket } from '../../../../src/hooks/usePodSocket'
import { loadPool } from '../../../../src/utils/poolApi'
import { jsonParse } from '../../../../src/utils/json'
import { defaultSort } from '../../../../src/services/cards/cardSorting'
import { getCachedCards, initializeCardCache } from '../../../../src/utils/cardCache'
import { getBaseSetCode } from '../../../../src/utils/carboniteConstants'
import { buildBaseCardMap, getBaseCardId } from '../../../../src/utils/variantDowngrade'
import { calculateAspectPenalty } from '../../../../src/services/cards/aspectPenalties'
import Button from '../../../../src/components/Button'
import CardWithPreview from '../../../../src/components/CardWithPreview'
import ChatPanel from '../../../../src/components/ChatPanel'
import EditableTitle from '../../../../src/components/EditableTitle'
import Modal from '../../../../src/components/Modal'
import PlayInstructions from '../../../../src/components/PlayInstructions'
import '../../../../src/App.css'
import './pod.css'
import '../../../../src/components/ChatPanel.css'

const CrownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="none">
    <path d="M2 20h20v2H2zM4 17h16l-2-9-4 4-2-6-2 6-4-4z"/>
  </svg>
)

const DefaultAvatar = ({ size = 28, className = 'pod-match-avatar' }: { size?: number; className?: string }) => (
  <div className={`${className} default-avatar`} style={{ width: size, height: size }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 71 55" fill="currentColor">
      <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.7 40.7 0 00-1.8 3.7 54 54 0 00-16.2 0A39.2 39.2 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.9 58.9 0 0018 9.1.2.2 0 00.2-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.3 47.3 0 003.6 5.9.2.2 0 00.2.1 58.7 58.7 0 0018-9.1v-.1c1.4-15-2.3-28.4-9.8-40.1a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1zm23.3 0c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1z"/>
    </svg>
  </div>
)

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function PodPage({ params }: PageProps) {
  const { shareId } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { podData, loading, error } = usePodSocket(shareId)
  const [viewingDeckImage, setViewingDeckImage] = useState<string | null>(null)
  const [generatingForPlayer, setGeneratingForPlayer] = useState<string | null>(null)
  const [myPool, setMyPool] = useState(null)
  const [baseCardMap, setBaseCardMap] = useState(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [practiceHand, setPracticeHand] = useState<{
    cards: any[]
    probAtLeastOne: number
    avgTurnOnePlays: number
    turnOnePlays: number
    totalCards: number
  } | null>(null)

  // Detect Wayfinder extension via DOM marker
  const [wayfinderDetected, setWayfinderDetected] = useState(false)
  useEffect(() => {
    if (document.querySelector('meta[name="wayfinder-installed"]')) {
      setWayfinderDetected(true)
      return
    }
    const onInstalled = () => setWayfinderDetected(true)
    document.addEventListener('wayfinder:installed', onInstalled)
    const timer = setTimeout(() => {
      if (document.querySelector('meta[name="wayfinder-installed"]')) setWayfinderDetected(true)
    }, 1000)
    return () => {
      document.removeEventListener('wayfinder:installed', onInstalled)
      clearTimeout(timer)
    }
  }, [])

  const [isDiscordMember, setIsDiscordMember] = useState<boolean | null>(null)
  const botBuildTriggered = useRef(false)
  const shuffleSoundRef = useRef(null)

  // Check if user has already joined Discord
  useEffect(() => {
    if (!user) return
    fetch('/api/auth/discord-member', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setIsDiscordMember(data?.data?.isMember ?? false))
      .catch(() => setIsDiscordMember(false))
  }, [user])

  // Auto-trigger bot deck building for the host if any players lack pools
  useEffect(() => {
    if (!podData || !podData.isHost || botBuildTriggered.current) return
    const hasPlayersWithoutPools = podData.players.some(p => !p.poolShareId && !p.isReady)
    if (hasPlayersWithoutPools) {
      botBuildTriggered.current = true
      fetch(`/api/draft/${shareId}/build-bot-decks`, { method: 'POST', credentials: 'include' })
        .catch(() => {})
    }
  }, [podData, shareId])

  // Load own pool data for export functions + record built deck for readiness tracking
  useEffect(() => {
    if (!podData?.myPoolShareId) return
    loadPool(podData.myPoolShareId).then(setMyPool).catch(() => {})
    // Record built deck (fire-and-forget) so pod-state broadcast marks us as ready
    fetch(`/api/pools/${podData.myPoolShareId}/build`, { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [podData?.myPoolShareId])

  // Initialize card cache and base card map
  useEffect(() => {
    if (!myPool?.setCode) return
    async function init() {
      await initializeCardCache()
      const map = buildBaseCardMap(myPool.setCode)
      setBaseCardMap(map)
    }
    init()
  }, [myPool?.setCode])

  // Initialize shuffle sound
  useEffect(() => {
    shuffleSoundRef.current = new Audio('/sounds/shuffling-hand.mp3')
    shuffleSoundRef.current.volume = 0.5
    shuffleSoundRef.current.load()
  }, [])

  if (loading) {
    return (
      <div className="pod-page">
        <div className="pod-content">
          <div className="skeleton-block" style={{ width: '100px', height: '32px', marginBottom: '1.5rem' }} />
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="skeleton-line" style={{ width: '200px', height: '1.8rem', margin: '0 auto 0.5rem' }} />
            <div className="skeleton-line" style={{ width: '100px', height: '0.9rem', margin: '0 auto' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
            <div className="skeleton-block" style={{ width: '130px', height: '40px' }} />
            <div className="skeleton-block" style={{ width: '110px', height: '40px' }} />
          </div>
          <div style={{ maxWidth: '400px', margin: '0 auto 2rem' }}>
            <div className="skeleton-line" style={{ width: '120px', height: '1.1rem', marginBottom: '1rem' }} />
            <div className="skeleton-block" style={{ width: '100%', height: '80px' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-block" style={{ width: '110px', height: '40px' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !podData) {
    return (
      <div className="pod-page">
        <div className="pod-error">
          <h2>Could not load pod</h2>
          <p>{error || 'Pod data not available'}</p>
          <Button variant="secondary" onClick={() => router.push('/')}>
            Go Home
          </Button>
        </div>
      </div>
    )
  }

  const { draft, players, pairings, myOpponent, myBye, isHost, myPoolShareId } = podData
  const packArtUrl = getPackArtUrl(draft.setCode)
  const isSolo = draft.settings?.isSolo === true

  // Build player ID -> poolShareId lookup for owner view links
  const playerPoolMap = new Map(players.map(p => [p.id, p.poolShareId]))

  const handleEditDeck = () => {
    if (myPoolShareId) {
      router.push(`/pool/${myPoolShareId}/deck`)
    }
  }

  const handleViewPlay = () => {
    if (myPoolShareId) {
      router.push(`/pool/${myPoolShareId}/deck/play`)
    }
  }

  const copyDeckUrl = async () => {
    if (!myPoolShareId) return
    const url = `${window.location.origin}/pool/${myPoolShareId}/deck/play`
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Deck link copied!')
      setMessageType('success')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    } catch {
      // fallback: do nothing
    }
  }

  const getDeckData = () => {
    if (!myPool?.deckBuilderState) return null
    const state = jsonParse(myPool.deckBuilderState)
    const { cardPositions, activeLeader, activeBase } = state
    if (!cardPositions || !activeLeader || !activeBase) return null

    const leaderCard = cardPositions[activeLeader]?.card
    const baseCard = cardPositions[activeBase]?.card
    if (!leaderCard || !baseCard) return null

    const allCards = getCachedCards(getBaseSetCode(myPool.setCode)) || []
    const leaderBaseIds = new Set()
    allCards.forEach(card => {
      if (card.type === 'Leader' || card.type === 'Base') {
        leaderBaseIds.add(getBaseCardId(card, baseCardMap))
      }
    })

    const deckCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'deck' && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    const sideboardCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'sideboard' && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    const deckCounts = new Map()
    deckCards.forEach(card => {
      const id = getBaseCardId(card, baseCardMap)
      if (!leaderBaseIds.has(id)) {
        deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
      }
    })

    const sideboardCounts = new Map()
    sideboardCards.forEach(card => {
      const id = getBaseCardId(card, baseCardMap)
      if (!leaderBaseIds.has(id)) {
        sideboardCounts.set(id, (sideboardCounts.get(id) || 0) + 1)
      }
    })

    const poolName = state.poolName || myPool.name || `${myPool.setCode} Draft`

    return {
      metadata: {
        name: `[PTP] ${poolName}`.slice(0, 80),
        author: "Protect the Pod"
      },
      leader: { id: getBaseCardId(leaderCard, baseCardMap), count: 1 },
      base: { id: getBaseCardId(baseCard, baseCardMap), count: 1 },
      deck: Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count })),
      sideboard: Array.from(sideboardCounts.entries()).map(([id, count]) => ({ id, count }))
    }
  }

  const copyToClipboard = async () => {
    const deckData = getDeckData()
    if (!deckData) {
      setMessage('No deck data found. Please build your deck first.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(deckData, null, 2))
      setMessage('Deck JSON copied to clipboard!')
      setMessageType('success')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    } catch {
      setMessage('Failed to copy to clipboard')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const downloadJSON = () => {
    const deckData = getDeckData()
    if (!deckData) {
      setMessage('No deck data found. Please build your deck first.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }
    const jsonString = JSON.stringify(deckData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `[PTP DRAFT] ${myPool?.setCode || 'deck'} Deck.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportOwnDeckImage = async () => {
    if (!myPool?.deckBuilderState) return
    setGeneratingImage(true)
    try {
      const state = jsonParse(myPool.deckBuilderState)
      const { cardPositions, activeLeader, activeBase } = state
      if (!cardPositions || !activeLeader || !activeBase) {
        setGeneratingImage(false)
        return
      }

      const leaderCard = cardPositions[activeLeader]?.card
      const baseCard = cardPositions[activeBase]?.card
      const deckCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'deck' && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
        .map(pos => pos.card)
        .sort(defaultSort)

      const barlowFont = new FontFace('Barlow', 'url(https://fonts.gstatic.com/s/barlow/v12/7cHpv4kjgoGqM7E_DMs5.woff2)')
      const barlowBold = new FontFace('Barlow', 'url(https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E30-8s51os.woff2)', { weight: '700' })
      await Promise.all([barlowFont.load(), barlowBold.load()])
      document.fonts.add(barlowFont)
      document.fonts.add(barlowBold)

      const width = 2767
      const padding = 100
      const cardWidth = 300
      const cardHeight = 420
      const cardBorderRadius = 15
      const leaderBaseWidth = 525
      const leaderBaseHeight = 375
      const spacing = 25
      const titleHeight = 100
      const subtitleHeight = 65
      const labelHeight = 90
      const sectionSpacing = 50
      const footerHeight = 200
      const cardsPerRow = 8

      const deckRows = Math.ceil(deckCards.length / cardsPerRow)
      const totalHeight = padding + titleHeight + subtitleHeight + sectionSpacing +
        leaderBaseHeight + sectionSpacing +
        labelHeight + deckRows * (cardHeight + spacing) + sectionSpacing +
        footerHeight + padding

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'rgb(9, 9, 9)'
      ctx.fillRect(0, 0, width, totalHeight)

      const roundedClip = (x, y, w, h, r) => {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + r)
        ctx.lineTo(x + w, y + h - r)
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        ctx.lineTo(x + r, y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - r)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.closePath()
      }

      const drawCard = async (card, x, y, w, h, borderRadius = cardBorderRadius) => {
        if (!card?.imageUrl) {
          ctx.save(); roundedClip(x, y, w, h, borderRadius); ctx.clip()
          ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, h); ctx.restore()
          ctx.fillStyle = '#888'; ctx.font = '30px Barlow'; ctx.textAlign = 'center'
          ctx.fillText(card?.name || 'Unknown', x + w / 2, y + h / 2)
          return
        }
        const imageUrl = card.imageUrl.replace('/small/', '/large/').replace('/medium/', '/large/')
        const tryLoadImage = (url) => new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
        try {
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
          const img = await tryLoadImage(proxyUrl)
          ctx.save(); roundedClip(x, y, w, h, borderRadius); ctx.clip()
          ctx.drawImage(img, x, y, w, h); ctx.restore()
        } catch {
          ctx.save(); roundedClip(x, y, w, h, borderRadius); ctx.clip()
          ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, h); ctx.restore()
          ctx.fillStyle = '#888'; ctx.font = '30px Barlow'; ctx.textAlign = 'center'
          ctx.fillText(card?.name || 'Unknown', x + w / 2, y + h / 2)
        }
      }

      let currentY = padding
      ctx.fillStyle = 'white'; ctx.font = 'bold 70px Barlow'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      const displayName = state.poolName || myPool.name || `${myPool.setCode} Draft`
      ctx.fillText(displayName, width / 2, currentY)
      currentY += titleHeight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.font = '600 45px Barlow'
      ctx.fillText('Draft Deck', width / 2, currentY - 20)
      currentY += subtitleHeight + sectionSpacing

      const totalLeaderBaseWidth = leaderBaseWidth * 2 + spacing
      const startX = (width - totalLeaderBaseWidth) / 2
      if (leaderCard) await drawCard(leaderCard, startX, currentY, leaderBaseWidth, leaderBaseHeight, 20)
      if (baseCard) await drawCard(baseCard, startX + leaderBaseWidth + spacing, currentY, leaderBaseWidth, leaderBaseHeight, 20)
      currentY += leaderBaseHeight + sectionSpacing

      ctx.fillStyle = 'white'; ctx.font = 'bold 50px Barlow'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(`Deck (${deckCards.length} cards)`, padding, currentY)
      currentY += labelHeight

      let col = 0, row = 0
      for (const card of deckCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight)
        col++
        if (col >= cardsPerRow) { col = 0; row++ }
      }

      const footerY = totalHeight - footerHeight - padding + 20
      ctx.fillStyle = 'white'; ctx.font = 'bold 50px Barlow'; ctx.textAlign = 'center'
      const now = new Date()
      ctx.fillText(`Created by Protect the Pod on ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, width / 2, footerY)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.font = '48px Barlow'
      ctx.fillText(`https://www.protectthepod.com/pool/${myPoolShareId}/deck`, width / 2, footerY + 80)

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        setViewingDeckImage(url)
        setGeneratingImage(false)
      }, 'image/png')
    } catch (err) {
      console.error('[POD] Error generating own deck image:', err)
      setGeneratingImage(false)
    }
  }

  const drawPracticeHand = (playSound = false) => {
    if (!myPool?.deckBuilderState) return
    const state = jsonParse(myPool.deckBuilderState)
    const { cardPositions, activeLeader, activeBase } = state
    if (!cardPositions) return

    const leaderCard = activeLeader ? cardPositions[activeLeader]?.card : null
    const baseCard = activeBase ? cardPositions[activeBase]?.card : null

    const deckCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'deck' && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    const shuffled = [...deckCards].sort(() => Math.random() - 0.5)
    const hand = shuffled.slice(0, 6)

    const isTurnOnePlay = (card) => {
      const cost = card.cost ?? 0
      const penalty = calculateAspectPenalty(card, leaderCard, baseCard)
      if (cost + penalty > 2) return false
      if (card.type === 'Unit') return true
      if (card.name === 'Faith in Your Friends') return true
      return false
    }

    const totalCards = deckCards.length
    const turnOnePlays = deckCards.filter(isTurnOnePlay).length
    const handSize = Math.min(6, totalCards)

    let probAtLeastOne = 0
    let avgTurnOnePlays = 0
    if (totalCards > 0 && handSize > 0) {
      const nonT1 = totalCards - turnOnePlays
      if (turnOnePlays === 0) {
        probAtLeastOne = 0
        avgTurnOnePlays = 0
      } else if (nonT1 < handSize) {
        probAtLeastOne = 1
        avgTurnOnePlays = handSize * turnOnePlays / totalCards
      } else {
        let pNone = 1
        for (let i = 0; i < handSize; i++) {
          pNone *= (nonT1 - i) / (totalCards - i)
        }
        probAtLeastOne = 1 - pNone
        avgTurnOnePlays = handSize * turnOnePlays / totalCards
      }
    }

    if (playSound && shuffleSoundRef.current) {
      shuffleSoundRef.current.currentTime = 0
      shuffleSoundRef.current.play().catch(() => {})
    }

    setPracticeHand({ cards: hand, probAtLeastOne, avgTurnOnePlays, turnOnePlays, totalCards })
  }

  const viewPlayerDeck = async (playerId: string) => {
    const poolShareId = playerPoolMap.get(playerId)
    if (!poolShareId) return

    setGeneratingForPlayer(playerId)

    try {
      const poolData = await loadPool(poolShareId)
      if (!poolData?.deckBuilderState) {
        setGeneratingForPlayer(null)
        return
      }

      const state = typeof poolData.deckBuilderState === 'string'
        ? jsonParse(poolData.deckBuilderState)
        : poolData.deckBuilderState

      const { cardPositions, activeLeader, activeBase } = state
      if (!cardPositions || !activeLeader || !activeBase) {
        setGeneratingForPlayer(null)
        return
      }

      const leaderCard = cardPositions[activeLeader]?.card
      const baseCard = cardPositions[activeBase]?.card

      const deckCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'deck' && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
        .map(pos => pos.card)
        .sort(defaultSort)

      // Load Barlow font
      const barlowFont = new FontFace('Barlow', 'url(https://fonts.gstatic.com/s/barlow/v12/7cHpv4kjgoGqM7E_DMs5.woff2)')
      const barlowBold = new FontFace('Barlow', 'url(https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E30-8s51os.woff2)', { weight: '700' })
      await Promise.all([barlowFont.load(), barlowBold.load()])
      document.fonts.add(barlowFont)
      document.fonts.add(barlowBold)

      // Canvas settings
      const width = 2767
      const padding = 100
      const cardWidth = 300
      const cardHeight = 420
      const cardBorderRadius = 15
      const leaderBaseWidth = 525
      const leaderBaseHeight = 375
      const spacing = 25
      const titleHeight = 100
      const subtitleHeight = 65
      const labelHeight = 90
      const sectionSpacing = 50
      const footerHeight = 200
      const cardsPerRow = 8

      const deckRows = Math.ceil(deckCards.length / cardsPerRow)
      const totalHeight = padding + titleHeight + subtitleHeight + sectionSpacing +
        leaderBaseHeight + sectionSpacing +
        labelHeight + deckRows * (cardHeight + spacing) + sectionSpacing +
        footerHeight + padding

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = 'rgb(9, 9, 9)'
      ctx.fillRect(0, 0, width, totalHeight)

      // Helpers
      const roundedClip = (x, y, w, h, r) => {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + r)
        ctx.lineTo(x + w, y + h - r)
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        ctx.lineTo(x + r, y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - r)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.closePath()
      }

      const drawCard = async (card, x, y, w, h, borderRadius = cardBorderRadius) => {
        if (!card?.imageUrl) {
          ctx.save()
          roundedClip(x, y, w, h, borderRadius)
          ctx.clip()
          ctx.fillStyle = '#333'
          ctx.fillRect(x, y, w, h)
          ctx.restore()
          ctx.fillStyle = '#888'
          ctx.font = '30px Barlow'
          ctx.textAlign = 'center'
          ctx.fillText(card?.name || 'Unknown', x + w / 2, y + h / 2)
          return
        }

        const imageUrl = card.imageUrl.replace('/small/', '/large/').replace('/medium/', '/large/')
        const tryLoadImage = (url) => new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })

        try {
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
          const img = await tryLoadImage(proxyUrl)
          if (img) {
            ctx.save()
            roundedClip(x, y, w, h, borderRadius)
            ctx.clip()
            ctx.drawImage(img, x, y, w, h)
            ctx.restore()
          }
        } catch {
          ctx.save()
          roundedClip(x, y, w, h, borderRadius)
          ctx.clip()
          ctx.fillStyle = '#333'
          ctx.fillRect(x, y, w, h)
          ctx.restore()
          ctx.fillStyle = '#888'
          ctx.font = '30px Barlow'
          ctx.textAlign = 'center'
          ctx.fillText(card?.name || 'Unknown', x + w / 2, y + h / 2)
        }
      }

      let currentY = padding

      // Title
      ctx.fillStyle = 'white'
      ctx.font = 'bold 70px Barlow'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const displayName = state.poolName || poolData.name || `${poolData.setCode} Draft`
      ctx.fillText(displayName, width / 2, currentY)
      currentY += titleHeight

      // Subtitle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '600 45px Barlow'
      ctx.fillText('Draft Deck', width / 2, currentY - 20)
      currentY += subtitleHeight + sectionSpacing

      // Leader and base
      const totalLeaderBaseWidth = leaderBaseWidth * 2 + spacing
      const startX = (width - totalLeaderBaseWidth) / 2
      if (leaderCard) await drawCard(leaderCard, startX, currentY, leaderBaseWidth, leaderBaseHeight, 20)
      if (baseCard) await drawCard(baseCard, startX + leaderBaseWidth + spacing, currentY, leaderBaseWidth, leaderBaseHeight, 20)
      currentY += leaderBaseHeight + sectionSpacing

      // Deck label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 50px Barlow'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`Deck (${deckCards.length} cards)`, padding, currentY)
      currentY += labelHeight

      // Deck cards
      let col = 0
      let row = 0
      for (const card of deckCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight)
        col++
        if (col >= cardsPerRow) { col = 0; row++ }
      }

      // Footer
      const footerY = totalHeight - footerHeight - padding + 20
      ctx.fillStyle = 'white'
      ctx.font = 'bold 50px Barlow'
      ctx.textAlign = 'center'
      const now = new Date()
      ctx.fillText(`Created by Protect the Pod on ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, width / 2, footerY)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = '48px Barlow'
      ctx.fillText(`https://www.protectthepod.com/pool/${poolShareId}/deck`, width / 2, footerY + 80)

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        setViewingDeckImage(url)
        setGeneratingForPlayer(null)
      }, 'image/png')

    } catch (err) {
      console.error('[POD] Error generating deck image:', err)
      setGeneratingForPlayer(null)
    }
  }

  return (
    <div className="page-with-chat">
      <div className="page-content">
        <div className="pod-page">
          {packArtUrl && (
            <div className="set-art-header" style={{
              backgroundImage: `url("${packArtUrl}")`,
            }}></div>
          )}

      <div className="pod-content">
        <button className="pod-back-button" onClick={handleEditDeck} disabled={!myPoolShareId}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Edit Deck
        </button>

        <div className="pod-header">
          <EditableTitle
            value={draft.name || draft.setName || 'Draft'}
            isEditable={isHost}
            onSave={(newName) => {
              if (newName) {
                fetch(`/api/draft/${shareId}/settings`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ name: newName }),
                }).catch(() => {})
              }
            }}
            maxLength={100}
            className="pod-title"
          />
          <p className="pod-pool-type">Draft Pod</p>
        </div>

        <div className="practice-hand-button-container">
          <button className="pod-action-button" onClick={() => drawPracticeHand()} disabled={!myPoolShareId || !myPool}>
            <svg width="32" height="32" viewBox="0 -2 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <g transform="rotate(-15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(0 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(15 12 16)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
            </svg>
            Practice Hand
          </button>
        </div>

        {/* In solo mode, show play instructions and actions above pod details */}
        {isSolo && (
          <>
            <PlayInstructions
              shareId={myPoolShareId}
              poolType="sealed"
              setCode={draft?.setCode || myPool?.setCode}
              hasBye={false}
              isSoloDraft={true}
              onCopyLink={copyDeckUrl}
              showActions={false}
              wayfinderDetected={wayfinderDetected}
            />

            <div className="pod-actions">
              <button className="pod-action-button primary" onClick={copyDeckUrl} disabled={!myPoolShareId}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                Copy Link
              </button>

              <button className="pod-action-button" onClick={copyToClipboard} disabled={!myPoolShareId || !myPool}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Copy JSON
              </button>

              <button className="pod-action-button" onClick={downloadJSON} disabled={!myPoolShareId || !myPool}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download
              </button>

              <button className="pod-action-button" onClick={exportOwnDeckImage} disabled={!myPoolShareId || !myPool || generatingImage}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                {generatingImage ? 'Generating...' : 'Deck Image'}
              </button>
            </div>
          </>
        )}

        {/* Pod Status — 2-column player grid by seat */}
        <div className="pod-status-section">
          <h2>Pod Status</h2>
          <div className="pod-player-grid">
            {[...players].sort((a, b) => a.seatNumber - b.seatNumber).map((player, i) => (
              <div key={player.id} className="pod-player-row">
                <span className="pod-seat-number">{i + 1}</span>
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" className="pod-match-avatar" />
                ) : (
                  <DefaultAvatar />
                )}
                <span className="pod-match-name">{player.id === draft.hostId && <CrownIcon />}{player.username}</span>
                <span className={`pod-status-badge ${player.isReady ? 'ready' : 'building'}`}>
                  {player.isReady ? 'Ready' : 'Deckbuilding'}
                </span>
                {isHost && player.isReady && playerPoolMap.get(player.id) && (
                  <button
                    className="pod-eye-button"
                    onClick={() => viewPlayerDeck(player.id)}
                    disabled={generatingForPlayer === player.id}
                    title={`View ${player.username}'s deck`}
                  >
                    {generatingForPlayer === player.id ? (
                      <span className="pod-eye-spinner" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Player view: Your opponent (skip in solo mode) */}
        {!isSolo && <div className="pod-opponent-card">
          <h2>Your Opponent</h2>
          {myBye ? (
            <p className="pod-bye-message">You have a bye this round. Take a break or practice!</p>
          ) : myOpponent ? (
            <div className="pod-opponent-info">
              {myOpponent.avatarUrl ? (
                <img src={myOpponent.avatarUrl} alt="" className="pod-opponent-avatar" />
              ) : (
                <DefaultAvatar size={64} className="pod-opponent-avatar" />
              )}
              <div className="pod-opponent-details">
                <p className="pod-opponent-name">{myOpponent.username}</p>
                <span className={`pod-status-badge ${myOpponent.isReady ? 'ready' : 'building'}`}>
                  {myOpponent.isReady ? 'Ready' : 'Deckbuilding'}
                </span>
              </div>
            </div>
          ) : (
            <p className="pod-bye-message">Opponent not yet assigned</p>
          )}
        </div>}

        {/* Instructions (non-solo only — solo shows them above) */}
        {!isSolo && <PlayInstructions
          shareId={myPoolShareId}
          poolType="draft"
          setCode={draft?.setCode || myPool?.setCode}
          opponentName={myOpponent?.username}
          hasBye={myBye}
          onCopyLink={copyDeckUrl}
          showActions={false}
          wayfinderDetected={wayfinderDetected}
        />}

        {/* Action buttons (non-solo — solo shows them above) */}
        {!isSolo && <div className="pod-actions">
          <button className="pod-action-button primary" onClick={copyDeckUrl} disabled={!myPoolShareId}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Copy Link
          </button>

          <button className="pod-action-button" onClick={copyToClipboard} disabled={!myPoolShareId || !myPool}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy JSON
          </button>

          <button className="pod-action-button" onClick={downloadJSON} disabled={!myPoolShareId || !myPool}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </button>

          <button className="pod-action-button" onClick={exportOwnDeckImage} disabled={!myPoolShareId || !myPool || generatingImage}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            {generatingImage ? 'Generating...' : 'Deck Image'}
          </button>
        </div>}

        {/* Draft log link at bottom */}
        <div className="practice-hand-button-container" style={{ marginTop: '1rem' }}>
          <button className="pod-action-button" onClick={() => router.push(`/draft/${shareId}/log`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Draft Log
          </button>
        </div>

        {/* Feedback message */}
        {message && (
          <div className={`pod-message ${messageType}`}>
            {message}
          </div>
        )}

        {/* Discord banner — hidden if user already a member */}
        {!isDiscordMember && (
          <div className="pod-discord-banner">
            <h3>Join the Community</h3>
            <p>Find opponents, discuss strategy, and coordinate matches in the Protect the Pod Discord.</p>
            <a href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'} target="_blank" rel="noopener noreferrer" className="pod-discord-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Join Discord
            </a>
          </div>
        )}
      </div>

      {/* Practice hand modal */}
      <Modal
        isOpen={practiceHand !== null}
        onClose={() => setPracticeHand(null)}
        title="Practice Hand"
        showCloseButton
        className="modal--wide"
      >
        <Modal.Body>
          <div className="practice-hand-cards">
            {practiceHand?.cards.map((card, i) => (
              <CardWithPreview key={`${card.id}-${i}`} card={card} />
            ))}
          </div>
          {practiceHand && (
            <div className="practice-hand-stats">
              <p>Probability of drawing at least one turn 1 play: ({practiceHand.turnOnePlays}/{practiceHand.totalCards}) {(practiceHand.probAtLeastOne * 100).toFixed(2)}%</p>
              <p>Average number of turn one plays: {practiceHand.avgTurnOnePlays.toFixed(2)}</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Actions className="practice-hand-actions">
          <Button variant="primary" onClick={() => drawPracticeHand(true)}>
            Draw Another
          </Button>
        </Modal.Actions>
      </Modal>

        {/* Deck image modal */}
        {viewingDeckImage && (
          <div className="deck-image-modal-overlay" onClick={() => {
            URL.revokeObjectURL(viewingDeckImage)
            setViewingDeckImage(null)
          }}>
            <div className="deck-image-modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                className="deck-image-modal-close"
                onClick={() => {
                  URL.revokeObjectURL(viewingDeckImage)
                  setViewingDeckImage(null)
                }}
              >
                &times;
              </button>
              <img
                src={viewingDeckImage}
                alt="Deck Export"
                className="deck-image-modal-image"
              />
            </div>
          </div>
        )}
      </div>
      </div>
      {!isSolo && <ChatPanel shareId={shareId} />}
    </div>
  )
}
