// court_report_history backs the court detail page's "recent reports" feed.
// The key invariant to lock in: it must never expose device_id (the one
// field raw `reports` intentionally withholds from anon), and it should
// only surface the last 7 days.
import { it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'

const MIGRATIONS = [
  readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../supabase/migrations/0002_report_history.sql', import.meta.url), 'utf8'),
]
const SEED_SQL = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8')

let admin: Client

async function idFor(slug: string): Promise<string> {
  const { rows } = await admin.query('select id from locations where slug = $1', [slug])
  if (rows.length === 0) throw new Error(`fixture location not seeded: ${slug}`)
  return rows[0].id as string
}

async function asAnon<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query('set role anon')
    return await fn(client)
  } finally {
    await client.end()
  }
}

beforeAll(async () => {
  admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  await admin.query('drop schema public cascade; create schema public;')
  await admin.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
    end $$;
  `)
  for (const migration of MIGRATIONS) await admin.query(migration)
  await admin.query(SEED_SQL)
})

afterAll(async () => {
  await admin.end()
})

it('anon can read report history, and it never includes device_id', async () => {
  const locationId = await idFor('alamo-square')
  await asAnon((client) =>
    client.query('insert into reports (location_id, report_type, queue_length, device_id) values ($1,$2,$3,$4)', [
      locationId,
      'queue_length',
      2,
      randomUUID(),
    ]),
  )

  const rows = await asAnon((client) =>
    client.query('select * from court_report_history where location_id = $1', [locationId]),
  )
  expect(rows.rowCount).toBe(1)
  expect(rows.rows[0]).not.toHaveProperty('device_id')
  expect(rows.rows[0]).not.toHaveProperty('id')
  expect(rows.rows[0].queue_length).toBe(2)
})

it('excludes reports older than 7 days', async () => {
  const locationId = await idFor('fulton')
  await admin.query(
    `insert into reports (location_id, report_type, count_free, device_id, created_at)
     values ($1, 'reservable_free', 1, $2, now() - interval '8 days')`,
    [locationId, randomUUID()],
  )
  await admin.query(
    `insert into reports (location_id, report_type, count_free, device_id, created_at)
     values ($1, 'reservable_free', 0, $2, now() - interval '2 days')`,
    [locationId, randomUUID()],
  )

  const rows = await asAnon((client) =>
    client.query('select count_free from court_report_history where location_id = $1', [locationId]),
  )
  expect(rows.rowCount).toBe(1)
  expect(rows.rows[0].count_free).toBe(0)
})
