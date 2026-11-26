// Talks to your AbleMemo database. The same privacy rules apply as in the app:
// once signed in, the extension can only see and add your own notebooks and notes.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'

const base = { apikey: SUPABASE_KEY, 'content-type': 'application/json' }

async function call(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...base, ...(options.headers || {}) } })
  const text = await r.text()
  const body = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error(body?.msg || body?.message || body?.error_description || `Error ${r.status}`)
  return body
}

async function keep(session) {
  const s = { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at || Math.floor(Date.now() / 1000) + session.expires_in, email: session.user?.email }
  await chrome.storage.local.set({ session: s })
  return s
}

export async function signIn(email, password) {
  return keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }))
}

// A sign-in handed over by the AbleMemo website (Settings, Connect the Chrome extension).
export async function useSession(session) {
  if (!session?.access_token || !session?.refresh_token) throw new Error('That sign-in was not complete.')
  return keep(session)
}

export async function signOut() {
  await chrome.storage.local.remove(['session', 'notebooks'])
}

export async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  if (!session) return null
  if (session.expires_at - 60 > Date.now() / 1000) return session
  try {
    return await keep(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }))
  } catch {
    await signOut()
    return null
  }
}

async function authed(path, options = {}) {
  const session = await getSession()
  if (!session) throw new Error('Please sign in to AbleMemo first. Click the AbleMemo button in the Chrome toolbar.')
  return call(path, { ...options, headers: { authorization: `Bearer ${session.access_token}`, prefer: 'return=representation', ...(options.headers || {}) } })
}

export async function listNotebooks() {
  const list = await authed('/rest/v1/notebooks?select=id,name,colour,position&order=position.asc')
  await chrome.storage.local.set({ notebooks: list })
  return list
}

export async function createNotebook(name) {
  const list = await listNotebooks()
  const position = list.reduce((max, n) => Math.max(max, n.position), -1) + 1
  const [row] = await authed('/rest/v1/notebooks', { method: 'POST', body: JSON.stringify({ name, colour: 'green', position }) })
  return row
}

export async function createNote(notebookId, note) {
  const [row] = await authed('/rest/v1/notes', { method: 'POST', body: JSON.stringify({ notebook_id: notebookId, title: note.title, body: note.body }) })
  return row
}

// What gets saved depends on what was right-clicked.
export function noteFromClick(info, tab) {
  const pageTitle = (tab?.title || '').trim()
  const pageUrl = info.pageUrl || tab?.url || ''
  const lines = []
  let title = pageTitle
  if (info.selectionText) {
    lines.push(info.selectionText.trim())
  }
  if (info.mediaType === 'image' && info.srcUrl) {
    title = pageTitle ? `Image from ${pageTitle}` : 'Image'
    lines.push(`Image: ${info.srcUrl}`)
  } else if (info.linkUrl) {
    title = (info.linkText || info.selectionText || '').trim().slice(0, 120) || pageTitle
    lines.push(`Link: ${info.linkUrl}`)
  }
  lines.push(`Saved from: ${pageUrl}`)
  return { title: title.slice(0, 300), body: lines.join('\n\n') }
}
