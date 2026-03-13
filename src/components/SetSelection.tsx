// @ts-nocheck
import { useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import './SetSelection.css'
import { fetchSets, isSetBeta, isSetPrerelease } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import Button from './Button'

interface SetData {
  code: string
  name: string
  imageUrl?: string
  prereleaseDate?: string
  releaseDate?: string
}

export interface SetSelectionProps {
  onSetSelect: (setCode: string) => void
  onBack?: () => void
  title?: string
  headerAction?: React.ReactNode
}

function SetSelection({ onSetSelect, onBack, title, headerAction }: SetSelectionProps) {
  const { user } = useAuth()
  const [sets, setSets] = useState<SetData[]>([])
  const [latestSets, setLatestSets] = useState<SetData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageFallbacks, setImageFallbacks] = useState<Record<string, number>>({})
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [isVertical, setIsVertical] = useState(false)

  // Check if user has beta access (beta tester or admin)
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Map set codes to their set numbers for sorting
  const getSetNumber = (setCode: string): number => {
    const setCodeMap: Record<string, number> = {
      'SOR': 1, // Spark of Rebellion
      'SHD': 2, // Shadows of the Galaxy
      'TWI': 3, // Twilight of the Republic
      'JTL': 4, // Jump to Lightspeed
      'LOF': 5, // Legends of the Force
      'SEC': 6, // Secrets of Power
      'LAW': 7, // A Lawless Time
      // Future sets will be 8, 9, 10, etc.
    }
    return setCodeMap[setCode] || 999 // Unknown sets go to end
  }

  // Sort sets in display order: [7, 8, 9, 4, 5, 6, 1, 2, 3]
  // This creates the layout: Row 1: [7, 8, 9] or [4, 5, 6], Row 2: [1, 2, 3]
  // When vertical (single column), sort in reverse set number order (6, 5, 4, 3, 2, 1)
  const sortSetsForDisplay = (sets: SetData[], vertical = false): SetData[] => {
    return [...sets].sort((a, b) => {
      const numA = getSetNumber(a.code)
      const numB = getSetNumber(b.code)

      // When vertical, reverse order by set number
      if (vertical) {
        return numB - numA // Reverse: highest number first
      }

      // Define display order: [7, 8, 9, 4, 5, 6, 1, 2, 3]
      // Future-proof: when 7, 8, 9 come out, they'll be at the top
      const displayOrder = [7, 8, 9, 4, 5, 6, 1, 2, 3]
      const indexA = displayOrder.indexOf(numA)
      const indexB = displayOrder.indexOf(numB)

      // If not in display order, put at end
      if (indexA === -1 && indexB === -1) return numA - numB
      if (indexA === -1) return 1
      if (indexB === -1) return -1

      return indexA - indexB
    })
  }

  // Check if we're in vertical (single column) mode
  useEffect(() => {
    const checkVertical = () => {
      setIsVertical(window.innerWidth <= 900)
    }

    checkVertical()
    window.addEventListener('resize', checkVertical)
    return () => window.removeEventListener('resize', checkVertical)
  }, [])

  const [rawSets, setRawSets] = useState<SetData[]>([])

  useEffect(() => {
    const loadSets = async () => {
      try {
        setLoading(true)
        const setsData = await fetchSets({ includeBeta: hasBetaAccess })
        const regular = setsData.filter((set: SetData) => getSetNumber(set.code) < 7)
        const latest = setsData.filter((set: SetData) => getSetNumber(set.code) >= 7)
        setRawSets(regular)
        setLatestSets(latest)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    loadSets()
  }, [hasBetaAccess])

  // Sort sets whenever rawSets or isVertical changes
  useEffect(() => {
    if (rawSets.length > 0) {
      const sortedSets = sortSetsForDisplay(rawSets, isVertical)
      setSets(sortedSets)
    }
  }, [rawSets, isVertical])

  if (loading) {
    return (
      <div className="set-selection">
        <div className="loading"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="set-selection">
        <div className="error">Error: {error}</div>
        <Button variant="back" onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  const handleImageError = (setCode: string, e: SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement
    // Try fallback URLs if primary pack art fails
    const fallbacks = [
      `https://swudb.com/images/packs/${setCode.toLowerCase()}.jpg`,
      `https://swudb.com/images/booster/${setCode}.jpg`,
      `https://swudb.com/images/sets/${setCode}.jpg`,
    ]

    const currentAttempt = imageFallbacks[setCode] || 0

    if (currentAttempt < fallbacks.length) {
      // Try next fallback URL
      target.src = fallbacks[currentAttempt]
      setImageFallbacks(prev => ({ ...prev, [setCode]: currentAttempt + 1 }))
    } else {
      // All fallbacks failed, mark as failed to show placeholder
      setFailedImages(prev => new Set([...prev, setCode]))
      target.style.display = 'none'
    }
  }

  return (
    <div className="set-selection">
      <div className="set-selection-header">
        <h1>{title || 'Select a Set'}</h1>
        {headerAction && <div className="set-selection-header-action">{headerAction}</div>}
      </div>
      {latestSets.length > 0 && (
        <div className="latest-sets-row">
          {latestSets.map((set) => {
            const beta = isSetBeta(set)
            const prerelease = isSetPrerelease(set)
            const badgeText = beta ? 'Beta' : prerelease ? 'Pre-Release' : null
            const cardClass = beta ? 'set-card--beta' : prerelease ? 'set-card--prerelease' : ''
            return (
              <div
                key={set.code}
                className={`set-card ${cardClass}`}
                onClick={() => onSetSelect(set.code)}
              >
                {badgeText && <div className="beta-badge">{badgeText}</div>}
                <div className="set-image-container">
                  {set.imageUrl && !failedImages.has(set.code) && (
                    <img
                      src={set.imageUrl}
                      alt={`${set.name} booster pack`}
                      className="set-image"
                      onError={(e) => handleImageError(set.code, e)}
                    />
                  )}
                  <div className="set-image-placeholder" style={{ display: (!set.imageUrl || failedImages.has(set.code)) ? 'flex' : 'none' }}>
                    <div className="placeholder-text">{set.name}</div>
                    <div className="placeholder-code">{set.code}</div>
                  </div>
                </div>
                <div className="set-info">
                  <h3>{set.name}</h3>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="sets-grid">
        {sets.map((set) => {
          const beta = isSetBeta(set)
          const prerelease = isSetPrerelease(set)
          const badgeText = beta ? 'Beta' : prerelease ? 'Pre-Release' : null
          const cardClass = beta ? 'set-card--beta' : prerelease ? 'set-card--prerelease' : ''
          return (
            <div
              key={set.code}
              className={`set-card ${cardClass}`}
              onClick={() => onSetSelect(set.code)}
            >
              {badgeText && <div className="beta-badge">{badgeText}</div>}
              <div className="set-image-container">
                {set.imageUrl && !failedImages.has(set.code) && (
                  <img
                    src={set.imageUrl}
                    alt={`${set.name} booster pack`}
                    className="set-image"
                    onError={(e) => handleImageError(set.code, e)}
                  />
                )}
                <div className="set-image-placeholder" style={{ display: (!set.imageUrl || failedImages.has(set.code)) ? 'flex' : 'none' }}>
                  <div className="placeholder-text">{set.name}</div>
                  <div className="placeholder-code">{set.code}</div>
                </div>
              </div>
              <div className="set-info">
                <h3>{set.name}</h3>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SetSelection
