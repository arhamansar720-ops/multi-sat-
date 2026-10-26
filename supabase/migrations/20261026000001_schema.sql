-- StudyDuel schema: catalog, profiles, study sessions, progression, friends, multiplayer.
-- All user-owned tables have Row Level Security enabled (see 20261026000002_security.sql).
-- Writes that affect scores or XP happen only through SECURITY DEFINER functions
-- executable by the service role, called from trusted server routes.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.exams (
  id text primary key,
  name text not null,
  program text not null,
  coverage text not null check (coverage in ('core', 'starter', 'planned')),
  course_ids text[] not null default '{}',
  difficulties text[],
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.courses (
  id text primary key,
  program text not null check (program in ('sat', 'ap')),
  name text not null,
  updated_at timestamptz not null default now()
);

-- Public question content (no answer keys).
create table public.questions (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  exam text not null,
  course_id text not null references public.courses (id),
  section text not null,
  topic text not null,
  skill text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  type text not null check (type in ('mcq', 'multi', 'numeric')),
  content jsonb not null,
  estimated_seconds int not null check (estimated_seconds between 15 and 600),
  tags text[] not null default '{}',
  version int not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_course_idx on public.questions (course_id, section, topic, skill);

-- Answer keys and explanations; no client policies, so only the service role can read them.
create table public.question_keys (
  question_id text primary key references public.questions (id) on delete cascade,
  correct jsonb not null,
  tolerance numeric,
  explanation text not null,
  updated_at timestamptz not null default now()
);

create table public.app_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null
);

-- ---------------------------------------------------------------------------
-- Profiles and preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 2 and 24),
  is_guest boolean not null default false,
  leaderboard_opt_in boolean not null default true,
  share_activity_with_friends boolean not null default true,
  total_xp integer not null default 0 check (total_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tracks text[] not null default '{sat}' check (cardinality(tracks) <= 12),
  classes text[] not null default '{}' check (cardinality(classes) <= 20),
  target_date date,
  target_score int check (target_score between 1 and 1600),
  daily_minutes int not null default 20 check (daily_minutes between 5 and 240),
  focus_skills text[] not null default '{}' check (cardinality(focus_skills) <= 20),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  onboarded boolean not null default false,
  reminder_emails boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Solo study
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('quick', 'focus', 'timed', 'review', 'daily', 'simulation')),
  track text not null,
  title text not null,
  config jsonb not null,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 60),
  daily_key date,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  deadline timestamptz,
  draft jsonb,
  draft_saved_at timestamptz,
  completed_at timestamptz,
  correct_count int,
  answered_count int,
  total int,
  duration_sec int,
  xp_total int,
  challenge_score int,
  result jsonb,
  created_at timestamptz not null default now()
);
create index study_sessions_user_completed_idx on public.study_sessions (user_id, completed_at desc);
create index study_sessions_user_status_idx on public.study_sessions (user_id, status, created_at desc);

create table public.session_answers (
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id text not null references public.questions (id),
  position int not null,
  response jsonb,
  is_correct boolean not null,
  time_ms int not null default 0 check (time_ms >= 0),
  flagged boolean not null default false,
  primary key (session_id, question_id)
);
create index session_answers_user_idx on public.session_answers (user_id);

-- Unified attempt log across solo sessions and matches (drives mastery and leaderboards).
create table public.question_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id text not null references public.questions (id),
  source text not null check (source in ('solo', 'match')),
  source_id uuid not null,
  is_correct boolean not null,
  earned_xp boolean not null default false,
  attempted_at timestamptz not null default now(),
  unique (user_id, source, source_id, question_id)
);
create index question_attempts_user_time_idx on public.question_attempts (user_id, attempted_at desc);
create index question_attempts_time_idx on public.question_attempts (attempted_at);

create table public.saved_questions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table public.user_skill_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text not null,
  skill text not null,
  attempts int not null default 0,
  correct int not null default 0,
  last_attempt_at timestamptz,
  primary key (user_id, course_id, skill)
);

-- One row per user per local calendar day (user's saved timezone).
create table public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  sessions int not null default 0,
  matches int not null default 0,
  questions int not null default 0,
  correct int not null default 0,
  seconds int not null default 0,
  xp int not null default 0,
  primary key (user_id, activity_date)
);
create index daily_activity_date_idx on public.daily_activity (activity_date);

-- Auditable reward ledger. The unique constraint makes every reward idempotent.
create table public.xp_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount > 0 and amount <= 1000),
  reason text not null check (reason in ('correct_answers', 'session_complete', 'daily_challenge', 'streak_bonus', 'match_correct', 'match_participation', 'match_win')),
  source_type text not null check (source_type in ('session', 'match')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, reason)
);
create index xp_transactions_user_time_idx on public.xp_transactions (user_id, created_at desc);
create index xp_transactions_time_idx on public.xp_transactions (created_at);

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
-- Friends
-- ---------------------------------------------------------------------------
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);
create unique index friend_requests_one_pending_idx
  on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';
create index friend_requests_recipient_idx on public.friend_requests (recipient_id, status);

create table public.friends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ---------------------------------------------------------------------------
-- Multiplayer
-- ---------------------------------------------------------------------------
create table public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  settings jsonb not null,
  current_match_id uuid,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
create index multiplayer_rooms_host_idx on public.multiplayer_rooms (host_id, created_at desc);
create index multiplayer_rooms_expiry_idx on public.multiplayer_rooms (expires_at);

create table public.room_members (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  role text not null default 'player' check (role in ('host', 'player')),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.multiplayer_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  round int not null,
  phase text not null default 'countdown' check (phase in ('countdown', 'question', 'reveal', 'finished')),
  current_index int not null default 0,
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz not null,
  question_count int not null check (question_count between 1 and 20),
  seconds_per_question int not null check (seconds_per_question between 10 and 120),
  scoring text not null check (scoring in ('speed', 'accuracy')),
  settings jsonb not null,
  human_players int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  finalized_at timestamptz,
  unique (room_id, round)
);
alter table public.multiplayer_rooms
  add constraint multiplayer_rooms_current_match_fk foreign key (current_match_id) references public.multiplayer_matches (id) on delete set null;
create index multiplayer_matches_finished_idx on public.multiplayer_matches (finished_at);

create table public.match_questions (
  match_id uuid not null references public.multiplayer_matches (id) on delete cascade,
  position int not null check (position >= 0),
  question_id text not null references public.questions (id),
  primary key (match_id, position)
);

create table public.match_participants (
  match_id uuid not null references public.multiplayer_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  score int not null default 0 check (score >= 0),
  correct int not null default 0,
  answered int not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  fastest_correct_ms int,
  correct_time_ms bigint not null default 0,
  rank int,
  xp_awarded int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_participants_user_idx on public.match_participants (user_id);

create table public.match_answers (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  position int not null,
  user_id uuid not null,
  response jsonb not null,
  is_correct boolean not null,
  points int not null check (points >= 0),
  response_ms int not null check (response_ms >= 0),
  submitted_at timestamptz not null default now(),
  unique (match_id, position, user_id),
  foreign key (match_id, user_id) references public.match_participants (match_id, user_id) on delete cascade,
  foreign key (match_id, position) references public.match_questions (match_id, position) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions for each row execute function public.set_updated_at();

-- Create a profile + preferences row for every new auth user (including anonymous guests).
-- Usernames are random (never derived from email) and can be changed later.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Student'), 24);
begin
  if char_length(v_name) < 2 then
    v_name := 'Student';
  end if;
  insert into public.profiles (id, username, display_name, is_guest, leaderboard_opt_in)
  values (
    new.id,
    case when coalesce(new.is_anonymous, false) then null
         else 'student_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) end,
    v_name,
    coalesce(new.is_anonymous, false),
    not coalesce(new.is_anonymous, false)
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- When a guest converts to a full account, mark the profile as non-guest.
create or replace function public.handle_user_upgraded() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    update public.profiles
      set is_guest = false,
          leaderboard_opt_in = true,
          username = coalesce(username, 'student_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
      where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_upgraded after update of is_anonymous on auth.users
  for each row execute function public.handle_user_upgraded();

-- Keep profiles.total_xp in sync with the ledger (the only way XP changes).
create or replace function public.apply_xp_transaction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set total_xp = total_xp + new.amount where id = new.user_id;
  return new;
end;
$$;

create trigger xp_transactions_apply after insert on public.xp_transactions
  for each row execute function public.apply_xp_transaction();
