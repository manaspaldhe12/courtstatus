-- Per-court report history for the court detail page. Raw `reports` rows
-- stay unreadable to anon (see 0001_init.sql) — this view exposes only the
-- fields that were never sensitive (report type/value/time), explicitly
-- omitting `device_id` and `id`, and caps the window to the last 7 days so
-- it can't grow into an unbounded public export of report activity.
create view court_report_history as
select
  location_id,
  report_type,
  count_free,
  queue_length,
  created_at
from reports
where created_at > now() - interval '7 days';

grant select on court_report_history to anon;
