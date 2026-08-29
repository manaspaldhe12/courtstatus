// These tests run the real migration + seed SQL against a throwaway Postgres
// database and exercise RLS, the report-validation trigger, and — the main
// point — the TTL decay in the `court_status` view. Time-based decay is
// simulated by inserting reports with an explicit backdated `created_at`
// (as the admin/table-owner role, which bypasses RLS) rather than waiting
// 45-60 minutes of real time.
//
// Requires a reachable Postgres via DATABASE_URL (defaults to the standard
// local/CI throwaway instance). See README "Testing" for how to run one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'

const MIGRATION_SQL = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8')
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
  await admin.query(MIGRATION_SQL)
  await admin.query(SEED_SQL)
})

afterAll(async () => {
  await admin.end()
})

describe('row level security', () => {
  it('anon can read locations and the court_status view', async () => {
    await asAnon(async (client) => {
      const locations = await client.query('select * from locations limit 1')
      expect(locations.rowCount).toBeGreaterThan(0)
      const status = await client.query('select * from court_status limit 1')
      expect(status.rowCount).toBeGreaterThan(0)
    })
  })

  it('anon cannot read raw reports directly', async () => {
    await expect(asAnon((client) => client.query('select * from reports'))).rejects.toThrow(/permission denied/)
  })

  it('anon can insert a valid report', async () => {
    const locationId = await idFor('alamo-square')
    await asAnon((client) =>
      client.query(
        'insert into reports (location_id, report_type, queue_length, device_id) values ($1, $2, $3, $4)',
        [locationId, 'queue_length', 2, randomUUID()],
      ),
    )
    const { rows } = await admin.query('select avg_queue_length from court_status where id = $1', [locationId])
    expect(Number(rows[0].avg_queue_length)).toBe(2)
  })
})

describe('report validation trigger', () => {
  it('rejects a reservable_free report for a walk-up-only location', async () => {
    const locationId = await idFor('alta-plaza') // 0 reservable, 3 walk-up
    await expect(
      asAnon((client) =>
        client.query('insert into reports (location_id, report_type, count_free, device_id) values ($1,$2,$3,$4)', [
          locationId,
          'reservable_free',
          1,
          randomUUID(),
        ]),
      ),
    ).rejects.toThrow(/no reservable courts/)
  })

  it('rejects a queue_length report for a reservable-only location', async () => {
    const locationId = await idFor('alice-marble') // 4 reservable, 0 walk-up
    await expect(
      asAnon((client) =>
        client.query('insert into reports (location_id, report_type, queue_length, device_id) values ($1,$2,$3,$4)', [
          locationId,
          'queue_length',
          1,
          randomUUID(),
        ]),
      ),
    ).rejects.toThrow(/no walk-up courts/)
  })

  it('rejects any report for a location not open to crowd reporting (Goldman Tennis Center)', async () => {
    const locationId = await idFor('goldman-tennis-center')
    await expect(
      asAnon((client) =>
        client.query('insert into reports (location_id, report_type, count_free, device_id) values ($1,$2,$3,$4)', [
          locationId,
          'reservable_free',
          1,
          randomUUID(),
        ]),
      ),
    ).rejects.toThrow(/does not accept crowd-sourced reports/)
  })

  it('throttles a second report from the same device on the same location within 2 minutes', async () => {
    const locationId = await idFor('cabrillo')
    const deviceId = randomUUID()
    await asAnon((client) =>
      client.query('insert into reports (location_id, report_type, queue_length, device_id) values ($1,$2,$3,$4)', [
        locationId,
        'queue_length',
        1,
        deviceId,
      ]),
    )
    await expect(
      asAnon((client) =>
        client.query('insert into reports (location_id, report_type, queue_length, device_id) values ($1,$2,$3,$4)', [
          locationId,
          'queue_length',
          5,
          deviceId,
        ]),
      ),
    ).rejects.toThrow(/wait a couple minutes/)
  })
})

describe('reservable_free with count_free = 0 ("all courts taken")', () => {
  it('is distinguishable in court_status from no report at all (max() of zero rows is null, not 0)', async () => {
    const reportedTaken = await idFor('hamilton')
    await asAnon((client) =>
      client.query('insert into reports (location_id, report_type, count_free, device_id) values ($1,$2,$3,$4)', [
        reportedTaken,
        'reservable_free',
        0,
        randomUUID(),
      ]),
    )
    const taken = await admin.query('select max_count_free from court_status where id = $1', [reportedTaken])
    expect(taken.rows[0].max_count_free).toBe(0)

    const neverReported = await idFor('jackson')
    const unset = await admin.query('select max_count_free from court_status where id = $1', [neverReported])
    expect(unset.rows[0].max_count_free).toBeNull()
  })
})

describe('TTL decay in court_status (the "reverts to no report over time" behavior)', () => {
  it('drops a queue_length report once it is older than the 60-minute TTL', async () => {
    const locationId = await idFor('douglass')

    await admin.query(
      `insert into reports (location_id, report_type, queue_length, device_id, created_at)
       values ($1, 'queue_length', 4, $2, now() - interval '65 minutes')`,
      [locationId, randomUUID()],
    )

    const stale = await admin.query('select avg_queue_length, last_queue_report_at from court_status where id = $1', [
      locationId,
    ])
    expect(stale.rows[0].avg_queue_length).toBeNull()
    expect(stale.rows[0].last_queue_report_at).toBeNull()

    // A fresh report right now shows back up immediately.
    await admin.query(
      `insert into reports (location_id, report_type, queue_length, device_id, created_at)
       values ($1, 'queue_length', 2, $2, now())`,
      [locationId, randomUUID()],
    )
    const fresh = await admin.query('select avg_queue_length from court_status where id = $1', [locationId])
    expect(Number(fresh.rows[0].avg_queue_length)).toBe(2)
  })

  it('drops a reservable_free report once it is older than the 45-minute TTL', async () => {
    const locationId = await idFor('fulton')

    await admin.query(
      `insert into reports (location_id, report_type, count_free, device_id, created_at)
       values ($1, 'reservable_free', 1, $2, now() - interval '50 minutes')`,
      [locationId, randomUUID()],
    )
    const stale = await admin.query('select max_count_free from court_status where id = $1', [locationId])
    expect(stale.rows[0].max_count_free).toBeNull()

    await admin.query(
      `insert into reports (location_id, report_type, count_free, device_id, created_at)
       values ($1, 'reservable_free', 1, $2, now() - interval '10 minutes')`,
      [locationId, randomUUID()],
    )
    const fresh = await admin.query('select max_count_free from court_status where id = $1', [locationId])
    expect(fresh.rows[0].max_count_free).toBe(1)
  })

  it('averages only the 3 most recent queue_length reports within the TTL window', async () => {
    const locationId = await idFor('south-sunset')
    // oldest -> newest; only the last 3 (2, 3, 4) should count toward the average.
    const reports = [
      { minutesAgo: 5, value: 10 },
      { minutesAgo: 4, value: 1 },
      { minutesAgo: 3, value: 2 },
      { minutesAgo: 2, value: 3 },
      { minutesAgo: 1, value: 4 },
    ]
    for (const r of reports) {
      await admin.query(
        `insert into reports (location_id, report_type, queue_length, device_id, created_at)
         values ($1, 'queue_length', $2, $3, now() - make_interval(mins => $4))`,
        [locationId, r.value, randomUUID(), r.minutesAgo],
      )
    }
    const { rows } = await admin.query('select avg_queue_length from court_status where id = $1', [locationId])
    expect(Number(rows[0].avg_queue_length)).toBe(3)
  })
})
