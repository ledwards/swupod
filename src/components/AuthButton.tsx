// @ts-nocheck
// Authentication button component
import { useAuth } from '../contexts/AuthContext'
import UserAvatar from './UserAvatar'
import './AuthButton.css'
import Button from './Button'

export default function AuthButton() {
  const { user, loading, signIn, signOut, isPatron } = useAuth()

  if (loading) {
    return (
      <div className="auth-button loading">
        <span></span>
      </div>
    )
  }

  if (user) {
    return (
      <div className="auth-button authenticated">
        <span className="user-info">
          {user.avatar_url && (
            <UserAvatar
              src={user.avatar_url}
              alt={user.username}
              className="user-avatar"
              isPatron={isPatron}
              size={32}
            />
          )}
          <span className="username">{user.username || user.email}</span>
        </span>
        <Button variant="secondary" size="sm" onClick={signOut} className="sign-out-button">
          Sign Out
        </Button>
      </div>
    )
  }

  return (
    <div className="auth-button">
      <Button variant="discord" onClick={signIn} className="sign-in-button">
        Sign in with Discord
      </Button>
    </div>
  )
}
