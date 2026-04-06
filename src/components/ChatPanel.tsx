// @ts-nocheck
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useChat, type ChatMessage } from '../hooks/useChat'
import { useLobbyChat } from '../hooks/useLobbyChat'
import { useAuth } from '../contexts/AuthContext'
import Button from './Button'
import './ChatPanel.css'

interface ChatPanelProps {
  shareId?: string | null
  lobbyType?: 'draft' | 'sealed'
  enabled?: boolean
  defaultOpen?: boolean
  onMakePublic?: () => void
  isHost?: boolean
  isPublic?: boolean
}

/**
 * Chat panel component that supports two modes:
 * 1. Pod chat (shareId) — syncs with a pod's Discord thread
 * 2. Lobby chat (lobbyType) — mirrors #draft-now or #sealed-now Discord channel
 */
export function ChatPanel({ shareId, lobbyType, enabled = true, defaultOpen = true, onMakePublic, isHost = false, isPublic: isPublicProp }: ChatPanelProps) {
  const { user } = useAuth()
  const [isMobile, setIsMobile] = useState(false)
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return false
    if (typeof window !== 'undefined') {
      // If user has explicitly toggled chat this session, respect their choice
      const userToggled = sessionStorage.getItem('chatUserToggled')
      if (userToggled === 'true') {
        const stored = sessionStorage.getItem('chatPanelOpen')
        if (stored !== null) return stored === 'true'
      }
    }
    return defaultOpen
  })
  const hasAutoOpened = useRef(false)
  const [dismissedPrivateNotice, setDismissedPrivateNotice] = useState(false)
  const [dismissedJoinNotice, setDismissedJoinNotice] = useState(false)
  const [isGuildMember, setIsGuildMember] = useState<boolean | null>(null)
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLobbyMode = !!lobbyType
  const isPodMode = !!shareId && !isLobbyMode

  // Pod chat hook (only active when shareId is provided and not in lobby mode)
  const podChat = useChat(
    isPodMode ? shareId : null,
    user?.username || null,
    user?.avatar_url || null,
    { enabled: enabled && isPodMode }
  )

  // Lobby chat hook (only active when lobbyType is provided)
  const lobbyChat = useLobbyChat(
    lobbyType || 'draft',
    user?.username || null,
    user?.avatar_url || null,
    { enabled: enabled && isLobbyMode }
  )

  // Use the appropriate chat based on mode
  const chat = isLobbyMode ? lobbyChat : podChat
  const { messages, sendMessage, connected, loading, unreadCount, markRead, historyCount } = chat
  const isPublic = isPublicProp ?? (isPodMode ? (podChat as ReturnType<typeof useChat>).isPublic : true)
  const discordThreadUrl = isPodMode ? (podChat as ReturnType<typeof useChat>).discordThreadUrl : null

  const chatTitle = isLobbyMode
    ? (lobbyType === 'sealed' ? '#sealed-now' : '#draft-now')
    : `Pod Chat (${isPublic ? 'public' : 'private'})`

  // Detect mobile + auto-open lobby chat on desktop (only if user hasn't explicitly toggled)
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (!mobile && !hasAutoOpened.current && defaultOpen) {
        const userToggled = sessionStorage.getItem('chatUserToggled')
        if (userToggled !== 'true') {
          setIsOpen(true)
        }
        hasAutoOpened.current = true
      }
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [lobbyType])

  // Check guild membership (only for authenticated users, to show join nudge)
  useEffect(() => {
    if (!user) {
      setIsGuildMember(null)
      return
    }
    fetch('/api/auth/discord-member', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setIsGuildMember(data?.data?.isMember ?? false))
      .catch(() => setIsGuildMember(null))
  }, [user])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Mark read when panel opens
  useEffect(() => {
    if (isOpen) {
      markRead()
    }
  }, [isOpen, markRead])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    sessionStorage.setItem('chatUserToggled', 'true')
    sessionStorage.setItem('chatPanelOpen', 'true')
    markRead()
    // Focus input after animation
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [markRead])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    sessionStorage.setItem('chatUserToggled', 'true')
    sessionStorage.setItem('chatPanelOpen', 'false')
  }, [])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return
    sendMessage(text)
    setInputText('')
    inputRef.current?.focus()
  }, [inputText, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Need either shareId or lobbyType to render
  if (!shareId && !lobbyType) return null
  if (!enabled) return null

  const isAuthenticated = !!user
  const needsAuth = !isAuthenticated

  // Mobile: floating chat button + full-screen overlay
  if (isMobile) {
    return (
      <>
        {/* Floating chat button */}
        <button
          className={`chat-fab ${unreadCount > 0 ? 'has-unread' : ''}`}
          onClick={handleOpen}
          aria-label="Open chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {unreadCount > 0 && (
            <span className="chat-fab-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>

        {/* Full-screen overlay */}
        {isOpen && (
          <div className="chat-overlay" onClick={handleClose}>
            <div className="chat-overlay-content" onClick={(e) => e.stopPropagation()}>
            <div className="chat-overlay-header">
              <Button variant="chrome" onClick={handleClose} aria-label="Close chat">&times;</Button>
              <div className="chat-panel-header-left">
                <h3>{chatTitle}</h3>
                {discordThreadUrl && (
                  <a href={discordThreadUrl} target="_blank" rel="noopener noreferrer" className="chat-discord-thread-link">
                    Chat on Discord
                  </a>
                )}
              </div>
            </div>
            <ChatContent
              messages={messages}
              loading={loading}
              connected={connected}
              needsAuth={needsAuth}

              inputText={inputText}
              setInputText={setInputText}
              handleSend={handleSend}
              handleKeyDown={handleKeyDown}
              messagesEndRef={messagesEndRef}
              inputRef={inputRef}
              isAuthenticated={isAuthenticated}
              isLobbyMode={isLobbyMode}
              historyCount={historyCount}
              isPublic={isPublic}
              isHost={isHost}
              onMakePublic={onMakePublic}
              discordThreadUrl={discordThreadUrl}
              dismissedPrivateNotice={dismissedPrivateNotice}
              setDismissedPrivateNotice={setDismissedPrivateNotice}
              showJoinDiscord={isAuthenticated && isGuildMember === false}
              dismissedJoinNotice={dismissedJoinNotice}
              setDismissedJoinNotice={setDismissedJoinNotice}
            />
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop: side panel
  return (
    <div className={`chat-panel ${isOpen ? 'open' : 'closed'}`}>
      {/* Toggle tab — top-aligned, arrow flips with open/close */}
      <button
        className={`chat-panel-toggle ${isOpen ? 'toggle-open' : ''} ${!isOpen && unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        <span className="chat-toggle-arrow">{isOpen ? '›' : '‹'}</span>
        {!isOpen && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {!isOpen && unreadCount > 0 && (
          <span className="chat-toggle-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="chat-panel-header">
            <div className="chat-panel-header-left">
              {connected && <span className="chat-status-dot" />}
              <h3>{chatTitle}</h3>
              {discordThreadUrl && (
                <a href={discordThreadUrl} target="_blank" rel="noopener noreferrer" className="chat-discord-thread-link">
                  Chat on Discord
                </a>
              )}
            </div>
            <button className="chat-collapse-btn" onClick={handleClose} aria-label="Collapse chat">
              <span>›</span>
            </button>
          </div>
          <ChatContent
            messages={messages}
            loading={loading}
            connected={connected}
            needsAuth={needsAuth}
            inputText={inputText}
            setInputText={setInputText}
            handleSend={handleSend}
            handleKeyDown={handleKeyDown}
            messagesEndRef={messagesEndRef}
            inputRef={inputRef}
            isAuthenticated={isAuthenticated}
            isLobbyMode={isLobbyMode}
            historyCount={historyCount}
            isPublic={isPublic}
            isHost={isHost}
            onMakePublic={onMakePublic}
            discordThreadUrl={discordThreadUrl}
            dismissedPrivateNotice={dismissedPrivateNotice}
            setDismissedPrivateNotice={setDismissedPrivateNotice}
            showJoinDiscord={isAuthenticated && isGuildMember === false}
            dismissedJoinNotice={dismissedJoinNotice}
            setDismissedJoinNotice={setDismissedJoinNotice}
          />
        </>
      )}
    </div>
  )
}

// Shared chat content between mobile overlay and desktop panel
function ChatContent({
  messages,
  loading,
  connected,
  needsAuth,
  inputText,
  setInputText,
  handleSend,
  handleKeyDown,
  messagesEndRef,
  inputRef,
  isAuthenticated,
  isLobbyMode,
  historyCount,
  isPublic = true,
  isHost = false,
  onMakePublic,
  discordThreadUrl,
  dismissedPrivateNotice = false,
  setDismissedPrivateNotice,
  showJoinDiscord = false,
  dismissedJoinNotice = false,
  setDismissedJoinNotice,
}: {
  messages: ChatMessage[]
  loading: boolean
  connected: boolean
  needsAuth: boolean
  inputText: string
  setInputText: (text: string) => void
  handleSend: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
  inputRef: React.RefObject<HTMLInputElement>
  isAuthenticated: boolean
  isLobbyMode: boolean
  historyCount: number
  isPublic?: boolean
  isHost?: boolean
  onMakePublic?: () => void
  discordThreadUrl?: string | null
  dismissedPrivateNotice?: boolean
  setDismissedPrivateNotice?: (v: boolean) => void
  showJoinDiscord?: boolean
  dismissedJoinNotice?: boolean
  setDismissedJoinNotice?: (v: boolean) => void
}) {
  return (
    <>
      {showJoinDiscord && !dismissedJoinNotice && (
        <div className="chat-private-notice">
          <button className="chat-private-notice-dismiss" onClick={() => setDismissedJoinNotice?.(true)} aria-label="Dismiss">&times;</button>
          <p>Join our Discord server to get the most out of pod chat.</p>
          <Button
            variant="discord"
            size="sm"
            onClick={() => window.open(process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF', '_blank')}
          >
            Join Discord Server
          </Button>
        </div>
      )}
      {!isPublic && !isLobbyMode && isHost && !dismissedPrivateNotice && (
        <div className="chat-private-notice">
          <button className="chat-private-notice-dismiss" onClick={() => setDismissedPrivateNotice?.(true)} aria-label="Dismiss">&times;</button>
          <p>Private pods do not store chat history.</p>
          <p>Messages are live only.</p>
          {onMakePublic && (
            <Button variant="primary" size="sm" onClick={() => { onMakePublic(); setDismissedPrivateNotice?.(true) }}>
              Make Pod Public
            </Button>
          )}
        </div>
      )}
      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            {discordThreadUrl ? (
              <>
                <p>A <a href={discordThreadUrl} target="_blank" rel="noopener noreferrer" className="chat-empty-link">Discord thread</a> has been created for this pod.</p>
                <p>Messages sync between here and Discord. Use Discord to coordinate with your pod and find opponents!</p>
              </>
            ) : (
              'No messages yet. Say hello!'
            )}
          </div>
        ) : (
          <>
            {messages.slice(0, historyCount || messages.length).map((msg, i) => (
              <ChatMessageItem key={`${msg.timestamp}-${i}`} message={msg} />
            ))}
            {(historyCount > 0 || messages.length > 0) && (
              <hr className="chat-history-divider" />
            )}
            {historyCount > 0 && messages.slice(historyCount).map((msg, i) => (
              <ChatMessageItem key={`live-${msg.timestamp}-${i}`} message={msg} />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        {needsAuth ? (
          <Button
            variant="discord"
            onClick={() => {
              window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(window.location.pathname)}`
            }}
          >
            Log in to chat
          </Button>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder={connected ? 'Type a message...' : 'Connecting...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected}
              maxLength={500}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!connected || !inputText.trim()}
            >
              Send
            </Button>
          </>
        )}
      </div>
    </>
  )
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today at ${time}`
  if (isYesterday) return `Yesterday at ${time}`
  return `${date.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' })} ${time}`
}

function renderLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="chat-link">{part}</a>
      : part
  )
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : renderLinks(part))
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
  const { isSystem, username, avatarUrl, text, source, timestamp } = message

  if (isSystem) {
    return (
      <div className="chat-message chat-message-system">
        <span className="chat-message-text">{renderBold(text)}</span>
      </div>
    )
  }

  return (
    <div className="chat-message">
      <div className="chat-message-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="chat-avatar-img" />
        ) : (
          <div className="chat-avatar-placeholder">{username?.[0]?.toUpperCase() || '?'}</div>
        )}
      </div>
      <div className="chat-message-body">
        <div className="chat-message-meta">
          <span className="chat-message-username">{username}</span>
          {source === 'discord' && (
            <span className="chat-discord-badge" title="From Discord">
              <svg width="12" height="9" viewBox="0 0 24 18" fill="#5865F2">
                <path d="M20.317 1.492a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 1.492a.07.07 0 0 0-.032.027C.533 6.168-.32 10.702.099 15.179a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
            </span>
          )}
          <span className="chat-message-timestamp">{formatTimestamp(timestamp)}</span>
        </div>
        <div className="chat-message-text">{renderLinks(text)}</div>
      </div>
    </div>
  )
}

export default ChatPanel
