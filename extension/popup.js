import { getSession, listNotebooks, signIn, signOut } from './api.js'
import { APP_URL } from './config.js'

const $ = (id) => document.getElementById(id)
const problem = (text) => {
  $('problem').textContent = text ? `Problem: ${text}` : ''
  $('problem').hidden = !text
}

let typing = false
async function show() {
  const session = await getSession()
  $('connect').hidden = Boolean(session) || typing
  $('signin').hidden = Boolean(session) || !typing
  $('signedin').hidden = !session
  if (session) {
    $('who').textContent = session.email || 'you'
    const { notebooks = [] } = await chrome.storage.local.get('notebooks')
    $('count').textContent = `${notebooks.length} ${notebooks.length === 1 ? 'notebook' : 'notebooks'} in the right-click menu.`
  }
}

$('signin').addEventListener('submit', async (e) => {
  e.preventDefault()
  problem('')
  $('go').disabled = true
  try {
    await signIn($('email').value.trim(), $('password').value)
    await listNotebooks()
    chrome.runtime.sendMessage('rebuild')
    await $('show').addEventListener('click', () => {
  const hidden = $('password').type === 'password'
  $('password').type = hidden ? 'text' : 'password'
  $('show').textContent = hidden ? 'Hide' : 'Show'
  $('show').setAttribute('aria-pressed', String(hidden))
})
show()
  } catch (err) {
    problem(err.message)
  } finally {
    $('go').disabled = false
  }
})
$('refresh').addEventListener('click', async () => {
  problem('')
  try {
    await listNotebooks()
    chrome.runtime.sendMessage('rebuild')
    await $('show').addEventListener('click', () => {
  const hidden = $('password').type === 'password'
  $('password').type = hidden ? 'text' : 'password'
  $('show').textContent = hidden ? 'Hide' : 'Show'
  $('show').setAttribute('aria-pressed', String(hidden))
})
show()
  } catch (err) {
    problem(err.message)
  }
})
$('open').addEventListener('click', () => chrome.tabs.create({ url: APP_URL }))
$('out').addEventListener('click', async () => {
  await signOut()
  chrome.runtime.sendMessage('rebuild')
  await $('show').addEventListener('click', () => {
  const hidden = $('password').type === 'password'
  $('password').type = hidden ? 'text' : 'password'
  $('show').textContent = hidden ? 'Hide' : 'Show'
  $('show').setAttribute('aria-pressed', String(hidden))
})
show()
})
$('show').addEventListener('click', () => {
  const hidden = $('password').type === 'password'
  $('password').type = hidden ? 'text' : 'password'
  $('show').textContent = hidden ? 'Hide' : 'Show'
  $('show').setAttribute('aria-pressed', String(hidden))
})
$('connectapp').addEventListener('click', () => {
  chrome.tabs.create({ url: `${APP_URL}?connect-extension=1` })
  window.close()
})
$('typeinstead').addEventListener('click', () => {
  typing = true
  show()
})
$('backconnect').addEventListener('click', () => {
  typing = false
  show()
})
// Signed in from the Better Keep website while this window was open.
chrome.storage.onChanged.addListener((changes) => changes.session && show())
$('version').textContent = `Version ${chrome.runtime.getManifest().version}`
show()
