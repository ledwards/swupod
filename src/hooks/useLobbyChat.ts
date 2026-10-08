// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ChatMessage, UseChatReturn } from './useChat'

interface UseLobbyOptions {
  enabled?: boolean
}

/**
 * Hook for lobby-wide chat via Socket.io + Discord channel persistence.
 * Mirrors #draft-now or #sealed-now Discord channels.
 *
 * @param lobbyType - 'draft' or 'sealed'
 * @param username - Current user's display name
 * @param avatarUrl - Current user's avatar URL
 * @param options - { enabled: boolean }
 */
export function useLobbyChat(
  lobbyType: 'draft' | 'sealed',
  username: string | null,
  avatarUrl: string | null,
  { enabled = true }: UseLobbyOptions = {}
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const isReadingRef = useRef(true)

  // Fetch chat history from Discord channel (last 10 messages)
  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/lobby/history?type=${lobbyType}&limit=10`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        const msgs = data.data?.messages || data.messages || []
        setMessages(msgs)
        setHistoryCount(msgs.length)
      }
    } catch (err) {
      console.error('[LobbyChat] Error fetching history:', err)
    } finally {
      setLoading(false)
    }
  }, [lobbyType])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    fetchHistory()

    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-lobby-chat', lobbyType)
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('lobby-chat:message', (message: ChatMessage) => {
      setMessages(prev => {
        // Deduplicate
        const isDupe = prev.length > 0 &&
          prev[prev.length - 1].text === message.text &&
          prev[prev.length - 1].username === message.username &&
          Math.abs(new Date(prev[prev.length - 1].timestamp).getTime() - new Date(message.timestamp).getTime()) < 2000
        if (isDupe) return prev
        return [...prev, message]
      })

      if (!isReadingRef.current) {
        setUnreadCount(prev => prev + 1)
      }
    })

    return () => {
      socket.emit('leave-lobby-chat', lobbyType)
      socket.disconnect()
    }
  }, [lobbyType, enabled, fetchHistory])

  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !username || !text.trim()) return
    socketRef.current.emit('lobby-chat:send', {
      lobbyType,
      text: text.trim(),
      username,
      avatarUrl,
    })
  }, [lobbyType, username, avatarUrl])

  const markRead = useCallback(() => {
    setUnreadCount(0)
    isReadingRef.current = true
  }, [])

  return {
    messages,
    sendMessage,
    connected,
    loading,
    unreadCount,
    markRead,
    historyCount,
  }
}

export default useLobbyChat
