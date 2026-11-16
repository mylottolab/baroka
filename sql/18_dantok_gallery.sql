-- =====================================================================
-- 💬 단톡방 — 나만의 갤러리 (블록 쌓기) (2026-11-17)
--   · 사람마다 앨범을 만들고 사진을 올립니다. 사진마다 블록 크기를 고릅니다:
--       1x1 작게 · 2x1 가로로 길게 · 1x2 세로로 길게 · 2x2 크게  → 화면이 빈칸을 메우며 쌓습니다.
--   · 순서는 끌어서 바꿉니다(pos). 사진마다 한 줄 설명.
--   · 공개 범위: 앨범마다 「all = 나와 같은 방에 있는 모든 사람」 · 「room = 이 방 사람만」.
--     모르는 사람은 볼 수 없습니다(같은 방에 있어야 함).
--   · 한도: 한 사람 200장(무료). 사진은 화면용(긴 쪽 1600px)과 작은 사진(400px)을 따로 올립니다.
--   · 파일은 프로필 사진과 같은 칸(dantok/av/<내 번호>/)에 둡니다 → 17번의 보관함 정책을 그대로 씁니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 17_dantok_avatar.sql 다음.
-- =====================================================================

create table if not exists public.dt_albums (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  title      text not null,
  scope      text not null default 'all',      -- all · room
  room_id    uuid references public.dt_rooms(id) on delete cascade,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dt_albums_user_idx on public.dt_albums (user_id);

create table if not exists public.dt_photos (
  id         bigserial primary key,
  album_id   uuid not null references public.dt_albums(id) on delete cascade,
  user_id    uuid not null,
  path       text not null,
  thumb      text not null,
  w          int, h int,
  size       bigint,
  span       text not null default '1x1',      -- 1x1 · 2x1 · 1x2 · 2x2
  pos        int not null default 0,
  caption    text,
  created_at timestamptz not null default now()
);
create index if not exists dt_photos_album_idx on public.dt_photos (album_id, pos);

alter table public.dt_albums enable row level security;
alter table public.dt_photos enable row level security;
revoke all on public.dt_albums, public.dt_photos from public, anon, authenticated;
grant  all on public.dt_albums, public.dt_photos to service_role;
grant  usage, select on sequence public.dt_photos_id_seq to service_role;

-- 이 앨범을 내가 볼 수 있나
create or replace function public._dt_album_can(a dt_albums) returns boolean language sql stable security definer set search_path = public as $$
  select a.user_id = auth.uid()
      or (a.scope = 'all' and dt_shares_room(a.user_id))
      or (a.scope = 'room' and a.room_id is not null and dt_is_member(a.room_id)
          and exists (select 1 from dt_members m where m.room_id = a.room_id and m.user_id = a.user_id and m.state = 'in'))
$$;

create or replace function public._dt_file_ok(p text) returns boolean language sql stable as $$
  select p ~ ('^av/' || auth.uid()::text || '/[A-Za-z0-9_-]{1,60}\.jpg$')
$$;

-- 한 사람의 갤러리 (앨범 목록 + 표지 작은 사진 + 장수). p_room: 지금 보고 있는 방(이 방 공개 앨범 판단용)
create or replace function public.dt_gal_user(p_room uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not dt_shares_room(p_user) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'mine', p_user = auth.uid(),
    'nick', (select nick from dt_members where room_id = p_room and user_id = p_user),
    'count', (select count(*) from dt_photos where user_id = p_user), 'limit', 200,
    'albums', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'scope', a.scope, 'room_id', a.room_id,
                 'room_name', (select name from dt_rooms where id = a.room_id),
                 'n', (select count(*) from dt_photos p where p.album_id = a.id),
                 'cover', (select p.thumb from dt_photos p where p.album_id = a.id order by p.pos, p.id limit 1))
                 order by a.sort, a.created_at desc), '[]'::jsonb)
               from dt_albums a where a.user_id = p_user and _dt_album_can(a)));
end $$;

create or replace function public.dt_gal_album(p_album uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a dt_albums;
begin
  select * into a from dt_albums where id = p_album;
  if a.id is null or not _dt_album_can(a) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'album', jsonb_build_object('id', a.id, 'title', a.title, 'scope', a.scope, 'room_id', a.room_id, 'mine', a.user_id = auth.uid()),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'thumb', p.thumb, 'w', p.w, 'h', p.h, 'span', p.span, 'caption', p.caption, 't', p.created_at)
                 order by p.pos, p.id), '[]'::jsonb) from dt_photos p where p.album_id = a.id));
end $$;

-- 앨범 만들기 · 고치기 (p_id 가 null 이면 새로)
create or replace function public.dt_album_save(p_id uuid, p_title text, p_scope text, p_room uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if char_length(btrim(coalesce(p_title, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if coalesce(p_scope, 'all') not in ('all', 'room') then return jsonb_build_object('ok', false, 'error', 'scope'); end if;
  if p_scope = 'room' and (p_room is null or not dt_is_member(p_room)) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if p_id is null then
    if (select count(*) from dt_albums where user_id = auth.uid()) >= 30 then return jsonb_build_object('ok', false, 'error', 'too_many_albums'); end if;
    insert into dt_albums (user_id, title, scope, room_id) values (auth.uid(), left(btrim(p_title), 30), coalesce(p_scope, 'all'), case when p_scope = 'room' then p_room end)
    returning id into v_id;
  else
    update dt_albums set title = left(btrim(p_title), 30), scope = coalesce(p_scope, 'all'), room_id = case when p_scope = 'room' then p_room end, updated_at = now()
     where id = p_id and user_id = auth.uid() returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 앨범 지우기 → 보관함에서 지울 파일 목록을 돌려줍니다(화면이 지웁니다)
create or replace function public.dt_album_del(p_album uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_paths jsonb;
begin
  if not exists (select 1 from dt_albums where id = p_album and user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_paths from (select path x from dt_photos where album_id = p_album union all select thumb from dt_photos where album_id = p_album) s;
  delete from dt_albums where id = p_album;
  return jsonb_build_object('ok', true, 'paths', v_paths);
end $$;

create or replace function public.dt_photo_add(p_album uuid, p_path text, p_thumb text, p_w int, p_h int, p_size bigint, p_caption text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from dt_albums where id = p_album and user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if not _dt_file_ok(p_path) or not _dt_file_ok(p_thumb) then return jsonb_build_object('ok', false, 'error', 'path'); end if;
  if (select count(*) from dt_photos where user_id = auth.uid()) >= 200 then return jsonb_build_object('ok', false, 'error', 'gal_full'); end if;
  if coalesce(p_size, 0) > 10485760 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  insert into dt_photos (album_id, user_id, path, thumb, w, h, size, caption, pos, span)
  values (p_album, auth.uid(), p_path, p_thumb, p_w, p_h, p_size, left(nullif(btrim(coalesce(p_caption, '')), ''), 100),
          coalesce((select max(pos) + 1 from dt_photos where album_id = p_album), 0),
          case when coalesce(p_w, 1) > coalesce(p_h, 1) * 1.6 then '2x1' when coalesce(p_h, 1) > coalesce(p_w, 1) * 1.6 then '1x2' else '1x1' end)
  returning id into v_id;
  update dt_albums set updated_at = now() where id = p_album;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.dt_photo_set(p_id bigint, p_span text, p_caption text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_span is not null and p_span not in ('1x1', '2x1', '1x2', '2x2') then return jsonb_build_object('ok', false, 'error', 'span'); end if;
  update dt_photos set span = coalesce(p_span, span), caption = left(nullif(btrim(coalesce(p_caption, '')), ''), 100) where id = p_id and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 순서 바꾸기: 사진 번호를 새 순서대로 (["12","9","15", …])
create or replace function public.dt_photo_order(p_album uuid, p_ids jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dt_albums where id = p_album and user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  update dt_photos p set pos = x.ord - 1
    from (select v::bigint as id, ord from jsonb_array_elements_text(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end) with ordinality as t(v, ord) where v ~ '^[0-9]+$') x
   where p.id = x.id and p.album_id = p_album;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_photo_del(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p dt_photos;
begin
  delete from dt_photos where id = p_id and user_id = auth.uid() returning * into p;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true, 'paths', jsonb_build_array(p.path, p.thumb));
end $$;

-- 내가 올린 갤러리 파일은 내가 지울 수 있게 (av/<내 번호>/)
drop policy if exists "dantok avatar delete" on storage.objects;
create policy "dantok avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dantok' and (storage.foldername(name))[1] = 'av' and (storage.foldername(name))[2] = auth.uid()::text);

do $$ declare f text; begin
  foreach f in array array['dt_gal_user(uuid, uuid)', 'dt_gal_album(uuid)', 'dt_album_save(uuid, text, text, uuid)', 'dt_album_del(uuid)',
                           'dt_photo_add(uuid, text, text, int, int, bigint, text)', 'dt_photo_set(bigint, text, text)', 'dt_photo_order(uuid, jsonb)', 'dt_photo_del(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public._dt_album_can(dt_albums) from public, anon, authenticated';
end $$;

select 'dantok gallery ok' as result;
