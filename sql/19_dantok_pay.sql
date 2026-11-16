-- =====================================================================
-- 💬 단톡방 — 이용권 · 저장권 · 갤러리 늘리기 (돈은 쓰는 본인이 냅니다) (2026-11-17)
--   상품 (자동 결제 없음 · 애플은 끝에 _nr)
--     dantok_room_1y   9,900원  방 이용 기간 1년 연장 (방장)
--     dantok_room_10g  7,900원  방 저장 공간 +10GB, 1년 (방장)
--     dantok_gal_5g    4,900원  내 갤러리 5GB, 1년 — 사진 장수 제한 없음 · 동영상 올리기 가능
--     dantok_gal_15g   9,900원  내 갤러리 15GB, 1년 — 〃
--   무료 갤러리: 사진 200장 · 500MB 까지, 동영상은 갤러리 이용권이 있어야 올립니다(올리기 전에 한도를 알려 줍니다).
--   결제 확인: aliascall-google-verify(구글 · 애플) · aliascall-web-pay(이니시스) 가 dt_can_pay · dt_grant_paid 를 부릅니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 18_dantok_gallery.sql 다음.
-- =====================================================================

create table if not exists public.dt_room_packs (
  id         bigserial primary key,
  room_id    uuid not null references public.dt_rooms(id) on delete cascade,
  bytes      bigint not null,
  until      timestamptz not null,
  payment_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.dt_user_plan (
  user_id    uuid primary key,
  gal_bytes  bigint not null default 0,
  until      timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.dt_pay_log (
  payment_id uuid primary key,
  user_id    uuid not null,
  sku        text not null,
  target     text,
  result     jsonb,
  source     text,
  created_at timestamptz not null default now()
);
alter table public.dt_room_packs enable row level security;
alter table public.dt_user_plan  enable row level security;
alter table public.dt_pay_log    enable row level security;
revoke all on public.dt_room_packs, public.dt_user_plan, public.dt_pay_log from public, anon, authenticated;
grant  all on public.dt_room_packs, public.dt_user_plan, public.dt_pay_log to service_role;
grant  usage, select on sequence public.dt_room_packs_id_seq to service_role;

alter table public.dt_photos add column if not exists kind text not null default 'photo';   -- photo · video
alter table public.dt_photos add column if not exists secs int;

-- 방 저장 공간 = 기본 3GB + 아직 기간 안의 저장권
create or replace function public._dt_requota(p_room uuid) returns bigint language sql security definer set search_path = public as $$
  update dt_rooms set quota_bytes = 3221225472 + coalesce((select sum(bytes) from dt_room_packs where room_id = p_room and until > now()), 0)
   where id = p_room returning quota_bytes;
$$;

-- 내 갤러리 한도
create or replace function public._dt_gal_limit(p_user uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.until > now() and p.gal_bytes > 0
              then jsonb_build_object('paid', true, 'bytes', p.gal_bytes, 'photos', null, 'video', true, 'until', p.until)
              else jsonb_build_object('paid', false, 'bytes', 524288000, 'photos', 200, 'video', false, 'until', p.until) end
    from (select (select gal_bytes from dt_user_plan where user_id = p_user) as gal_bytes, (select until from dt_user_plan where user_id = p_user) as until) p
$$;

create or replace function public.dt_gal_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select _dt_gal_limit(auth.uid()) || jsonb_build_object(
    'count', (select count(*) from dt_photos where user_id = auth.uid()),
    'used', (select coalesce(sum(size), 0) from dt_photos where user_id = auth.uid()))
$$;

-- 갤러리에 사진 · 동영상 넣기 (18번의 7칸짜리는 지웁니다)
drop function if exists public.dt_photo_add(uuid, text, text, int, int, bigint, text);
create or replace function public.dt_photo_add(p_album uuid, p_path text, p_thumb text, p_w int, p_h int, p_size bigint, p_caption text default null,
                                               p_kind text default 'photo', p_secs int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint; lim jsonb := _dt_gal_limit(auth.uid()); v_used bigint; v_cnt int; v_kind text := coalesce(p_kind, 'photo');
begin
  if not exists (select 1 from dt_albums where id = p_album and user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if v_kind not in ('photo', 'video') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  if not _dt_file_ok(p_thumb) then return jsonb_build_object('ok', false, 'error', 'path'); end if;
  if v_kind = 'photo' and not _dt_file_ok(p_path) then return jsonb_build_object('ok', false, 'error', 'path'); end if;
  if v_kind = 'video' and p_path !~ ('^av/' || auth.uid()::text || '/[A-Za-z0-9_-]{1,60}\.(mp4|mov|webm|m4v)$') then return jsonb_build_object('ok', false, 'error', 'path'); end if;
  if v_kind = 'video' and not (lim->>'video')::boolean then return jsonb_build_object('ok', false, 'error', 'need_plan'); end if;
  if coalesce(p_size, 0) <= 0 or p_size > (case when v_kind = 'video' then 104857600 else 10485760 end) then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  select count(*), coalesce(sum(size), 0) into v_cnt, v_used from dt_photos where user_id = auth.uid();
  if lim->>'photos' is not null and v_cnt >= (lim->>'photos')::int then return jsonb_build_object('ok', false, 'error', 'gal_full'); end if;
  if v_used + p_size > (lim->>'bytes')::bigint then return jsonb_build_object('ok', false, 'error', 'gal_full'); end if;
  insert into dt_photos (album_id, user_id, path, thumb, w, h, size, caption, pos, span, kind, secs)
  values (p_album, auth.uid(), p_path, p_thumb, p_w, p_h, p_size, left(nullif(btrim(coalesce(p_caption, '')), ''), 100),
          coalesce((select max(pos) + 1 from dt_photos where album_id = p_album), 0),
          case when coalesce(p_w, 1) > coalesce(p_h, 1) * 1.6 then '2x1' when coalesce(p_h, 1) > coalesce(p_w, 1) * 1.6 then '1x2' else '1x1' end,
          v_kind, least(greatest(p_secs, 0), 3600))
  returning id into v_id;
  update dt_albums set updated_at = now() where id = p_album;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 앨범 안 목록에 종류 · 길이 (18번의 것 + kind · secs)
create or replace function public.dt_gal_album(p_album uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a dt_albums;
begin
  select * into a from dt_albums where id = p_album;
  if a.id is null or not _dt_album_can(a) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'album', jsonb_build_object('id', a.id, 'title', a.title, 'scope', a.scope, 'room_id', a.room_id, 'mine', a.user_id = auth.uid()),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'thumb', p.thumb, 'w', p.w, 'h', p.h, 'span', p.span, 'caption', p.caption,
                 'kind', p.kind, 'secs', p.secs, 't', p.created_at) order by p.pos, p.id), '[]'::jsonb) from dt_photos p where p.album_id = a.id));
end $$;

-- 결제 전에: 살 수 있는가 (서버 함수가 부릅니다)
create or replace function public.dt_can_pay(p_user uuid, p_sku text, p_target text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is null then return false; end if;
  if p_sku in ('dantok_room_1y', 'dantok_room_10g') then
    return p_target ~ '^[0-9a-f-]{36}$' and exists (select 1 from dt_rooms where id = p_target::uuid and owner_id = p_user and status <> 'closed');
  end if;
  return p_sku in ('dantok_gal_5g', 'dantok_gal_15g');
end $$;

-- 결제가 확인되면: 한 번만 넣습니다(같은 결제를 두 번 불러도 한 번)
create or replace function public.dt_grant_paid(p_user uuid, p_sku text, p_target text, p_payment uuid, p_source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l dt_pay_log; r dt_rooms; v jsonb; v_until timestamptz; v_bytes bigint;
begin
  select * into l from dt_pay_log where payment_id = p_payment;
  if l.payment_id is not null then return coalesce(l.result, '{}'::jsonb) || jsonb_build_object('already', true); end if;
  if not dt_can_pay(p_user, p_sku, p_target) then return jsonb_build_object('ok', false, 'error', 'no_target'); end if;
  if p_sku = 'dantok_room_1y' then
    update dt_rooms set until = greatest(until, now()) + interval '12 months', updated_at = now() where id = p_target::uuid returning * into r;
    perform _dt_sys(r.id, '🎉 방장이 이용 기간을 ' || to_char(r.until at time zone 'Asia/Seoul', 'YYYY.MM.DD') || '까지 늘렸어요.');
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'room', 'until', r.until);
  elsif p_sku = 'dantok_room_10g' then
    insert into dt_room_packs (room_id, bytes, until, payment_id) values (p_target::uuid, 10737418240, now() + interval '12 months', p_payment);
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'room_storage', 'quota', _dt_requota(p_target::uuid));
  else
    v_bytes := case p_sku when 'dantok_gal_15g' then 16106127360 else 5368709120 end;
    insert into dt_user_plan (user_id, gal_bytes, until) values (p_user, v_bytes, now() + interval '12 months')
    on conflict (user_id) do update set
      gal_bytes = case when dt_user_plan.until > now() then greatest(dt_user_plan.gal_bytes, excluded.gal_bytes) else excluded.gal_bytes end,
      until = greatest(coalesce(dt_user_plan.until, now()), now()) + interval '12 months', updated_at = now()
    returning until, gal_bytes into v_until, v_bytes;
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'gallery', 'until', v_until, 'bytes', v_bytes);
  end if;
  insert into dt_pay_log (payment_id, user_id, sku, target, result, source) values (p_payment, p_user, p_sku, p_target, v, p_source);
  return v;
end $$;

-- 저장권 기간이 끝난 방은 저장 공간을 원래대로 (사라지는 메시지 정리와 함께 10분마다)
create or replace function public.dt_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int; x record;
begin
  insert into dt_trash (path) select file_path from dt_msgs where expires_at < now() and file_path is not null on conflict do nothing;
  update dt_rooms r set used_bytes = greatest(0, r.used_bytes - y.s)
    from (select room_id, sum(file_size) s from dt_msgs where expires_at < now() and file_size is not null and not deleted group by room_id) y
   where r.id = y.room_id;
  delete from dt_msgs where expires_at < now();
  get diagnostics n = row_count;
  for x in select distinct room_id from dt_room_packs where until <= now() and until > now() - interval '1 day' loop perform _dt_requota(x.room_id); end loop;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['dt_gal_status()', 'dt_photo_add(uuid, text, text, int, int, bigint, text, text, int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['dt_can_pay(uuid, text, text)', 'dt_grant_paid(uuid, text, text, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['_dt_requota(uuid)', '_dt_gal_limit(uuid)', 'dt_purge()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

select 'dantok pay ok' as result;
