-- Mergezy: daily leaderboard tables + RPCs.
-- Lives in the same Supabase project as the other bgameworld games, so one
-- account works across all of them. Same design as Sortezy: tables are
-- public-readable where needed and never directly writable — every write goes
-- through a SECURITY DEFINER function that takes the player's identity from
-- auth.uid(), not from anything the client sends.
--
-- The daily gives three tries; each try is stored under its number (1–3), so
-- sending the same try twice changes nothing and a fourth try can't exist.
-- A player's best try is their score for the day.

create table if not exists public.mergezy_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.mergezy_tries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  puzzle_date date not null,
  try_no smallint not null check (try_no between 1 and 3),
  score integer not null check (score between 0 and 1000000),
  -- Highest tile made (1–6; 6 means a burst).
  best smallint not null check (best between 1 and 6),
  -- Tiles placed. A 5x5 board needs at least 25 to fill.
  turns integer not null check (turns between 25 and 5000),
  created_at timestamptz not null default now(),
  constraint mergezy_tries_player_date_try_key unique (player_id, puzzle_date, try_no)
);

create index if not exists mergezy_tries_date_score_idx
  on public.mergezy_tries (puzzle_date, score desc);

alter table public.mergezy_profiles enable row level security;
alter table public.mergezy_tries enable row level security;

drop policy if exists mergezy_profiles_select_own on public.mergezy_profiles;
create policy mergezy_profiles_select_own on public.mergezy_profiles
  for select using (id = (select auth.uid()));

drop policy if exists mergezy_tries_public_read on public.mergezy_tries;
create policy mergezy_tries_public_read on public.mergezy_tries
  for select using (true);

-- Sets (or changes) the caller's display name.
create or replace function public.mergezy_update_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(coalesce(trim(p_display_name), '')) < 1 or char_length(trim(p_display_name)) > 20 then
    raise exception 'invalid display_name';
  end if;

  insert into public.mergezy_profiles (id, display_name)
  values (auth.uid(), trim(p_display_name))
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

-- Returns the caller's display name for this game. A signed-in (non-guest)
-- player with a name in another bgameworld game gets it copied over the first
-- time. The other games' profile tables are looked up only if they exist, so
-- this works whichever of their migrations have been run.
create or replace function public.mergezy_ensure_profile()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_table text;
begin
  if v_uid is null then
    return null;
  end if;

  select display_name into v_name from public.mergezy_profiles where id = v_uid;
  if v_name is not null or v_is_anon then
    return v_name;
  end if;

  foreach v_table in array array['sortezy_profiles', 'wordezy_ladder_profiles', 'wordezy_scramble_profiles', 'wordezy_search_profiles', 'profiles'] loop
    exit when v_name is not null;
    if to_regclass('public.' || v_table) is not null then
      execute format('select display_name from public.%I where id = $1', v_table) into v_name using v_uid;
    end if;
  end loop;

  v_name := left(trim(coalesce(v_name, '')), 20);
  if v_name = '' then
    v_name := 'Player';
  end if;

  insert into public.mergezy_profiles (id, display_name)
  values (v_uid, v_name)
  on conflict (id) do nothing;
  return v_name;
end;
$$;

-- Records one finished daily try. Re-sending a try that's already stored
-- does nothing.
create or replace function public.submit_mergezy_score(p_puzzle_date date, p_try_no integer, p_score integer, p_best integer, p_turns integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_banned boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_try_no is null or p_try_no < 1 or p_try_no > 3 then
    raise exception 'invalid try_no';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000000 then
    raise exception 'invalid score';
  end if;
  if p_best is null or p_best < 1 or p_best > 6 then
    raise exception 'invalid best';
  end if;
  if p_turns is null or p_turns < 25 or p_turns > 5000 then
    raise exception 'invalid turns';
  end if;
  -- Daily puzzles roll over at midnight UTC; allow one day either side for
  -- players finishing across the boundary, but never a far past/future date.
  if p_puzzle_date is null or abs(p_puzzle_date - (now() at time zone 'utc')::date) > 1 then
    raise exception 'invalid puzzle_date';
  end if;
  -- Accounts banned in the shared profiles table (When & Where / Wordezy).
  -- Looked up dynamically so this works in a project without that table.
  if to_regclass('public.profiles') is not null then
    execute 'select exists (select 1 from public.profiles where id = $1 and is_banned)' into v_banned using auth.uid();
    if v_banned then
      raise exception 'account suspended';
    end if;
  end if;

  select display_name into v_name from public.mergezy_profiles where id = auth.uid();
  if v_name is null then
    raise exception 'profile not set up';
  end if;

  insert into public.mergezy_tries (player_id, display_name, puzzle_date, try_no, score, best, turns)
  values (auth.uid(), v_name, p_puzzle_date, p_try_no, p_score, p_best, p_turns)
  on conflict (player_id, puzzle_date, try_no) do nothing;
end;
$$;

-- Each player's best try for one day, highest first; the earlier of two equal
-- scores ranks higher.
create or replace function public.mergezy_daily_leaderboard(p_puzzle_date date, p_limit integer default 10)
returns table (player_id uuid, display_name text, score integer, best smallint, tries bigint)
language sql
stable
set search_path = public
as $$
  select x.player_id, x.display_name, x.score, x.best, x.tries
  from (
    select t.player_id, t.display_name, t.score, t.best, t.created_at,
           count(*) over (partition by t.player_id) as tries,
           row_number() over (partition by t.player_id order by t.score desc, t.created_at asc) as rn
    from public.mergezy_tries t
    where t.puzzle_date = p_puzzle_date
  ) x
  where x.rn = 1
  order by x.score desc, x.created_at asc
  limit greatest(1, least(p_limit, 100))
$$;

-- "312 players today · average 840 · best 2,410" (average of each player's best).
create or replace function public.mergezy_daily_stats(p_puzzle_date date)
returns table (players bigint, average numeric, best integer)
language sql
stable
set search_path = public
as $$
  select count(*), coalesce(round(avg(b.top)), 0), coalesce(max(b.top), 0)
  from (
    select max(t.score) as top
    from public.mergezy_tries t
    where t.puzzle_date = p_puzzle_date
    group by t.player_id
  ) b
$$;

-- All-time standings: most days played, then highest single score.
create or replace function public.mergezy_alltime_leaderboard(p_limit integer default 10)
returns table (player_id uuid, display_name text, days bigint, top_score integer)
language sql
stable
set search_path = public
as $$
  select
    t.player_id,
    (array_agg(t.display_name order by t.created_at desc))[1] as display_name,
    count(distinct t.puzzle_date) as days,
    max(t.score) as top_score
  from public.mergezy_tries t
  group by t.player_id
  order by days desc, top_score desc
  limit greatest(1, least(p_limit, 100))
$$;

-- Functions are executable by PUBLIC by default in Postgres; lock the
-- writers down to signed-in sessions (guests are signed in anonymously and
-- carry the "authenticated" role too) and leave the readers open.
revoke all on function public.mergezy_update_profile(text) from public, anon;
revoke all on function public.mergezy_ensure_profile() from public, anon;
revoke all on function public.submit_mergezy_score(date, integer, integer, integer, integer) from public, anon;
grant execute on function public.mergezy_update_profile(text) to authenticated;
grant execute on function public.mergezy_ensure_profile() to authenticated;
grant execute on function public.submit_mergezy_score(date, integer, integer, integer, integer) to authenticated;
grant execute on function public.mergezy_daily_leaderboard(date, integer) to anon, authenticated;
grant execute on function public.mergezy_daily_stats(date) to anon, authenticated;
grant execute on function public.mergezy_alltime_leaderboard(integer) to anon, authenticated;
