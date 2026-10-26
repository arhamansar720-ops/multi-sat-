-- Row Level Security, column privileges, and realtime authorization.

alter table public.exams enable row level security;
alter table public.courses enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.app_meta enable row level security;
alter table public.achievements enable row level security;
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.study_sessions enable row level security;
alter table public.session_answers enable row level security;
alter table public.question_attempts enable row level security;
alter table public.saved_questions enable row level security;
alter table public.user_skill_progress enable row level security;
alter table public.daily_activity enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.multiplayer_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.multiplayer_matches enable row level security;
alter table public.match_questions enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_answers enable row level security;

-- Public catalog content (answer keys live in question_keys, which has no policies).
create policy "catalog is public" on public.exams for select to anon, authenticated using (true);
create policy "catalog is public" on public.courses for select to anon, authenticated using (true);
create policy "questions are public" on public.questions for select to anon, authenticated using (is_active);
create policy "achievements are public" on public.achievements for select to anon, authenticated using (true);

-- Profiles: a user can read and edit only their own row, and only safe columns.
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, username, leaderboard_opt_in, share_activity_with_friends) on public.profiles to authenticated;

create policy "read own preferences" on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "update own preferences" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete on public.user_preferences from anon, authenticated;

-- Study history: read-only to its owner. All writes go through server routes.
create policy "read own sessions" on public.study_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "read own session answers" on public.session_answers for select to authenticated using (user_id = (select auth.uid()));
create policy "read own attempts" on public.question_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy "read own skill progress" on public.user_skill_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "read own daily activity" on public.daily_activity for select to authenticated using (user_id = (select auth.uid()));
create policy "read own xp" on public.xp_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy "read own achievements" on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.study_sessions, public.session_answers, public.question_attempts,
  public.user_skill_progress, public.daily_activity, public.xp_transactions, public.user_achievements
  from anon, authenticated;

-- Saved questions: owner can add and remove.
create policy "read own saved" on public.saved_questions for select to authenticated using (user_id = (select auth.uid()));
create policy "save own" on public.saved_questions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "unsave own" on public.saved_questions for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.saved_questions from anon, authenticated;

-- Friends: visible to the people involved; changes go through RPCs below.
create policy "see own requests" on public.friend_requests for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "see own friends" on public.friends for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.friend_requests, public.friends from anon, authenticated;

-- Multiplayer: members can read their rooms; all writes go through server routes.
create or replace function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_match_member(p_match_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.multiplayer_matches m
    join public.room_members rm on rm.room_id = m.room_id
    where m.id = p_match_id and rm.user_id = (select auth.uid())
  );
$$;

create policy "members read rooms" on public.multiplayer_rooms for select to authenticated using (public.is_room_member(id));
create policy "members read members" on public.room_members for select to authenticated using (public.is_room_member(room_id));
create policy "members read matches" on public.multiplayer_matches for select to authenticated using (public.is_room_member(room_id));
create policy "members read match questions" on public.match_questions for select to authenticated using (public.is_match_member(match_id));
create policy "members read standings" on public.match_participants for select to authenticated using (public.is_match_member(match_id));
create policy "read own match answers" on public.match_answers for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.multiplayer_rooms, public.room_members, public.multiplayer_matches,
  public.match_questions, public.match_participants, public.match_answers
  from anon, authenticated;

-- Catalog writes are service-role only.
revoke insert, update, delete on public.exams, public.courses, public.questions, public.question_keys,
  public.app_meta, public.achievements from anon, authenticated;
revoke select on public.question_keys, public.app_meta from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime authorization: private channels "room:<CODE>" are limited to
-- active members of that room, for both broadcast and presence.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_room_topic(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_topic like 'room:%' and exists (
    select 1
    from public.multiplayer_rooms r
    join public.room_members rm on rm.room_id = r.id
    where r.code = split_part(p_topic, ':', 2)
      and rm.user_id = (select auth.uid())
      and rm.left_at is null
  );
$$;

create policy "room members receive" on realtime.messages for select to authenticated
  using (public.can_access_room_topic((select realtime.topic())) and realtime.messages.extension in ('broadcast', 'presence'));
create policy "room members send" on realtime.messages for insert to authenticated
  with check (public.can_access_room_topic((select realtime.topic())) and realtime.messages.extension in ('broadcast', 'presence'));
