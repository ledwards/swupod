// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export interface ChatMessage {
  username: string
  avatarUrl: string | null
  text: string
  timestamp: string
  isSystem: boolean
  source?: 'discord'
}

interface UseChatOptions {
  enabled?: boolean
}

export interface UseChatReturn {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
  connected: boolean
  loading: boolean
  unreadCount: number
  markRead: () => void
  historyCount: number
  isPublic: boolean
  discordThreadUrl: string | null
}

/**
 * Hook for real-time pod chat via Socket.io + Discord thread persistence.
 *
 * @param shareId - Pod share ID
 * @param username - Current user's display name
 * @param avatarUrl - Current user's avatar URL
 * @param options - { enabled: boolean }
 */
export function useChat(
  shareId: string | null,
  username: string | null,
  avatarUrl: string | null,
  { enabled = true }: UseChatOptions = {}
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [isPublic, setIsPublic] = useState(true)
  const [discordThreadUrl, setDiscordThreadUrl] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const isReadingRef = useRef(true) // true = user is viewing chat, false = panel collapsed

  // Fetch chat history from Discord thread
  const fetchHistory = useCallback(async () => {
    if (!shareId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/pods/${shareId}/chat/history`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        const inner = data.data || data
        const msgs = inner.messages || []
        setMessages(msgs)
        setHistoryCount(msgs.length)
        if (typeof inner.isPublic === 'boolean') {
          setIsPublic(inner.isPublic)
        }
        if (inner.discordThreadUrl) {
          setDiscordThreadUrl(inner.discordThreadUrl)
        }
      } else if (res.status !== 401 && res.status !== 403) {
        // 401/403 are expected when logged out or not a chat participant — stay quiet
        // (otherwise the dev error overlay pops for every logged-out viewer).
        console.error('[Chat] History fetch failed:', res.status, await res.text().catch(() => ''))
      }
    } catch (err) {
      console.error('[Chat] Error fetching history:', err)
    } finally {
      setLoading(false)
    }
  }, [shareId])

  useEffect(() => {
    if (!shareId || !enabled) {
      setLoading(false)
      return
    }

    // Load initial history
    fetchHistory()

    // Connect to Socket.io for real-time messages
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-chat', shareId)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('chat:message', (message: ChatMessage) => {
      setMessages(prev => {
        // Deduplicate: avoid adding the same message that we just sent
        // (since the server broadcasts back to all clients including sender)
        const isDupe = prev.length > 0 &&
          prev[prev.length - 1].text === message.text &&
          prev[prev.length - 1].username === message.username &&
          Math.abs(new Date(prev[prev.length - 1].timestamp).getTime() - new Date(message.timestamp).getTime()) < 2000
        if (isDupe) return prev
        return [...prev, message]
      })

      // Increment unread if user is not actively reading
      if (!isReadingRef.current) {
        setUnreadCount(prev => prev + 1)
      }
    })

    return () => {
      socket.emit('leave-chat', shareId)
      socket.disconnect()
    }
  }, [shareId, enabled, fetchHistory])

  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !shareId || !username || !text.trim()) return
    socketRef.current.emit('chat:send', {
      shareId,
      text: text.trim(),
      username,
      avatarUrl,
    })
  }, [shareId, username, avatarUrl])

  const markRead = useCallback(() => {
    setUnreadCount(0)
    isReadingRef.current = true
  }, [])

  // Expose a way to toggle reading state (for when panel is collapsed)
  const setReading = useCallback((reading: boolean) => {
    isReadingRef.current = reading
    if (reading) {
      setUnreadCount(0)
    }
  }, [])

  return {
    messages,
    sendMessage,
    connected,
    loading,
    unreadCount,
    markRead,
    historyCount,
    isPublic,
    discordThreadUrl,
  }
}

export default useChat
