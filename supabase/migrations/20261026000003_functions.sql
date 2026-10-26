-- Transaction-safe write functions (service role only) and read RPCs for clients.

create table public.daily_challenge_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  daily_key date not null,
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, daily_key)
);
alter table public.daily_challenge_completions enable row level security;
create policy "read own daily completions" on public.daily_challenge_completions for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.daily_challenge_completions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- complete_study_session: atomically completes a session exactly once.
-- Returns false (and changes nothing) if the session was already completed.
-- ---------------------------------------------------------------------------
create or replace function public.complete_study_session(
  p_session_id uuid,
  p_user_id uuid,
  p_result jsonb,
  p_answers jsonb,
  p_xp jsonb,
  p_xp_question_ids text[],
  p_achievements text[],
  p_activity_date date
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_rows int;
  v_completed timestamptz := (p_result ->> 'completedAt')::timestamptz;
  v_daily date := nullif(p_result ->> 'dailyKey', '')::date;
  v_xp jsonb := coalesce(p_xp, '[]'::jsonb);
  v_xp_total int;
begin
  perform 1 from public.study_sessions
    where id = p_session_id and user_id = p_user_id and status = 'in_progress'
    for update;
  if not found then
    return false;
  end if;

  -- Daily challenge reward is once per user per day, even under concurrent submissions.
  if v_daily is not null and exists (select 1 from jsonb_array_elements(v_xp) e where e ->> 'reason' = 'daily_challenge') then
    insert into public.daily_challenge_completions (user_id, daily_key, session_id, completed_at)
      values (p_user_id, v_daily, p_session_id, v_completed)
      on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      v_xp := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_xp) e where e ->> 'reason' <> 'daily_challenge');
    end if;
  end if;
  v_xp_total := (select coalesce(sum((e ->> 'amount')::int), 0) from jsonb_array_elements(v_xp) e);

  update public.study_sessions set
    status = 'completed',
    completed_at = v_completed,
    correct_count = (p_result ->> 'correctCount')::int,
    answered_count = (p_result ->> 'answeredCount')::int,
    total = (p_result ->> 'total')::int,
    duration_sec = (p_result ->> 'durationSec')::int,
    xp_total = v_xp_total,
    challenge_score = nullif(p_result ->> 'challengeScore', '')::int,
    result = jsonb_set(jsonb_set(p_result, '{xp}', v_xp), '{xpTotal}', to_jsonb(v_xp_total)),
    draft = null
  where id = p_session_id;

  insert into public.session_answers (session_id, user_id, question_id, position, response, is_correct, time_ms, flagged)
  select p_session_id, p_user_id, a.question_id, a.position, a.response, a.is_correct, greatest(0, a.time_ms), a.flagged
  from jsonb_to_recordset(p_answers) as a(question_id text, position int, response jsonb, is_correct boolean, time_ms int, flagged boolean);

  insert into public.question_attempts (user_id, question_id, source, source_id, is_correct, earned_xp, attempted_at)
  select p_user_id, a.question_id, 'solo', p_session_id, a.is_correct, a.question_id = any (coalesce(p_xp_question_ids, '{}')), v_completed
  from jsonb_to_recordset(p_answers) as a(question_id text, response jsonb, is_correct boolean)
  where a.response is not null and jsonb_typeof(a.response) = 'array'
  on conflict do nothing;

  insert into public.user_skill_progress as usp (user_id, course_id, skill, attempts, correct, last_attempt_at)
  select p_user_id, q.course_id, q.skill, count(*), count(*) filter (where a.is_correct), v_completed
  from jsonb_to_recordset(p_answers) as a(question_id text, response jsonb, is_correct boolean)
  join public.questions q on q.id = a.question_id
  where a.response is not null and jsonb_typeof(a.response) = 'array'
  group by q.course_id, q.skill
  on conflict (user_id, course_id, skill) do update set
    attempts = usp.attempts + excluded.attempts,
    correct = usp.correct + excluded.correct,
    last_attempt_at = excluded.last_attempt_at;

  insert into public.xp_transactions (user_id, amount, reason, source_type, source_id, created_at)
  select p_user_id, x.amount, x.reason, 'session', p_session_id, v_completed
  from jsonb_to_recordset(v_xp) as x(reason text, amount int)
  where x.amount > 0
  on conflict do nothing;

  insert into public.user_achievements (user_id, achievement_id, earned_at)
  select p_user_id, a, v_completed from unnest(coalesce(p_achievements, '{}')) as a
  on conflict do nothing;

  insert into public.daily_activity as da (user_id, activity_date, sessions, questions, correct, seconds, xp)
  values (
    p_user_id, p_activity_date, 1,
    (p_result ->> 'answeredCount')::int, (p_result ->> 'correctCount')::int,
    (p_result ->> 'durationSec')::int, v_xp_total
  )
  on conflict (user_id, activity_date) do update set
    sessions = da.sessions + 1,
    questions = da.questions + excluded.questions,
    correct = da.correct + excluded.correct,
    seconds = da.seconds + excluded.seconds,
    xp = da.xp + excluded.xp;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_match_answer: inserts one answer and updates the player's score in
-- one transaction. Duplicate submissions are rejected by the unique key.
-- ---------------------------------------------------------------------------
create or replace function public.record_match_answer(
  p_match_id uuid,
  p_position int,
  p_user_id uuid,
  p_response jsonb,
  p_is_correct boolean,
  p_points int,
  p_response_ms int
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.multiplayer_matches
    where id = p_match_id and phase = 'question' and current_index = p_position
    for share;
  if not found then
    return 'closed';
  end if;
  perform 1 from public.match_participants where match_id = p_match_id and user_id = p_user_id;
  if not found then
    return 'not_participant';
  end if;

  insert into public.match_answers (match_id, position, user_id, response, is_correct, points, response_ms)
  values (p_match_id, p_position, p_user_id, p_response, p_is_correct, greatest(0, p_points), greatest(0, p_response_ms))
  on conflict (match_id, position, user_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  update public.match_participants set
    score = score + greatest(0, p_points),
    answered = answered + 1,
    correct = correct + case when p_is_correct then 1 else 0 end,
    correct_time_ms = correct_time_ms + case when p_is_correct then greatest(0, p_response_ms) else 0 end,
    fastest_correct_ms = case when p_is_correct then least(coalesce(fastest_correct_ms, p_response_ms), p_response_ms) else fastest_correct_ms end
  where match_id = p_match_id and user_id = p_user_id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_match: records ranks, XP, attempts, achievements, and activity once.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_match(
  p_match_id uuid,
  p_participants jsonb,
  p_xp jsonb,
  p_achievements jsonb,
  p_activity jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_rows int;
begin
  update public.multiplayer_matches set finalized_at = now()
    where id = p_match_id and phase = 'finished' and finalized_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  update public.match_participants mp set
    rank = p.rank,
    best_streak = p.best_streak,
    xp_awarded = p.xp
  from jsonb_to_recordset(p_participants) as p(user_id uuid, rank int, best_streak int, xp int)
  where mp.match_id = p_match_id and mp.user_id = p.user_id;

  insert into public.xp_transactions (user_id, amount, reason, source_type, source_id)
  select x.user_id, x.amount, x.reason, 'match', p_match_id
  from jsonb_to_recordset(p_xp) as x(user_id uuid, reason text, amount int)
  where x.amount > 0
  on conflict do nothing;

  insert into public.question_attempts (user_id, question_id, source, source_id, is_correct, earned_xp, attempted_at)
  select ma.user_id, mq.question_id, 'match', p_match_id, ma.is_correct, ma.is_correct, ma.submitted_at
  from public.match_answers ma
  join public.match_questions mq on mq.match_id = ma.match_id and mq.position = ma.position
  where ma.match_id = p_match_id
  on conflict do nothing;

  insert into public.user_achievements (user_id, achievement_id)
  select a.user_id, a.achievement_id from jsonb_to_recordset(p_achievements) as a(user_id uuid, achievement_id text)
  on conflict do nothing;

  insert into public.daily_activity as da (user_id, activity_date, matches, questions, correct, xp)
  select a.user_id, a.activity_date, 1, a.questions, a.correct, a.xp
  from jsonb_to_recordset(p_activity) as a(user_id uuid, activity_date date, questions int, correct int, xp int)
  on conflict (user_id, activity_date) do update set
    matches = da.matches + 1,
    questions = da.questions + excluded.questions,
    correct = da.correct + excluded.correct,
    xp = da.xp + excluded.xp;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stale room cleanup (called opportunistically and by the cron route).
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_stale_rooms() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_closed int;
begin
  update public.multiplayer_rooms set status = 'closed'
    where status <> 'closed' and (expires_at < now() or last_activity_at < now() - interval '2 hours');
  get diagnostics v_closed = row_count;
  -- Keep finished match history (for leaderboards); delete empty abandoned lobbies after a day.
  delete from public.multiplayer_rooms r
    where r.status = 'closed' and r.expires_at < now() - interval '1 day'
      and not exists (select 1 from public.multiplayer_matches m where m.room_id = r.id);
  return v_closed;
end;
$$;

revoke execute on function public.complete_study_session(uuid, uuid, jsonb, jsonb, jsonb, text[], text[], date) from public, anon, authenticated;
revoke execute on function public.record_match_answer(uuid, int, uuid, jsonb, boolean, int, int) from public, anon, authenticated;
revoke execute on function public.finalize_match(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.cleanup_stale_rooms() from public, anon, authenticated;
grant execute on function public.complete_study_session(uuid, uuid, jsonb, jsonb, jsonb, text[], text[], date) to service_role;
grant execute on function public.record_match_answer(uuid, int, uuid, jsonb, boolean, int, int) to service_role;
grant execute on function public.finalize_match(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.cleanup_stale_rooms() to service_role;

-- ---------------------------------------------------------------------------
-- Leaderboards. Exposes only display name, username, and aggregate counts for
-- registered users who opted in (plus the caller). Ties share a rank and are
-- ordered by XP, then display name, then id for stable output.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_period text default 'week',
  p_metric text default 'xp',
  p_scope text default 'global',
  p_limit int default 50
) returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  username text,
  total_xp int,
  xp bigint,
  correct bigint,
  wins bigint,
  active_days bigint,
  is_me boolean
)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select case p_period
      when 'week' then date_trunc('week', now())
      when 'month' then date_trunc('month', now())
      else '-infinity'::timestamptz
    end as since
  ),
  eligible as (
    select p.id, p.display_name, p.username::text as username, p.total_xp
    from public.profiles p
    where not p.is_guest
      and (p.leaderboard_opt_in or p.id = (select auth.uid()))
      and (
        p_scope <> 'friends'
        or p.id = (select auth.uid())
        or exists (select 1 from public.friends f where f.user_id = (select auth.uid()) and f.friend_id = p.id)
      )
  ),
  xp as (
    select x.user_id, sum(x.amount)::bigint as v from public.xp_transactions x, bounds b
    where x.created_at >= b.since group by x.user_id
  ),
  cor as (
    select a.user_id, count(*) filter (where a.is_correct)::bigint as v from public.question_attempts a, bounds b
    where a.attempted_at >= b.since group by a.user_id
  ),
  w as (
    select mp.user_id, count(*)::bigint as v
    from public.match_participants mp
    join public.multiplayer_matches m on m.id = mp.match_id, bounds b
    where mp.rank = 1 and m.human_players >= 2 and m.finished_at >= b.since
    group by mp.user_id
  ),
  d as (
    select da.user_id, count(*)::bigint as v from public.daily_activity da, bounds b
    where da.activity_date >= (b.since at time zone 'UTC')::date group by da.user_id
  ),
  scored as (
    select e.id, e.display_name, e.username, e.total_xp,
      coalesce(xp.v, 0) as xp, coalesce(cor.v, 0) as correct, coalesce(w.v, 0) as wins, coalesce(d.v, 0) as active_days,
      e.id = (select auth.uid()) as is_me
    from eligible e
    left join xp on xp.user_id = e.id
    left join cor on cor.user_id = e.id
    left join w on w.user_id = e.id
    left join d on d.user_id = e.id
  ),
  metric as (
    select s.*, case p_metric when 'correct' then s.correct when 'wins' then s.wins when 'consistency' then s.active_days else s.xp end as m
    from scored s
  ),
  ranked as (
    select m.*,
      rank() over (order by m.m desc, m.xp desc) as rnk,
      row_number() over (order by m.m desc, m.xp desc, m.display_name, m.id) as rn
    from metric m
    where m.m > 0 or m.is_me
  )
  select r.rnk, r.id, r.display_name, r.username, r.total_xp, r.xp, r.correct, r.wins, r.active_days, r.is_me
  from ranked r
  where r.rn <= least(greatest(p_limit, 1), 100) or r.is_me
  order by r.rn;
$$;

revoke execute on function public.get_leaderboard(text, text, text, int) from public, anon;
grant execute on function public.get_leaderboard(text, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Friends. Guests (anonymous users) cannot use friends features.
-- ---------------------------------------------------------------------------
create or replace function public.assert_registered() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to use friends.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_guest) then
    raise exception 'Create a free account to add friends.' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.assert_registered();
  v_target uuid;
  v_pending int;
begin
  select id into v_target from public.profiles
    where username = trim(p_username)::extensions.citext and not is_guest;
  if v_target is null then
    return 'not_found';
  end if;
  if v_target = v_uid then
    return 'self';
  end if;
  if exists (select 1 from public.friends where user_id = v_uid and friend_id = v_target) then
    return 'already_friends';
  end if;
  -- If they already asked us, accept instead of creating a duplicate.
  if exists (select 1 from public.friend_requests where sender_id = v_target and recipient_id = v_uid and status = 'pending') then
    update public.friend_requests set status = 'accepted', responded_at = now()
      where sender_id = v_target and recipient_id = v_uid and status = 'pending';
    insert into public.friends (user_id, friend_id) values (v_uid, v_target), (v_target, v_uid) on conflict do nothing;
    return 'accepted';
  end if;
  select count(*) into v_pending from public.friend_requests where sender_id = v_uid and status = 'pending';
  if v_pending >= 25 then
    return 'rate_limited';
  end if;
  insert into public.friend_requests (sender_id, recipient_id) values (v_uid, v_target)
    on conflict do nothing;
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.assert_registered();
  v_sender uuid;
begin
  update public.friend_requests
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_request_id and recipient_id = v_uid and status = 'pending'
    returning sender_id into v_sender;
  if v_sender is null then
    return 'not_found';
  end if;
  if p_accept then
    insert into public.friends (user_id, friend_id) values (v_uid, v_sender), (v_sender, v_uid) on conflict do nothing;
  end if;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

create or replace function public.cancel_friend_request(p_request_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.assert_registered();
begin
  update public.friend_requests set status = 'cancelled', responded_at = now()
    where id = p_request_id and sender_id = v_uid and status = 'pending';
  return case when found then 'cancelled' else 'not_found' end;
end;
$$;

create or replace function public.remove_friend(p_friend_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.assert_registered();
begin
  delete from public.friends
    where (user_id = v_uid and friend_id = p_friend_id) or (user_id = p_friend_id and friend_id = v_uid);
  return case when found then 'removed' else 'not_found' end;
end;
$$;

create or replace function public.list_friend_requests() returns table (
  id uuid, direction text, other_id uuid, display_name text, username text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select fr.id,
    case when fr.sender_id = (select auth.uid()) then 'outgoing' else 'incoming' end,
    p.id, p.display_name, p.username::text, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = case when fr.sender_id = (select auth.uid()) then fr.recipient_id else fr.sender_id end
  where fr.status = 'pending' and ((select auth.uid()) in (fr.sender_id, fr.recipient_id))
  order by fr.created_at desc;
$$;

-- Friend activity respects each friend's share_activity_with_friends setting.
create or replace function public.get_friends_overview() returns table (
  friend_id uuid,
  display_name text,
  username text,
  total_xp int,
  shares_activity boolean,
  weekly_xp bigint,
  last_active date,
  recent_days date[]
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username::text, p.total_xp, p.share_activity_with_friends,
    case when p.share_activity_with_friends then (
      select coalesce(sum(x.amount), 0)::bigint from public.xp_transactions x
      where x.user_id = p.id and x.created_at >= date_trunc('week', now())
    ) end,
    case when p.share_activity_with_friends then (
      select max(da.activity_date) from public.daily_activity da where da.user_id = p.id
    ) end,
    case when p.share_activity_with_friends then (
      select coalesce(array_agg(t.activity_date order by t.activity_date), '{}') from (
        select da.activity_date from public.daily_activity da
        where da.user_id = p.id and da.activity_date >= current_date - 60
      ) t
    ) end
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = (select auth.uid())
  order by p.display_name;
$$;

revoke execute on function public.assert_registered() from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(uuid) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.list_friend_requests() from public, anon;
revoke execute on function public.get_friends_overview() from public, anon;
grant execute on function public.assert_registered() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.get_friends_overview() to authenticated;

revoke execute on function public.is_room_member(uuid) from public, anon;
revoke execute on function public.is_match_member(uuid) from public, anon;
revoke execute on function public.can_access_room_topic(text) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_match_member(uuid) to authenticated;
grant execute on function public.can_access_room_topic(text) to authenticated;
