// End-to-end auth smoke test using an isolated temporary SQLite directory.
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const testDir = await mkdtemp(path.join(tmpdir(), 'login-motion-smoke-'))
const accountEmail = `smoke-${Date.now()}@example.test`
const testPassword = 'smoke-test-password-123'
let serverProcess
let port

async function unusedPort() {
  const listener = createServer()
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const { port: freePort } = listener.address()
  await new Promise((resolve) => listener.close(resolve))
  return freePort
}

async function startServer() {
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      SESSION_SECRET: 'isolated-smoke-test-secret-that-is-over-32-characters',
      DATA_DIR: testDir,
    },
  })
  const address = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error('Test server exited before it became ready.')
    try {
      const response = await fetch(`${address}/api/session`)
      if (response.ok) return
    } catch { /* The server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not become ready in time.')
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return
  await new Promise((resolve) => {
    const timeout = setTimeout(() => { serverProcess.kill(); resolve() }, 1500)
    serverProcess.once('exit', () => { clearTimeout(timeout); resolve() })
    serverProcess.kill()
  })
}

let cookie = ''
async function request(route, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  return { status: response.status, data: await response.json() }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  port = await unusedPort()
  await startServer()

  const registration = { name: 'Smoke Test', email: accountEmail, password: testPassword, confirmPassword: 'different-password' }
  assert((await request('/api/register', { method: 'POST', body: registration })).status === 400, 'Mismatched confirmation should be rejected.')
  assert((await request('/api/register', { method: 'POST', body: { ...registration, password: 'short', confirmPassword: 'short' } })).status === 400, 'Short passwords should be rejected.')

  registration.confirmPassword = testPassword
  assert((await request('/api/register', { method: 'POST', body: registration })).status === 201, 'Valid registration should succeed.')
  assert((await request('/api/session')).data.user === null, 'Registration should return the user to sign-in without creating a session.')
  assert((await request('/api/register', { method: 'POST', body: registration })).status === 409, 'Duplicate emails should be rejected.')

  const db = new DatabaseSync(path.join(testDir, 'accounts.sqlite'))
  const saved = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(accountEmail)
  assert(saved?.password_hash.startsWith('$2'), 'Password should be stored as a bcrypt hash.')
  assert(saved.password_hash !== testPassword, 'Plaintext password must not be stored.')
  db.close()

  assert((await request('/api/login', { method: 'POST', body: { email: accountEmail, password: 'wrong-password' } })).status === 401, 'Incorrect password should be rejected.')
  assert((await request('/api/login', { method: 'POST', body: { email: accountEmail, password: testPassword } })).status === 200, 'Correct credentials should log in.')
  assert((await request('/api/session')).data.user?.email === accountEmail, 'Session should be readable after login and refresh.')

  await stopServer()
  await startServer()
  assert((await request('/api/session')).data.user?.email === accountEmail, 'Session should persist after the server restarts.')
  assert((await request('/api/logout', { method: 'POST' })).status === 200, 'Logout should succeed.')
  assert((await request('/api/session')).data.user === null, 'Logout should clear the session.')
  assert((await request('/api/login', { method: 'POST', body: { email: accountEmail, password: testPassword } })).status === 200, 'User should be able to log in again after logout.')

  console.log('Auth smoke test passed: validation, registration, bcrypt storage, login, refresh, server restart persistence, and logout.')
} catch (error) {
  console.error(`Auth smoke test failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await stopServer()
  await rm(testDir, { recursive: true, force: true })
}
