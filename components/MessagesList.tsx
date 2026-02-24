import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../services/supabaseClient'
import getSignedUrls from '../services/mediaService'

type Message = {
  id: string
  conversation_id: string
  sender_id?: string
  text?: string | null
  type?: string
  media_url?: string | null
  media_path?: string | null
  media_mime_type?: string | null
  media_size?: number | null
  created_at?: string | null
  author_name?: string | null
}

type Props = {
  conversationId: string
}

// Simple in-memory cache for signed URLs per session
const signedUrlCache: Record<string, { url: string; expiresAt: number }> = {}

export const MessagesList: React.FC<Props> = ({ conversationId }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    loadMessages()
    return () => { mounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  async function loadMessages() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from<Message>('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!mounted.current) return
      setMessages(data || [])
      // Pre-fetch signed URLs for any message missing media_url
      const missing = (data || []).filter(m => !m.media_url && m.media_path).map(m => m.media_path!)
      if (missing.length) await fetchSignedForPaths(missing)
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'Error loading messages')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  async function fetchSignedForPaths(paths: string[]) {
    // only request those not in cache
    const toRequest = paths.filter(p => {
      const cached = signedUrlCache[p]
      return !cached || cached.expiresAt < Date.now()
    })
    if (toRequest.length === 0) return

    try {
      const signed = await getSignedUrls(toRequest, 3600)
      // update cache
      const now = Date.now()
      const ttl = 3600 * 1000
      for (const p of Object.keys(signed)) {
        if (signed[p]) signedUrlCache[p] = { url: signed[p], expiresAt: now + ttl }
      }
      // update messages state to include media_url where applicable
      setMessages(prev => prev.map(m => ({ ...m, media_url: m.media_url || (m.media_path ? signedUrlCache[m.media_path!]?.url || null : m.media_url) })))
    } catch (e) {
      console.error('Failed to get signed urls', e)
    }
  }

  const renderMedia = (m: Message) => {
    const url = m.media_url || (m.media_path ? signedUrlCache[m.media_path!]?.url : null)
    const type = (m.type || 'text').toLowerCase()

    if (!url) return <div className="media-fallback">{m.text || 'Sin contenido multimedia'}</div>

    if (type === 'image') return <img src={url} alt={m.text || 'Imagen'} style={{ maxWidth: '100%', height: 'auto' }} />
    if (type === 'audio') return <audio controls src={url} aria-label={m.text || 'Audio'} />
    if (type === 'video') return <video controls src={url} style={{ maxWidth: '100%' }} />
    if (type === 'document') return <a href={url} download aria-label={`Descargar ${m.media_mime_type || 'archivo'}`}>Descargar</a>

    return <a href={url}>{m.text || 'Abrir archivo'}</a>
  }

  if (loading) return <div role="status">Cargando mensajes…</div>
  if (error) return <div role="alert">Error: {error}</div>

  return (
    <ul aria-live="polite" style={{ listStyle: 'none', padding: 0 }}>
      {messages.map(m => (
        <li key={m.id} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#666' }}>{m.author_name} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>
          {m.type === 'text' || !m.type ? (
            <div>{m.text}</div>
          ) : (
            <div>{renderMedia(m)}</div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default MessagesList
