-- =====================================================================
-- 바로카 — 차 갤러리 (2026-11-03 · 회사 확인)
--   · 사진을 올리는 것은 바로카에 차를 등록한 분만. 보는 것은 누구나.
--   · 액자: 무료 4칸 + 20칸 1,100원 · 60칸 2,200원 (기한 없음 · 다 쓰면 또 삼). 지우면 칸이 다시 빔.
--   · 기본은 "모두에게 보이기", 사진마다 끌 수 있음(끄면 나만 보는 보관함).
--   · 차 번호는 어디에도 안 나옴(별명만). 촬영 장소 정보는 화면이 올리기 전에 지움.
--   · 신고 3번이면 저절로 숨김 → 관리자가 확인. 보기 싫은 사람은 "차단"(내 화면에서만 안 보임).
--
--   ⚠ 1_baroka.sql 을 먼저 Run 한 뒤 이 파일을 통째로 Run 합니다. 다시 돌려도 안전합니다.
-- =====================================================================

-- 권 종류에 액자 묶음(g20 · g60)을 더합니다 ------------------------------------
alter table public.baroka_credits drop constraint if exists baroka_credits_kind_check;
alter table public.baroka_credits add constraint baroka_credits_kind_check check (kind in ('reg', 'change', 'g20', 'g60'));

-- 값 -------------------------------------------------------------------------
alter table public.baroka_settings add column if not exists gallery_free  integer not null default 4;
alter table public.baroka_settings add column if not exists price_g20     integer not null default 1100;
alter table public.baroka_settings add column if not exists price_g60     integer not null default 2200;

-- 사진 ------------------------------------------------------------------------
create table if not exists public.baroka_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  path        text not null,                       -- 보관함(baroka-gallery) 안의 큰 그림
  thumb       text not null,                       -- 작은 그림(목록용)
  w           integer, h integer,
  caption     text not null default '',
  kind        text not null default 'car' check (kind in ('car', 'scene', 'tip')),   -- 내 차 · 풍경 · 팁
  public      boolean not null default true,
  hidden      boolean not null default false,      -- 신고 · 관리자로 숨김
  reports     integer not null default 0,
  likes       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists baroka_photos_feed_idx on public.baroka_photos(created_at desc) where public and not hidden;
create index if not exists baroka_photos_user_idx on public.baroka_photos(user_id);
alter table public.baroka_photos enable row level security;
revoke all on public.baroka_photos from anon, authenticated;

create table if not exists public.baroka_photo_likes (
  photo_id uuid not null references public.baroka_photos(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.baroka_photo_reports (
  photo_id uuid not null references public.baroka_photos(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  reason   text not null default '',
  at       timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.baroka_blocks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  at         timestamptz not null default now(),
  primary key (user_id, blocked)
);
alter table public.baroka_photo_likes enable row level security;
alter table public.baroka_photo_reports enable row level security;
alter table public.baroka_blocks enable row level security;
revoke all on public.baroka_photo_likes, public.baroka_photo_reports, public.baroka_blocks from anon, authenticated;

-- 별명(차 번호 대신) --------------------------------------------------------------
create or replace function public.baroka_nick(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), '바로카 차주') from profiles where id = p_user
$$;

-- 내 액자 수 = 차를 등록한 적이 있으면 4 + 산 묶음 -------------------------------------
create or replace function public.baroka_gallery_cap(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from baroka_cars where user_id = p_user)
                or exists (select 1 from baroka_log where user_id = p_user and action = 'reg')
              then (select gallery_free from baroka_settings where id = 1) else 0 end
       + coalesce((select sum(case kind when 'g20' then 20 when 'g60' then 60 else 0 end)::int
                     from baroka_credits where user_id = p_user and kind in ('g20', 'g60')), 0)
$$;

-- 내 갤러리 ----------------------------------------------------------------------
create or replace function public.baroka_gallery_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  return jsonb_build_object('ok', true,
    'can_post', exists (select 1 from baroka_cars where user_id = v_uid) or exists (select 1 from baroka_log where user_id = v_uid and action = 'reg'),
    'cap', baroka_gallery_cap(v_uid),
    'used', (select count(*) from baroka_photos where user_id = v_uid),
    'nick', baroka_nick(v_uid),
    'price_g20', (select price_g20 from baroka_settings where id = 1),
    'price_g60', (select price_g60 from baroka_settings where id = 1),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', path, 'thumb', thumb, 'w', w, 'h', h, 'caption', caption,
                         'kind', kind, 'public', public, 'hidden', hidden, 'likes', likes, 'at', created_at) order by created_at desc)
                        from baroka_photos where user_id = v_uid), '[]'::jsonb));
end $$;

-- 올리기 (그림은 화면이 먼저 보관함에 올리고, 여기서 칸을 확인하고 적습니다) -----------------
create or replace function public.baroka_gallery_add(p_path text, p_thumb text, p_w integer, p_h integer, p_caption text, p_kind text, p_public boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if baroka_gallery_cap(v_uid) = 0 then return jsonb_build_object('ok', false, 'error', 'no_car'); end if;
  if (select count(*) from baroka_photos where user_id = v_uid) >= baroka_gallery_cap(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  -- 내 칸(내 번호로 시작하는 곳)에 올린 그림만
  if split_part(coalesce(p_path, ''), '/', 1) <> v_uid::text or split_part(coalesce(p_thumb, ''), '/', 1) <> v_uid::text then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;
  insert into baroka_photos (user_id, path, thumb, w, h, caption, kind, public)
  values (v_uid, p_path, p_thumb, p_w, p_h, left(coalesce(p_caption, ''), 200),
          case when p_kind in ('car', 'scene', 'tip') then p_kind else 'car' end, coalesce(p_public, true))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.baroka_gallery_edit(p_id uuid, p_caption text, p_public boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update baroka_photos set caption = left(coalesce(p_caption, caption), 200), public = coalesce(p_public, public)
   where id = p_id and user_id = auth.uid();
  return jsonb_build_object('ok', found);
end $$;

-- 지우기 — 칸이 다시 빕니다. 그림 파일은 화면이 지웁니다(돌려준 path · thumb) ---------------
create or replace function public.baroka_gallery_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  delete from baroka_photos where id = p_id and user_id = auth.uid() returning path, thumb into v;
  if v.path is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true, 'path', v.path, 'thumb', v.thumb);
end $$;

-- 모두의 갤러리(누구나) — 최신순, 더 보기는 p_before ----------------------------------------
create or replace function public.baroka_gallery_feed(p_before timestamptz default null, p_limit integer default 30, p_kind text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'path', p.path, 'thumb', p.thumb, 'w', p.w, 'h', p.h, 'caption', p.caption, 'kind', p.kind,
             'likes', p.likes, 'at', p.created_at, 'nick', baroka_nick(p.user_id), 'mine', p.user_id = auth.uid(),
             'liked', exists (select 1 from baroka_photo_likes l where l.photo_id = p.id and l.user_id = auth.uid())) as x
      from baroka_photos p
     where p.public and not p.hidden
       and (p_before is null or p.created_at < p_before)
       and (p_kind is null or p.kind = p_kind)
       and not exists (select 1 from baroka_blocks b where b.user_id = auth.uid() and b.blocked = p.user_id)
     order by p.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) t
$$;

-- ♥ 좋아요 (누르면 켜고, 다시 누르면 끔) -------------------------------------------------
create or replace function public.baroka_gallery_like(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_on boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if exists (select 1 from baroka_photo_likes where photo_id = p_id and user_id = v_uid) then
    delete from baroka_photo_likes where photo_id = p_id and user_id = v_uid; v_on := false;
  else
    insert into baroka_photo_likes (photo_id, user_id) values (p_id, v_uid) on conflict do nothing; v_on := true;
  end if;
  update baroka_photos set likes = (select count(*) from baroka_photo_likes where photo_id = p_id) where id = p_id;
  return jsonb_build_object('ok', true, 'on', v_on, 'likes', (select likes from baroka_photos where id = p_id));
end $$;

-- 신고 — 다른 분 3명이 신고하면 저절로 숨김(관리자가 다시 확인) ------------------------------
create or replace function public.baroka_gallery_report(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  insert into baroka_photo_reports (photo_id, user_id, reason) values (p_id, v_uid, left(coalesce(p_reason, ''), 60))
  on conflict (photo_id, user_id) do nothing;
  select count(*) into n from baroka_photo_reports where photo_id = p_id;
  update baroka_photos set reports = n, hidden = hidden or n >= 3 where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 차단 — 그 분의 사진이 내 화면에서 안 보입니다 -------------------------------------------
create or replace function public.baroka_gallery_block(p_photo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_who uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select user_id into v_who from baroka_photos where id = p_photo;
  if v_who is null or v_who = v_uid then return jsonb_build_object('ok', false); end if;
  insert into baroka_blocks (user_id, blocked) values (v_uid, v_who) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- 관리자: 신고된 사진 · 숨김 풀기 · 지우기 -----------------------------------------------
create or replace function public.baroka_admin_photos(p_show text default 'reported')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('ok', true, 'photos', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'thumb', p.thumb, 'path', p.path, 'caption', p.caption, 'nick', baroka_nick(p.user_id),
             'public', p.public, 'hidden', p.hidden, 'reports', p.reports, 'likes', p.likes, 'at', p.created_at,
             'reasons', (select string_agg(reason, ' · ') from baroka_photo_reports r where r.photo_id = p.id)) order by p.reports desc, p.created_at desc)
      from (select * from baroka_photos
             where case when p_show = 'all' then true else reports > 0 or hidden end
             order by created_at desc limit 200) p), '[]'::jsonb),
    'total', (select count(*) from baroka_photos), 'public', (select count(*) from baroka_photos where public and not hidden));
end $$;

create or replace function public.baroka_admin_photo(p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  if p_action = 'hide' then update baroka_photos set hidden = true where id = p_id;
  elsif p_action = 'show' then
    delete from baroka_photo_reports where photo_id = p_id;
    update baroka_photos set hidden = false, reports = 0 where id = p_id;
  elsif p_action = 'delete' then
    delete from baroka_photos where id = p_id returning path, thumb into v;
    return jsonb_build_object('ok', true, 'path', v.path, 'thumb', v.thumb);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 그림 보관함: 누구나 보기(공개 사진의 주소를 아는 경우) · 내 칸에만 올리기 · 내 것만 지우기 ---------
--   ⚠ 나만 보기 사진도 주소를 알면 열립니다(주소는 길고 맞히기 어려운 번호). 목록에는 절대 나오지 않습니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('baroka-gallery', 'baroka-gallery', true, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];
drop policy if exists baroka_gallery_read on storage.objects;
create policy baroka_gallery_read on storage.objects for select using (bucket_id = 'baroka-gallery');
drop policy if exists baroka_gallery_write on storage.objects;
create policy baroka_gallery_write on storage.objects for insert to authenticated
  with check (bucket_id = 'baroka-gallery' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists baroka_gallery_del on storage.objects;
create policy baroka_gallery_del on storage.objects for delete to authenticated
  using (bucket_id = 'baroka-gallery' and ((storage.foldername(name))[1] = auth.uid()::text or coalesce(public.is_global_admin(), false)));

-- 누가 부를 수 있나 -----------------------------------------------------------------
revoke execute on function public.baroka_gallery_cap(uuid) from public, anon, authenticated;
revoke execute on function public.baroka_nick(uuid) from public, anon, authenticated;
revoke execute on function public.baroka_gallery_mine() from public, anon;
revoke execute on function public.baroka_gallery_add(text, text, integer, integer, text, text, boolean) from public, anon;
revoke execute on function public.baroka_gallery_edit(uuid, text, boolean) from public, anon;
revoke execute on function public.baroka_gallery_delete(uuid) from public, anon;
revoke execute on function public.baroka_gallery_like(uuid) from public, anon;
revoke execute on function public.baroka_gallery_report(uuid, text) from public, anon;
revoke execute on function public.baroka_gallery_block(uuid) from public, anon;
revoke execute on function public.baroka_admin_photos(text) from public, anon;
revoke execute on function public.baroka_admin_photo(uuid, text) from public, anon;
grant execute on function public.baroka_gallery_mine() to authenticated;
grant execute on function public.baroka_gallery_add(text, text, integer, integer, text, text, boolean) to authenticated;
grant execute on function public.baroka_gallery_edit(uuid, text, boolean) to authenticated;
grant execute on function public.baroka_gallery_delete(uuid) to authenticated;
grant execute on function public.baroka_gallery_like(uuid) to authenticated;
grant execute on function public.baroka_gallery_report(uuid, text) to authenticated;
grant execute on function public.baroka_gallery_block(uuid) to authenticated;
grant execute on function public.baroka_admin_photos(text) to authenticated;
grant execute on function public.baroka_admin_photo(uuid, text) to authenticated;
grant execute on function public.baroka_gallery_feed(timestamptz, integer, text) to anon, authenticated;
grant all on public.baroka_photos, public.baroka_photo_likes, public.baroka_photo_reports, public.baroka_blocks to service_role;

select 'baroka gallery ok' as result, (select count(*) from baroka_photos) as photos;
