// Small API client. Authentication state always comes from the server session;
// this module deliberately does not save accounts, passwords, or session tokens.
// Checkpoints 07–09: safe JSON helpers are reserved for non-sensitive UI
// preferences only. Authentication never calls these browser-storage helpers.
function writePreference(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
function readPreference(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}
function removePreference(key) {
  try { localStorage.removeItem(key); return true } catch { return false }
}

async function request(path, options = {}) {
  let response
  const { headers = {}, ...requestOptions } = options
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...requestOptions,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result
}

export const getSession = () => request('/session')
export const register = (details) => request('/register', { method: 'POST', body: JSON.stringify(details) })
export const login = (credentials) => request('/login', { method: 'POST', body: JSON.stringify(credentials) })
export const logout = () => request('/logout', { method: 'POST' })
