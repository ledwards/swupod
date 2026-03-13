// @ts-nocheck
/**
 * UserAvatar Component
 *
 * Renders a user avatar with an optional gold "Friend of the Pod" frame
 * around the circular avatar. Used everywhere an avatar is displayed.
 */

import './UserAvatar.css'

export interface UserAvatarProps {
  src?: string | null
  alt?: string
  className?: string
  isPatron?: boolean
  /** Avatar diameter in pixels. */
  size: number
  /** Fallback letter when no avatar image (first char of username) */
  fallback?: string
  /** Additional class for the placeholder style */
  placeholderClassName?: string
}

export default function UserAvatar({
  src,
  alt = 'User',
  className = '',
  isPatron = false,
  size,
  fallback = 'U',
  placeholderClassName = '',
}: UserAvatarProps) {
  return (
    <span
      className={`user-avatar-wrapper ${isPatron ? 'user-avatar-patron' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="user-avatar-img" />
      ) : (
        <span className={`user-avatar-placeholder ${placeholderClassName}`}>
          {fallback}
        </span>
      )}
      {isPatron && (
        <img
          src="/icons/friend-of-the-pod.png"
          alt="Friend of the Pod"
          className="user-avatar-badge"
        />
      )}
    </span>
  )
}
