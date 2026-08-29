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
