create extension if not exists pgcrypto;

create table if not exists public.logo_vote_polls (
  id text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.logo_vote_admins (
  poll_id text primary key references public.logo_vote_polls(id) on delete cascade,
  admin_code text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.logo_vote_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null references public.logo_vote_polls(id) on delete cascade,
  option_id text not null,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_key)
);

alter table public.logo_vote_polls enable row level security;
alter table public.logo_vote_admins enable row level security;
alter table public.logo_vote_votes enable row level security;

drop policy if exists "logo vote polls are readable" on public.logo_vote_polls;
create policy "logo vote polls are readable"
on public.logo_vote_polls for select
to anon, authenticated
using (true);

drop policy if exists "logo vote votes are readable" on public.logo_vote_votes;
create policy "logo vote votes are readable"
on public.logo_vote_votes for select
to anon, authenticated
using (true);

drop policy if exists "logo vote votes are insertable" on public.logo_vote_votes;
create policy "logo vote votes are insertable"
on public.logo_vote_votes for insert
to anon, authenticated
with check (true);

revoke all on public.logo_vote_admins from anon, authenticated;

insert into public.logo_vote_polls (id, content)
values (
  'zaopianju-logo-2026',
  jsonb_build_object(
    'meaning',
    '我们希望这个 Logo 能代表「AI 生成影像」和「照片创作」的结合，也能承载 AI 写真、修图、课程、作品展示和视觉变现平台的长期品牌感。',
    'options',
    jsonb_build_array(
      jsonb_build_object('id', 'optionA', 'name', '方案 A', 'image', './assets/logos/logo-a.svg', 'keywords', jsonb_build_array('简洁', '年轻', 'AI 摄影感')),
      jsonb_build_object('id', 'optionB', 'name', '方案 B', 'image', './assets/logos/logo-b.svg', 'keywords', jsonb_build_array('亲和', '可爱', '用户感')),
      jsonb_build_object('id', 'optionC', 'name', '方案 C', 'image', './assets/logos/logo-c.svg', 'keywords', jsonb_build_array('专业', '平台', '品牌感'))
    )
  )
)
on conflict (id) do nothing;

insert into public.logo_vote_admins (poll_id, admin_code)
values ('zaopianju-logo-2026', 'zpj2026')
on conflict (poll_id) do nothing;

create or replace function public.save_logo_vote_poll(
  p_poll_id text,
  p_admin_code text,
  p_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_code text;
begin
  select admin_code into stored_code
  from public.logo_vote_admins
  where poll_id = p_poll_id;

  if stored_code is null or stored_code <> p_admin_code then
    raise exception 'invalid_admin_code';
  end if;

  insert into public.logo_vote_polls (id, content, updated_at)
  values (p_poll_id, p_content, now())
  on conflict (id) do update
  set content = excluded.content,
      updated_at = now();

  return p_content;
end;
$$;

create or replace function public.submit_logo_vote(
  p_poll_id text,
  p_option_id text,
  p_voter_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  insert into public.logo_vote_votes (poll_id, option_id, voter_key)
  values (p_poll_id, p_option_id, p_voter_key)
  on conflict (poll_id, voter_key) do nothing;

  select coalesce(jsonb_object_agg(option_id, vote_count), '{}'::jsonb)
  into result
  from (
    select option_id, count(*)::int as vote_count
    from public.logo_vote_votes
    where poll_id = p_poll_id
    group by option_id
  ) counts;

  return jsonb_build_object('votes', result);
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.logo_vote_polls to anon, authenticated;
grant select, insert on public.logo_vote_votes to anon, authenticated;
grant execute on function public.save_logo_vote_poll(text, text, jsonb) to anon, authenticated;
grant execute on function public.submit_logo_vote(text, text, text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.logo_vote_polls;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.logo_vote_votes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logo-vote-images',
  'logo-vote-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logo vote images are public" on storage.objects;
create policy "logo vote images are public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'logo-vote-images');

drop policy if exists "logo vote images can be uploaded" on storage.objects;
create policy "logo vote images can be uploaded"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'logo-vote-images');

drop policy if exists "logo vote images can be updated" on storage.objects;
create policy "logo vote images can be updated"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'logo-vote-images')
with check (bucket_id = 'logo-vote-images');
