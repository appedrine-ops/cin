-- Cin database setup.
-- In Supabase: SQL Editor > New query > paste this whole file > Run.
-- Safe to run again: it only creates what is missing and refreshes the rules.

-- ---------- tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  name text not null default '',
  bio text not null default '',
  created_at timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9._]{3,24}$'),
  constraint handle_reserved check (handle not in ('you','me','admin','cin','support','api','system')),
  constraint name_len check (char_length(name) <= 30),
  constraint bio_len check (char_length(bio) <= 80)
);
create unique index if not exists profiles_handle_key on public.profiles (lower(handle));

-- A handle is permanent once chosen.
create or replace function public.lock_handle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    raise exception 'handle cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists profiles_lock_handle on public.profiles;
create trigger profiles_lock_handle before update on public.profiles
  for each row execute function public.lock_handle();

create table if not exists public.posts (
  id text primary key check (id ~ '^[a-z0-9]{4,16}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id);

-- At most 200 posts per person.
create or replace function public.limit_posts() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.posts where user_id = new.user_id) >= 200 then
    raise exception 'post limit reached';
  end if;
  return new;
end $$;
drop trigger if exists posts_limit on public.posts;
create trigger posts_limit before insert on public.posts
  for each row execute function public.limit_posts();

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id text not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.reposts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id text not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id text not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);
create table if not exists public.comments (
  id text primary key check (id ~ '^[a-z0-9]{4,16}$'),
  post_id text not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id);

-- ---------- who can do what ----------

alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.likes    enable row level security;
alter table public.reposts  enable row level security;
alter table public.saves    enable row level security;
alter table public.follows  enable row level security;
alter table public.comments enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.posts, public.likes, public.reposts, public.follows, public.comments to anon, authenticated;
grant select on public.saves to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, delete on public.posts, public.likes, public.reposts, public.saves, public.follows, public.comments to authenticated;

-- Everyone can read the public feed, even before signing in.
drop policy if exists "read profiles"  on public.profiles;
drop policy if exists "read posts"     on public.posts;
drop policy if exists "read likes"     on public.likes;
drop policy if exists "read reposts"   on public.reposts;
drop policy if exists "read follows"   on public.follows;
drop policy if exists "read comments"  on public.comments;
create policy "read profiles" on public.profiles for select using (true);
create policy "read posts"    on public.posts    for select using (true);
create policy "read likes"    on public.likes    for select using (true);
create policy "read reposts"  on public.reposts  for select using (true);
create policy "read follows"  on public.follows  for select using (true);
create policy "read comments" on public.comments for select using (true);

-- Saved posts are private.
drop policy if exists "read own saves" on public.saves;
create policy "read own saves" on public.saves for select to authenticated using (user_id = (select auth.uid()));

-- You can only create or change your own things.
drop policy if exists "create own profile" on public.profiles;
drop policy if exists "edit own profile"   on public.profiles;
create policy "create own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "edit own profile"   on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "create own post" on public.posts;
drop policy if exists "delete own post" on public.posts;
create policy "create own post" on public.posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "delete own post" on public.posts for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own like"    on public.likes;
drop policy if exists "remove own like" on public.likes;
create policy "add own like"    on public.likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own like" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own repost"    on public.reposts;
drop policy if exists "remove own repost" on public.reposts;
create policy "add own repost"    on public.reposts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own repost" on public.reposts for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "add own save"    on public.saves;
drop policy if exists "remove own save" on public.saves;
create policy "add own save"    on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own save" on public.saves for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "follow as yourself" on public.follows;
drop policy if exists "unfollow as yourself" on public.follows;
create policy "follow as yourself"   on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "unfollow as yourself" on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

drop policy if exists "comment as yourself" on public.comments;
drop policy if exists "delete own comment"  on public.comments;
create policy "comment as yourself" on public.comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "delete own comment"  on public.comments for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- file storage for photos and videos ----------
-- Public to watch, but you can only add or remove files in your own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload to own folder" on storage.objects;
drop policy if exists "delete own files"     on storage.objects;
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- live updates ----------

do $$
declare t text;
begin
  foreach t in array array['profiles','posts','likes','reposts','follows','comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
