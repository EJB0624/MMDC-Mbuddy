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
  goal text not null check (char_length(goal) between 1 and 500),
  work_style text not null check (work_style in ('Morning', 'Afternoon', 'Evening', 'Flexible')),
  created_at timestamptz not null default now()
);

create table if not exists public.saved_buddies (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

alter table public.profiles enable row level security;
alter table public.saved_buddies enable row level security;

create policy "Profiles are publicly readable"
on public.profiles for select
to anon, authenticated
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
