// React hook around the chatMessages stream + the aiChat callable.
// Tier-aware: it reads `options` (models, autoRoute, priority) once per
// send and passes them through to the Cloud Function so the server can
// pick the right model. Optimistic user message → stream-driven dedup,
// same as before.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { subscribeChatMessages, sendAiMessage } from './aiChat.js'

const friendlyError = (e) => {
  const code = e?.code || ''
  if (code.includes('resource-exhausted')) return 'AI query limit reached. Upgrade your plan for more queries.'
  if (code.includes('unauthenticated'))   return 'Sign in again to continue chatting.'
  if (code.includes('permission-denied')) return 'Your current plan does not include AI chat. Upgrade to use this feature.'
  if (code.includes('not-found'))         return 'Session not found.'
  if (code.includes('unavailable'))       return 'AI service is unavailable. Please try again.'
  return e?.message || 'Could not send message. Try again.'
}

export const useAiChat = (sessionId, options = {}) => {
  const [streamMessages, setStreamMessages] = useState([])
  const [optimistic, setOptimistic]         = useState([])  // local-only placeholders
  const [isLoading, setIsLoading]           = useState(false)
  const [error, setError]                   = useState(null)
  const [queriesUsed, setQueriesUsed]       = useState(0)
  const [queryLimit, setQueryLimit]         = useState(-1)
  const [lastModelUsed, setLastModelUsed]   = useState(null)

  useEffect(() => {
    if (!sessionId) { setStreamMessages([]); return }
    const unsub = subscribeChatMessages(
      sessionId,
      (list) => setStreamMessages(list),
      (err)  => console.error('[useAiChat] stream error', err),
    )
    return unsub
  }, [sessionId])

  // Drop any optimistic message that the stream has now confirmed
  // (matched by role + content). Only updates when streamMessages changes,
  // so it can't loop on its own writes.
  useEffect(() => {
    setOptimistic(prev => {
      if (prev.length === 0) return prev
      const filtered = prev.filter(o =>
        !streamMessages.some(r => r.role === o.role && r.content === o.content),
      )
      return filtered.length === prev.length ? prev : filtered
    })
  }, [streamMessages])

  const messages = useMemo(
    () => [...streamMessages, ...optimistic],
    [streamMessages, optimistic],
  )

  const isAtLimit = queryLimit > 0 && queriesUsed >= queryLimit

  const sendMessage = useCallback(async (text) => {
    const message = (text || '').trim()
    if (!message || !sessionId) return
    if (isAtLimit) {
      setError('AI query limit reached. Upgrade your plan for more queries.')
      return
    }

    setError(null)
    setIsLoading(true)

    const optimisticMsg = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: message,
      referencedTimestamps: [],
      createdAt: new Date(),
      _optimistic: true,
    }
    setOptimistic(prev => [...prev, optimisticMsg])

    try {
      const usage = await sendAiMessage({
        sessionId,
        message,
        options: {
          models:    options.models,
          autoRoute: options.autoRoute,
          priority:  options.priority,
        },
      })
      setQueriesUsed(usage.queriesUsed)
      setQueryLimit(usage.queryLimit)
      setLastModelUsed(usage.modelUsed)
    } catch (e) {
      console.error('[useAiChat] sendMessage failed', e)
      setOptimistic(prev => prev.filter(m => m.id !== optimisticMsg.id))
      setError(friendlyError(e))
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, isAtLimit, options.models, options.autoRoute, options.priority])

  return {
    messages,
    isLoading,
    error,
    queriesUsed,
    queryLimit,
    isAtLimit,
    lastModelUsed,
    sendMessage,
    clearError: () => setError(null),
  }
}
