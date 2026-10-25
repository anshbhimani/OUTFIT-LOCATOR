// Create or reset a login. Run with the production env pulled locally:
//   npx vercel env pull .env.local
//   npm run create-user -- <username> "<Display name>"
// The password is asked for interactively (not stored in shell history).
// Resetting an existing user's password also signs them out on every phone.
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { hashPassword } from '../api/_lib/auth.js'
import { ensureSchema, getSql } from '../api/_lib/db.js'

const [username, displayName] = process.argv.slice(2)
if (!username) {
  console.error('Usage: npm run create-user -- <username> "<Display name>"')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const password = process.env.NEW_PASSWORD ?? (await rl.question('Password (min 6 characters): '))
rl.close()
if (password.length < 6) {
  console.error('Password must be at least 6 characters.')
  process.exit(1)
}

await ensureSchema()
const sql = getSql()
const name = username.trim().toLowerCase()
const hash = await hashPassword(password)
const [row] = await sql`
  INSERT INTO users (id, username, display_name, password_hash)
  VALUES (${randomUUID()}, ${name}, ${displayName ?? name}, ${hash})
  ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        display_name = COALESCE(${displayName ?? null}, users.display_name),
        session_version = users.session_version + 1,
        failed_logins = 0, locked_until = NULL
  RETURNING (xmax = 0) AS created`
console.log(row.created ? `Created login "${name}".` : `Updated password for "${name}" (signed out everywhere).`)
