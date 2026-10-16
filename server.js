import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const production = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 3000)
const databaseDir = path.resolve(process.env.DATA_DIR || path.join(here, 'data'))
fs.mkdirSync(databaseDir, { recursive: true })
const db = new DatabaseSync(path.join(databaseDir, 'accounts.sqlite'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON')
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`)

// Keep Express sessions in SQLite too, so login state survives server restarts.
class SQLiteSessionStore extends session.Store {
  constructor() {
    super()
    this.database = new DatabaseSync(path.join(databaseDir, 'sessions.sqlite'))
    this.database.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL)')
    this.database.prepare('DELETE FROM sessions WHERE expire <= ?').run(Date.now())
    this.read = this.database.prepare('SELECT sess, expire FROM sessions WHERE sid = ?')
    this.write = this.database.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire')
    this.remove = this.database.prepare('DELETE FROM sessions WHERE sid = ?')
  }
  get(id, callback) {
    try {
      const row = this.read.get(id)
      if (!row) return callback(null, null)
      if (row.expire <= Date.now()) { this.remove.run(id); return callback(null, null) }
      return callback(null, JSON.parse(row.sess))
    } catch (error) { return callback(error) }
  }
  set(id, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 7 * 86400000
      this.write.run(id, JSON.stringify(value), expires)
      return callback(null)
    } catch (error) { return callback(error) }
  }
  touch(id, value, callback = () => {}) { return this.set(id, value, callback) }
  destroy(id, callback = () => {}) {
    try { this.remove.run(id); return callback(null) } catch (error) { return callback(error) }
  }
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  if (production) throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters in production.')
  console.warn('SESSION_SECRET is missing or short; set a random secret in .env before deploying.')
}
if (production && process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'"] } } }))
app.use(express.json({ limit: '10kb' }))
app.use(session({
  name: 'formlab.sid',
  store: new SQLiteSessionStore(),
  secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 1000 * 60 * 60 * 24 * 7 },
}))

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function validateDetails({ name, email, password }) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) return 'Enter a name between 2 and 60 characters.'
  if (typeof email !== 'string' || email.length > 254 || !emailPattern.test(email.trim())) return 'Enter a valid email address.'
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return 'Password must be between 8 and 128 characters.'
  return null
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email } }
function asyncRoute(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next) }
function startSession(req, res, user) {
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Your account is ready, but a secure session could not be started. Please sign in.' })
    req.session.userId = user.id
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: 'Your account is ready, but the session could not be saved. Please sign in.' })
      return res.json({ user: publicUser(user) })
    })
  })
}

app.post('/api/register', asyncRoute(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body || {}
  const validation = validateDetails({ name, email, password })
  if (validation) return res.status(400).json({ error: validation })
  if (password !== confirmPassword) return res.status(400).json({ error: 'The passwords do not match.' })
  const normalizedEmail = email.trim().toLowerCase()
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' })
  const hash = await bcrypt.hash(password, 12)
  try {
    db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), normalizedEmail, hash)
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' })
    throw error
  }
  return res.status(201).json({ message: 'Account created. Sign in to continue.' })
}))

app.post('/api/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || !emailPattern.test(email.trim()) || typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'Enter a valid email and password.' })
  const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email.trim().toLowerCase())
  const matches = await bcrypt.compare(password, user?.password_hash || '$2a$12$invalidhashpaddingforconstanttimecheck000000000000000000000')
  if (!user || !matches) return res.status(401).json({ error: 'Email or password is incorrect.' })
  return startSession(req, res, user)
}))

app.get('/api/session', (req, res) => {
  const user = req.session.userId && db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.session.userId)
  res.json({ user: user ? publicUser(user) : null })
})
app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Could not sign out. Please try again.' })
    res.clearCookie('formlab.sid', { httpOnly: true, sameSite: 'lax', secure: production })
    return res.json({ message: 'Signed out.' })
  })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'That API endpoint was not found.' }))
const builtFiles = path.join(here, 'dist')
if (fs.existsSync(builtFiles)) {
  app.use(express.static(builtFiles, { index: false, maxAge: production ? '1d' : 0 }))
  app.get('*path', (_req, res) => res.sendFile(path.join(builtFiles, 'index.html')))
} else if (production) {
  console.error('Production build not found. Run npm run build before starting the production server.')
  process.exit(1)
}
app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'The server could not complete that request.' })
})
app.listen(port, () => console.log(`Form Lab listening on http://localhost:${port}`))
