'use client'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import './pod-review-button.css'

export const StarIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>

/** Friends of the Pod (or an admin): the viewer can run a draft review for pods they host. */
export function useFriendOfThePod(): boolean {
  const { user, isPatron } = useAuth() as { user: { is_admin?: boolean } | null; isPatron: boolean | null }
  return isPatron === true || user?.is_admin === true
}

/**
 * The one link to a draft's review (its slideshow page), gold like every Friends
 * of the Pod perk. Callers decide whether the pod has a review (its host is a
 * Friend of the Pod). `icon` is the star alone, for rows where a label would wrap.
 */
export default function DraftReviewButton({ shareId, icon = false, className = '' }: { shareId: string; icon?: boolean; className?: string }) {
  const label = 'Draft Review'
  return <Link className={`pod-review-btn${icon ? ' is-icon' : ''}${className ? ` ${className}` : ''}`} aria-label={label} title={label}
    href={`/draft/${encodeURIComponent(shareId)}/review`}>
    <StarIcon/>{!icon && <span>{label}</span>}
  </Link>
}
