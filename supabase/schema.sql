create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  course_specialization text not null check (course_specialization in (
    'BSIT - Software Development',
    'BSIT - Network and Cybersecurity',
    'BSIT - Data Analytics',
    'BSIT - Marketing Technology',
    'BSIT - Entrepreneurial Technology',
    'BSIT - AI-Powered Product Development',
    'BSBA - Marketing Management',
    'BSBA - Human Resource Management',
    'BSBA - Operations Management',
    'BSBA - AI for Business Strategy and Operations'
  )),
  year_level smallint not null check (year_level between 1 and 4),
  term smallint constraint profiles_term_check check (term between 1 and 3),
  goal text not null check (char_length(goal) between 1 and 500),
  work_style text not null check (work_style in ('Morning', 'Afternoon', 'Evening', 'Flexible')),
  classes text[] not null default '{}'::text[] constraint profiles_classes_limit_check check (cardinality(classes) <= 8),
  time_slot text constraint profiles_time_slot_check check (time_slot in ('A', 'H', 'S')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists classes text[] not null default '{}'::text[];

alter table public.profiles
  add column if not exists time_slot text;

alter table public.profiles
  add column if not exists term smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_term_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_term_check check (term between 1 and 3);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_time_slot_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_time_slot_check check (time_slot in ('A', 'H', 'S'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_classes_limit_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_classes_limit_check check (cardinality(classes) <= 8);
  end if;
end $$;

create table if not exists public.saved_buddies (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);

create unique index if not exists buddy_requests_pair_unique
on public.buddy_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));

alter table public.profiles enable row level security;
alter table public.saved_buddies enable row level security;
alter table public.admins enable row level security;
alter table public.buddy_requests enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
drop policy if exists "Signed-in users can read profiles" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;
drop policy if exists "Users can read their saved profiles" on public.saved_buddies;
drop policy if exists "Users can save profiles" on public.saved_buddies;
drop policy if exists "Users can remove saved profiles" on public.saved_buddies;
drop policy if exists "Users can see their admin status" on public.admins;
drop policy if exists "Admins can delete any profile" on public.profiles;
drop policy if exists "Users can read their buddy requests" on public.buddy_requests;

create policy "Signed-in users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own profile"
on public.profiles for delete
to authenticated
using (auth.uid() = user_id);

create policy "Admins can delete any profile"
on public.profiles for delete
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

create policy "Users can see their admin status"
on public.admins for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their buddy requests"
on public.buddy_requests for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can read their saved profiles"
on public.saved_buddies for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save profiles"
on public.saved_buddies for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can remove saved profiles"
on public.saved_buddies for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists profiles_course_specialization_idx on public.profiles(course_specialization);
create index if not exists profiles_year_level_idx on public.profiles(year_level);
create index if not exists profiles_work_style_idx on public.profiles(work_style);
create index if not exists saved_buddies_user_idx on public.saved_buddies(user_id);
create index if not exists buddy_requests_sender_idx on public.buddy_requests(sender_id);
create index if not exists buddy_requests_receiver_idx on public.buddy_requests(receiver_id);

create or replace function public.send_buddy_request(target_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  existing_request public.buddy_requests%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue';
  end if;

  select * into current_profile
  from public.profiles
  where user_id = auth.uid();

  if current_profile.id is null then
    raise exception 'Create a profile before sending a BuddyUp request';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_profile_id;

  if target_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if target_profile.user_id = auth.uid() then
    raise exception 'You cannot send a BuddyUp request to yourself';
  end if;

  select * into existing_request
  from public.buddy_requests
  where (sender_id = auth.uid() and receiver_id = target_profile.user_id)
     or (sender_id = target_profile.user_id and receiver_id = auth.uid())
  limit 1;

  if existing_request.id is not null then
    if existing_request.status = 'accepted' then
      raise exception 'You are already buddies';
    end if;
    if existing_request.status = 'pending' then
      if existing_request.receiver_id = auth.uid() then
        raise exception 'This student already sent you a BuddyUp request';
      end if;
      raise exception 'BuddyUp request already sent';
    end if;

    update public.buddy_requests
    set sender_id = auth.uid(),
        receiver_id = target_profile.user_id,
        sender_profile_id = current_profile.id,
        receiver_profile_id = target_profile.id,
        status = 'pending',
        created_at = now(),
        responded_at = null
    where id = existing_request.id
    returning id into request_id;
    return request_id;
  end if;

  insert into public.buddy_requests (
    sender_id,
    receiver_id,
    sender_profile_id,
    receiver_profile_id
  ) values (
    auth.uid(),
    target_profile.user_id,
    current_profile.id,
    target_profile.id
  ) returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.respond_to_buddy_request(
  target_request_id uuid,
  accept_request boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue';
  end if;

  update public.buddy_requests
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where id = target_request_id
    and receiver_id = auth.uid()
    and status = 'pending'
  returning id into updated_request_id;

  if updated_request_id is null then
    raise exception 'BuddyUp request could not be updated';
  end if;
end;
$$;

create or replace function public.list_buddy_requests()
returns table (
  request_id uuid,
  request_status text,
  direction text,
  other_profile_id uuid,
  other_name text,
  other_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    request.id,
    request.status,
    case when request.sender_id = auth.uid() then 'outgoing' else 'incoming' end,
    other_profile.id,
    other_profile.first_name,
    case when request.status = 'accepted' then other_user.email::text else null end,
    request.created_at
  from public.buddy_requests request
  join public.profiles other_profile
    on other_profile.user_id = case
      when request.sender_id = auth.uid() then request.receiver_id
      else request.sender_id
    end
  join auth.users other_user on other_user.id = other_profile.user_id
  where request.sender_id = auth.uid() or request.receiver_id = auth.uid()
  order by
    case when request.status = 'pending' and request.receiver_id = auth.uid() then 0 else 1 end,
    request.created_at desc;
$$;

revoke all on function public.send_buddy_request(uuid) from public, anon;
revoke all on function public.respond_to_buddy_request(uuid, boolean) from public, anon;
revoke all on function public.list_buddy_requests() from public, anon;
grant execute on function public.send_buddy_request(uuid) to authenticated;
grant execute on function public.respond_to_buddy_request(uuid, boolean) to authenticated;
grant execute on function public.list_buddy_requests() to authenticated;
