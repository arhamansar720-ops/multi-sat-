-- Allow Bluebook-style practice tests as a study session mode.
alter table public.study_sessions drop constraint if exists study_sessions_mode_check;
alter table public.study_sessions
  add constraint study_sessions_mode_check
  check (mode in ('quick', 'focus', 'timed', 'review', 'daily', 'simulation', 'test'));
