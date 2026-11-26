import { createNote, createNotebook, listNotebooks } from './api.js'

const $ = (id) => document.getElementById(id)

$('cancel').addEventListener('click', async () => {
  await chrome.storage.session.remove('pending')
  window.close()
})

$('form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = $('name').value.trim()
  if (!name) return
  $('create').disabled = true
  $('problem').hidden = true
  try {
    const { pending } = await chrome.storage.session.get('pending')
    const notebook = await createNotebook(name)
    if (pending) await createNote(notebook.id, pending)
    await chrome.storage.session.remove('pending')
    await listNotebooks()
    chrome.runtime.sendMessage('rebuild')
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/128.png', title: 'Saved to AbleMemo', message: `Saved in your new notebook ${name}.` })
    window.close()
  } catch (err) {
    $('problem').textContent = `Problem: ${err.message}`
    $('problem').hidden = false
    $('create').disabled = false
  }
})
