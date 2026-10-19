// Local account manager for the demo database. Passwords are reset, never read.
import 'dotenv/config'
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import fs from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'))
fs.mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(path.join(dataDir, 'accounts.sqlite'))
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)
// Avoid readline raw-mode changes; they can fail in some Windows terminals.
const prompt = createInterface({ input, output, terminal: false })

const ask = (label) => prompt.question(label)
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
function printAccounts() {
  const accounts = db.prepare('SELECT id, name, email, created_at FROM users ORDER BY id').all()
  if (!accounts.length) return console.log('\nNo accounts found.')
  console.table(accounts)
}
async function addAccount() {
  const name = (await ask('Name (2–60 characters): ')).trim()
  const email = (await ask('Email: ')).trim().toLowerCase()
  const password = await ask('New password (8–128 characters; input is visible): ')
  if (name.length < 2 || name.length > 60) throw new Error('Name must be between 2 and 60 characters.')
  if (!validEmail(email) || email.length > 254) throw new Error('Enter a valid email address.')
  if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.')
  const hash = await bcrypt.hash(password, 12)
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash)
  console.log('Account added. The password was saved as a bcrypt hash.')
}
async function editAccount() {
  const id = Number(await ask('Account ID to edit: '))
  const account = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id)
  if (!account) throw new Error('No account has that ID.')
  console.log(`Current name: ${account.name}\nCurrent email: ${account.email}`)
  const nameInput = await ask('New name (press Enter to keep current): ')
  const emailInput = await ask('New email (press Enter to keep current): ')
  const name = nameInput.trim() || account.name
  const email = emailInput.trim().toLowerCase() || account.email
  if (name.length < 2 || name.length > 60) throw new Error('Name must be between 2 and 60 characters.')
  if (!validEmail(email) || email.length > 254) throw new Error('Enter a valid email address.')
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, id)
  console.log('Account updated.')
}
async function resetPassword() {
  const id = Number(await ask('Account ID for password reset: '))
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) throw new Error('No account has that ID.')
  const password = await ask('New password (8–128 characters; input is visible): ')
  if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.')
  const hash = await bcrypt.hash(password, 12)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
  // Remove this user's active sessions so the password change takes effect cleanly.
  const sessionsPath = path.join(dataDir, 'sessions.sqlite')
  if (fs.existsSync(sessionsPath)) {
    const sessions = new DatabaseSync(sessionsPath)
    sessions.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL)')
    const remove = sessions.prepare('DELETE FROM sessions WHERE sid = ?')
    for (const row of sessions.prepare('SELECT sid, sess FROM sessions').all()) {
      try { if (JSON.parse(row.sess).userId === id) remove.run(row.sid) } catch { /* Ignore malformed stale sessions. */ }
    }
    sessions.close()
  }
  console.log('Password reset. Existing sessions for this account were signed out.')
}
async function deleteAccount() {
  const id = Number(await ask('Account ID to delete: '))
  const account = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id)
  if (!account) throw new Error('No account has that ID.')
  const confirmation = await ask(`Delete ${account.email} permanently? Type DELETE to confirm: `)
  if (confirmation !== 'DELETE') return console.log('Cancelled.')
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  const sessionsPath = path.join(dataDir, 'sessions.sqlite')
  if (fs.existsSync(sessionsPath)) {
    const sessions = new DatabaseSync(sessionsPath)
    sessions.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL)')
    const remove = sessions.prepare('DELETE FROM sessions WHERE sid = ?')
    for (const row of sessions.prepare('SELECT sid, sess FROM sessions').all()) {
      try { if (JSON.parse(row.sess).userId === id) remove.run(row.sid) } catch { /* Ignore malformed stale sessions. */ }
    }
    sessions.close()
  }
  console.log('Account and its active sessions were deleted.')
}

try {
  console.log(`\nSQLite account manager\nDatabase: ${path.join(dataDir, 'accounts.sqlite')}\n`)
  console.log('1) List accounts\n2) Add account\n3) Edit name/email\n4) Reset password\n5) Delete account\n0) Exit')
  const choice = await ask('\nChoose an action: ')
  if (choice === '1') printAccounts()
  else if (choice === '2') await addAccount()
  else if (choice === '3') await editAccount()
  else if (choice === '4') await resetPassword()
  else if (choice === '5') await deleteAccount()
  else if (choice !== '0') console.log('Choose one of the listed options.')
} catch (error) {
  console.error(`\nCould not complete that action: ${error.message}`)
  process.exitCode = 1
} finally {
  prompt.close()
  db.close()
}
