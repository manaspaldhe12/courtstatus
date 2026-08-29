# CourtStatus

Crowd-reported status of San Francisco tennis courts — a static frontend
(GitHub Pages) backed by Supabase (Postgres + auto-generated REST API).
Court directory data from [SF Rec & Park](https://www.sfrecpark.org/1446/Tennis-Court-Directory).

## How it works

- `locations` — the 64 SF Rec & Park tennis facilities, seeded once (name,
  zip, reservable/walk-up court counts, lights/restrooms).
- `reports` — anonymous, append-only log of user reports: "N reservable
  courts are free right now" or "queue length is N".
- `court_status` — a view that decays reports over time (last "free" report
  within 45 min, average of the last 3 queue reports within 60 min) and is
  the only thing the frontend reads.
- No login. Anyone can read `court_status` and insert into `reports`;
  nobody (including the frontend) can read raw `reports` rows directly —
  see `supabase/migrations/0001_init.sql` for the RLS policies and the
  per-device throttle trigger.

## Expected behavior

- **Reservable courts** (e.g. Alice Marble, or the reservable half of a mixed
  location like Dolores Park): a report only ever says "N courts are free
  right now." Absent a report, the card reads `no recent "free" report` —
  there's no baseline reservation-calendar integration in v1 (see "Open
  questions" in the original spec discussion), so the default assumption is
  "unknown," not "reserved."
  - A `reservable_free` report is shown for **45 minutes**, then the card
    reverts to `no recent "free" report` on its own — nobody has to "un-report"
    it. If a newer report comes in first, it replaces the old one immediately.
- **Walk-up courts**: a report says "N people/groups are waiting." The card
  shows the average of the **last 3** reports within the last **60 minutes**,
  plus an estimated wait at 15 minutes/group. Example lifecycle for a single
  court with no further reports after the one below:
  ```
  t+0:    "1 walk-up court — queue ~2 (est. 30 min wait, just now)"
  t+30m:  "1 walk-up court — queue ~2 (est. 30 min wait, 30 min ago)"
  t+61m:  "1 walk-up court — no recent queue report"
  ```
  The `~2` average, the ETA, and the "N min ago" timestamp are all derived
  live from `reports` on every read — nothing is precomputed or needs a
  cron job to "expire" a report. `tests/db/courtStatus.test.ts` asserts this
  exact transition (via backdated timestamps rather than waiting an hour).
- **Reporting is throttled**, not authenticated: the same anonymous device
  can report on the same location at most once every 2 minutes (raises an
  error client-side if violated). There's no cap on *different* devices
  reporting on the same location in quick succession — the "last 3" /
  45-minute-decay windowing above is what keeps a location's displayed
  status from being dominated by one stale report.
- **Report type is gated by what a location actually has**: you can't submit
  a `reservable_free` report for a walk-up-only location (or vice versa),
  and locations with `crowd_reportable = false` (currently just Goldman
  Tennis Center, which is booked through a separate external system) don't
  accept reports of either kind at all.

## One-time Supabase setup

You need a free [Supabase](https://supabase.com) project. From it, you need
exactly two values — **never** the `service_role` key, only the public ones:

- **Project URL** (Project Settings → API → Project URL)
- **anon public key** (Project Settings → API → Project API keys → `anon` `public`)

Steps:

1. Create a new Supabase project (free tier is enough — see note below).
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. Copy the Project URL and anon key from Project Settings → API.
4. In this GitHub repo: **Settings → Secrets and variables → Actions → Secrets**,
   add `SUPABASE_URL` and `SUPABASE_ANON_KEY` with those two values. Using
   Actions *secrets* here is just to keep them out of workflow logs — it
   doesn't change the actual security model, since the anon key still ends
   up embedded in the built frontend bundle either way (that's expected;
   the anon key is meant to be public, and Row Level Security in
   `0001_init.sql` is what actually restricts access).
5. **Settings → Pages → Source: GitHub Actions.**

Push to `main` and the `deploy.yml` workflow builds and publishes to
`https://manaspaldhe12.github.io/courtstatus/`.

### Free tier caveat

Supabase's free plan pauses a project after 7 days with no activity, which
would otherwise mean the first visitor after a quiet week hits a dead API.
`.github/workflows/keep-alive.yml` runs a weekly no-op read against the
project to prevent that — no action needed once `SUPABASE_URL` /
`SUPABASE_ANON_KEY` are set as repo secrets (step 4 above covers both
workflows).

## Local development

```bash
cp .env.example .env.local   # fill in the same Project URL / anon key
npm install
npm run dev
```

## Updating the court directory

Re-run `supabase/seed.sql` any time — it upserts on `slug`, so editing counts
or adding a facility there and re-running is safe.

## Testing

Two independent layers, both run in CI (`.github/workflows/test.yml`) on
every push/PR:

**Frontend (unit + integration)** — Vitest + jsdom. Every test mocks
`src/api/courts.ts` (the Supabase boundary), so none of this needs real
credentials or network access:

```bash
npm test          # run once
npm run test:watch
```

- `src/**/*.test.ts` next to the file they cover — pure logic (`StatusBadge`,
  `deviceId`), the polling store (`courtsStore`), and DOM behavior
  (`CourtCard`, `ReportModal`). `ReportModal.test.ts` is a regression suite
  for the "Submit does nothing" bug (a hidden, HTML5-invalid field silently
  blocked the browser's native form validation) — it asserts
  `form.checkValidity()` directly so that class of bug can't come back
  unnoticed.
- `src/integration/reportFlow.test.ts` wires the real `CourtList` +
  `CourtCard` + `ReportModal` + `courtsStore` together (only the network
  boundary is mocked) and drives the full flow: render → open the report
  modal → submit → UI reflects the new status. It also proves the
  *frontend's* half of the TTL-decay behavior — that when the (mocked) API
  stops returning a report, the UI reverts to "no recent report" without a
  page reload.

**Database (`tests/db/`)** — runs the actual `supabase/migrations/0001_init.sql`
+ `supabase/seed.sql` against a throwaway Postgres and asserts against real
SQL, not a JS reimplementation of it. This is what actually proves the
TTL-decay logic in the `court_status` view is correct — including the exact
behavior asked for: a status like `queue ~2 (est. 30 min wait, 1 min ago)`
reverting to "no recent report" once enough time passes. Rather than waiting
45–60 real minutes, the tests insert reports with an explicit backdated
`created_at` (as the table owner, bypassing RLS) to simulate elapsed time
instantly. It also covers Row Level Security (anon can read status/insert
reports, but never read raw reports) and the report-validation/throttle
trigger.

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
npm run test:db   # in another terminal; defaults to that local instance
```

`DATABASE_URL` overrides the target if you're pointing at something other
than the default local instance — **never point it at your real Supabase
project**, since the test suite starts with `drop schema public cascade`.
