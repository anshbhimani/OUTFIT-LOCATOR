// Neon Postgres (provisioned through the Vercel Marketplace, which sets DATABASE_URL).
// Files under api/_lib are shared helpers, not endpoints.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let sql: NeonQueryFunction<false, false> | null = null

/** Lazy, so builds without DATABASE_URL don't crash. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    sql = neon(url)
  }
  return sql
}

// Idempotent schema. Runs once per function instance; safe to re-run.
// Data is shared by everyone who can log in (one family). To support separate families later,
// add a `family_id` column to users/locations/sarees and filter by the logged-in user's family.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    username text UNIQUE NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    session_version integer NOT NULL DEFAULT 1,
    failed_logins integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS locations (
    id text PRIMARY KEY,
    name text NOT NULL,
    parent_id text REFERENCES locations(id) ON DELETE RESTRICT,
    kind text NOT NULL CHECK (kind IN ('room','unit','spot','away')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sarees (
    id text PRIMARY KEY,
    title text,
    colors text[] NOT NULL DEFAULT '{}',
    fabric text,
    pattern text,
    occasion text,
    notes text,
    location_id text NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    last_worn timestamptz,
    created_by text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id text PRIMARY KEY,
    saree_id text NOT NULL REFERENCES sarees(id) ON DELETE CASCADE,
    pathname text NOT NULL,
    position integer NOT NULL,
    embedding real[],
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS photos_saree_idx ON photos(saree_id, position)`,
  `CREATE TABLE IF NOT EXISTS history (
    id text PRIMARY KEY,
    saree_id text NOT NULL REFERENCES sarees(id) ON DELETE CASCADE,
    from_location_id text,
    to_location_id text NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    note text,
    by_user text REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS history_saree_idx ON history(saree_id, at)`,
  // Each saree can have a Gujarati name (title) and an English name (title_en), shown by UI language.
  `ALTER TABLE sarees ADD COLUMN IF NOT EXISTS title_en text`,
  // Names must be unique per language (case-insensitive); sarees without a name are allowed.
  `CREATE UNIQUE INDEX IF NOT EXISTS sarees_title_unique ON sarees (lower(title)) WHERE title IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sarees_title_en_unique ON sarees (lower(title_en)) WHERE title_en IS NOT NULL`,
]

let ready: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const sql = getSql()
    for (const statement of SCHEMA) await sql.query(statement)
  })().catch((e) => {
    ready = null
    throw e
  })
  return ready
}
