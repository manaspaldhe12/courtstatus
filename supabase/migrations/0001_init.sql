-- CourtStatus schema: locations (SF Rec & Park tennis facilities) + reports
-- (anonymous crowd-sourced status reports). See README.md for how to run this.

create extension if not exists pgcrypto;

create table locations (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  zip               text,
  num_reservable    int not null default 0,
  num_walkup        int not null default 0,
  lights            boolean not null default false,
  restrooms         boolean not null default false,
  reservation_url   text,
  -- Facilities booked through a separate external system (e.g. Goldman Tennis
  -- Center via LifetimeActivities) don't accept crowd reports in v1.
  crowd_reportable  boolean not null default true,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references locations(id),
  report_type   text not null check (report_type in ('reservable_free', 'queue_length')),
  count_free    int check (count_free is null or (count_free between 0 and 20)),
  queue_length  int check (queue_length is null or (queue_length between 0 and 30)),
  device_id     uuid not null,
  created_at    timestamptz not null default now(),
  constraint report_payload_matches_type check (
    (report_type = 'reservable_free' and count_free is not null and queue_length is null) or
    (report_type = 'queue_length' and queue_length is not null and count_free is null)
  )
);

create index reports_location_created_idx on reports (location_id, report_type, created_at desc);

-- Validate the report against its location, and throttle repeat reports from
-- the same anonymous device on the same location (basic spam brake).
create or replace function reports_before_insert() returns trigger as $$
declare
  loc locations%rowtype;
begin
  select * into loc from locations where id = new.location_id;

  if loc.id is null or not loc.active then
    raise exception 'Unknown or inactive location.';
  end if;

  if not loc.crowd_reportable then
    raise exception 'This location does not accept crowd-sourced reports.';
  end if;

  if new.report_type = 'reservable_free' and loc.num_reservable = 0 then
    raise exception 'This location has no reservable courts.';
  end if;

  if new.report_type = 'queue_length' and loc.num_walkup = 0 then
    raise exception 'This location has no walk-up courts.';
  end if;

  if exists (
    select 1 from reports
    where location_id = new.location_id
      and device_id = new.device_id
      and created_at > now() - interval '2 minutes'
  ) then
    raise exception 'Please wait a couple minutes before reporting on this location again.';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger reports_before_insert_trigger
  before insert on reports
  for each row execute function reports_before_insert();

-- Derived, TTL-decayed status per location. Owned by the migration role, so it
-- can read raw `reports` rows (incl. device_id) server-side to compute the
-- aggregate, while the `reports` table itself is never directly readable by
-- the public `anon` role (see grants below) — only insert-only.
create view court_status as
select
  l.*,
  free.max_count_free,
  free.last_free_report_at,
  q.avg_queue_length,
  q.last_queue_report_at
from locations l
left join lateral (
  select max(count_free) as max_count_free, max(created_at) as last_free_report_at
  from reports r
  where r.location_id = l.id
    and r.report_type = 'reservable_free'
    and r.created_at > now() - interval '45 minutes'
) free on true
left join lateral (
  select avg(queue_length) as avg_queue_length, max(created_at) as last_queue_report_at
  from (
    select queue_length, created_at from reports r
    where r.location_id = l.id
      and r.report_type = 'queue_length'
      and r.created_at > now() - interval '60 minutes'
    order by created_at desc
    limit 3
  ) recent
) q on true
where l.active;

alter table locations enable row level security;
alter table reports enable row level security;

create policy "Public can read locations"
  on locations for select
  using (true);

create policy "Public can insert reports"
  on reports for insert
  with check (true);

-- No select/update/delete policy on `reports` for anon: RLS default-denies
-- them, so individual reports (and device_id) are never directly readable.

grant usage on schema public to anon;
grant select on locations to anon;
grant select on court_status to anon;
grant insert on reports to anon;
