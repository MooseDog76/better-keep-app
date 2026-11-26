import { createNote, getSession, listNotebooks, noteFromClick, useSession } from './api.js'
import { APP_URL } from './config.js'

const CONTEXTS = ['page', 'selection', 'link', 'image']

// Builds the right-click menu: "Save to AbleMemo" with one entry per notebook, then "New notebook...".
async function buildMenus() {
  await chrome.contextMenus.removeAll()
  const session = await getSession()
  if (!session) {
    chrome.contextMenus.create({ id: 'signin', title: 'Save to AbleMemo: sign in first', contexts: CONTEXTS })
    return
  }
  chrome.contextMenus.create({ id: 'root', title: 'Save to AbleMemo', contexts: CONTEXTS })
  let notebooks = []
  try {
    notebooks = await listNotebooks()
  } catch {
    notebooks = (await chrome.storage.local.get('notebooks')).notebooks || []
  }
  for (const nb of notebooks) {
    chrome.contextMenus.create({ id: `nb:${nb.id}`, parentId: 'root', title: nb.name.replace(/&/g, '&&'), contexts: CONTEXTS })
  }
  if (notebooks.length) chrome.contextMenus.create({ id: 'sep', parentId: 'root', type: 'separator', contexts: CONTEXTS })
  chrome.contextMenus.create({ id: 'new', parentId: 'root', title: 'New notebook...', contexts: CONTEXTS })
}

let building = Promise.resolve()
const rebuild = () => (building = building.then(buildMenus, buildMenus))

function tell(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/128.png', title, message })
}

chrome.runtime.onInstalled.addListener(() => {
  rebuild()
  chrome.alarms.create('refresh', { periodInMinutes: 15 })
})
chrome.runtime.onStartup.addListener(rebuild)
chrome.alarms.onAlarm.addListener((a) => a.name === 'refresh' && rebuild())
chrome.runtime.onMessage.addListener((msg) => {
  if (msg === 'rebuild') rebuild()
})

async function onClick(info, tab) {
  const note = noteFromClick(info, tab)
  if (info.menuItemId === 'signin') {
    chrome.windows.create({ url: 'popup.html', type: 'popup', width: 420, height: 560 })
    return
  }
  if (info.menuItemId === 'new') {
    // A right-click menu cannot take typing, so a small box opens for the notebook's name.
    await chrome.storage.session.set({ pending: note })
    chrome.windows.create({ url: 'newnb.html', type: 'popup', width: 440, height: 360 })
    return
  }
  const id = String(info.menuItemId)
  if (!id.startsWith('nb:')) return
  const notebookId = id.slice(3)
  try {
    await createNote(notebookId, note)
    const { notebooks = [] } = await chrome.storage.local.get('notebooks')
    const name = notebooks.find((n) => n.id === notebookId)?.name || 'your notebook'
    tell('Saved to AbleMemo', `Saved in ${name}.`)
  } catch (err) {
    tell('Not saved', `${err.message} Nothing was lost on the page. Please try again.`)
  }
}
chrome.contextMenus.onClicked.addListener(onClick)

// The AbleMemo website can check the extension is here, and hand it a sign-in of its own.
// Chrome only delivers these from the website named in manifest.json; the address is checked again here.
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!sender.url || !sender.url.startsWith(APP_URL)) {
    reply({ ok: false, error: 'Not allowed.' })
    return false
  }
  ;(async () => {
    const version = chrome.runtime.getManifest().version
    if (msg?.type === 'ping') {
      const session = await getSession()
      return { ok: true, version, signedIn: Boolean(session), email: session?.email || '' }
    }
    if (msg?.type === 'connect') {
      await useSession(msg.session)
      await listNotebooks()
      await rebuild()
      return { ok: true, version }
    }
    return { ok: false, error: 'Unknown request.' }
  })()
    .then(reply)
    .catch((err) => reply({ ok: false, error: err.message }))
  return true
})

// For the automatic checks only: lets them press a menu entry and see the menu.
globalThis.__bk = { onClick, rebuild: () => rebuild(), building: () => building }
