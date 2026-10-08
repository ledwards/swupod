// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Card from '@/src/components/Card'
import Button from '@/src/components/Button'
import { getPackArtUrl } from '@/src/utils/packArt'
import './page.css'

interface CardData {
  id: string
  name: string
  type: string
  cost?: number
  aspects?: string[]
  imageUrl?: string
  backImageUrl?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isShowcase?: boolean
  rarity?: string
}

interface PoolData {
  setCode: string
  setName: string
  leaders: CardData[]
  bases: CardData[]
  deckCards: CardData[]
  packs?: CardData[][]
}

export default function PackBlitzPoolPage() {
  const params = useParams()
  const router = useRouter()
  const shareId = params.shareId as string

  const [poolData, setPoolData] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPool = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/pools/${shareId}`, {
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Pool not found')
        }

        const response_data = await response.json()
        const data = response_data.data

        const poolInfo = typeof data.cards === 'string' ? JSON.parse(data.cards) : data.cards

        setPoolData(poolInfo)
      } catch (err) {
        setError(err.message || 'Failed to load pool')
      } finally {
        setLoading(false)
      }
    }

    loadPool()
  }, [shareId])

  const packArtUrl = poolData?.setCode ? getPackArtUrl(poolData.setCode) : null

  if (loading) {
    return (
      <div className="pack-blitz-pool-page">
        <div className="loading"></div>
      </div>
    )
  }

  if (error || !poolData) {
    return (
      <div className="pack-blitz-pool-page">
        <div className="pack-blitz-pool-content">
          <div className="error-message">{error || 'Pool not found'}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="pack-blitz-pool-page">
      {packArtUrl && (
        <div className="set-art-header" style={{
          backgroundImage: `url("${packArtUrl}")`,
        }}></div>
      )}

      <div className="pack-blitz-pool-content">
        <div className="pack-blitz-header">
          <h1>Pack Blitz</h1>
          <p className="pool-type">{poolData.setName}</p>

          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push(`/formats/pack-blitz/${shareId}/play`)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
          </Button>
        </div>

        {/* Leaders & Bases - pack-details style containers, side by side */}
        <div className="leaders-bases-row">
          <div className="pack-details">
            <h2>Leaders</h2>
            <div className="cards-grid">
              {poolData.leaders.map((leader, index) => (
                <Card
                  key={`leader-${index}`}
                  card={{ ...leader, isLeader: true }}
                />
              ))}
            </div>
          </div>

          <div className="pack-details">
            <h2>Bases</h2>
            <div className="cards-grid">
              {poolData.bases.map((base, index) => (
                <Card
                  key={`base-${index}`}
                  card={{ ...base, isBase: true }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Hidden deck cards - pack-details style container */}
        <div className="pack-details">
          <h2>Your Deck ({poolData.packs?.reduce((total, pack) =>
            total + pack.filter(c => c.type !== 'Leader' && c.type !== 'Base').length
          , 0) || 0} Hidden Cards)</h2>
          <div className="cards-grid">
            {poolData.packs?.flatMap((pack, packIndex) =>
              pack.filter(c => c.type !== 'Leader' && c.type !== 'Base')
                .map((_, cardIndex) => (
                  <div key={`hidden-${packIndex}-${cardIndex}`} className="card-item">
                    <img src="/card-images/card-back.png" alt="Card back" className="card-back" />
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
