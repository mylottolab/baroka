-- =====================================================================
-- 💬 단톡방 - 번호 없는 모임 (dantok.kr · com.weaveapp.dantok) — 1단계 문자방 (2026-11-17)
--   · 전화번호 · 가입 없이: 휴대폰마다 익명 로그인(Supabase anonymous) 하나 = 한 사람.
--     유심 없는 공기계 · 태블릿도 와이파이만 있으면 들어옵니다. 방 사람에게 번호는 보이지 않습니다.
--   · 방장이 방을 만들고 초대 코드(6자리) · 링크 · QR로 부릅니다. 방마다 별명을 따로 씁니다.
--   · 글 · 사진 · 동영상 · 음원 · 파일. 방장은 공지 · 이름 바꾸기 · 내보내기 · 방장 넘기기 · 초대 코드 새로.
--   · 신고 · 차단 · 알림 끄기 · 읽음(안 읽은 수).
--   · 요금: 방 하나에 붙습니다(방장만 냄). 처음 30일 무료, 기간이 끝나면 읽기만 됩니다.
--     문자방 300명 · 저장 3GB. 결제 · 추가 이용권은 다음 SQL에서.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요.
--   ⚠ Authentication → Sign In / Providers → 「Allow anonymous sign-ins」가 켜져 있어야 합니다.
-- =====================================================================

-- ① 표 ---------------------------------------------------------------
create table if not exists public.dt_rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- 초대 코드 6자리
  name        text not null,
  notice      text,
  owner_id    uuid not null,
  plan        text not null default 'text',          -- text(문자방) · call(통화방) · meet(회의방)
  until       timestamptz not null default now() + interval '30 days',
  max_members int not null default 300,
  quota_bytes bigint not null default 3221225472,    -- 3GB
  used_bytes  bigint not null default 0,
  ends_on     date,                                  -- 기한 있는 방(여행 · 행사): 이 날이 지나면 닫힘
  status      text not null default 'active',        -- active · closed · blocked(운영자)
  last_msg_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dt_rooms_owner_idx on public.dt_rooms (owner_id);

create table if not exists public.dt_members (
  room_id    uuid not null references public.dt_rooms(id) on delete cascade,
  user_id    uuid not null,
  nick       text not null,
  color      int  not null default 0,               -- 0~7 동그라미 색
  role       text not null default 'member',        -- owner · member
  last_read  bigint not null default 0,
  muted      boolean not null default false,
  state      text not null default 'in',            -- in · left · kicked
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists dt_members_user_idx on public.dt_members (user_id) where state = 'in';

create table if not exists public.dt_msgs (
  id         bigserial primary key,
  room_id    uuid not null references public.dt_rooms(id) on delete cascade,
  user_id    uuid,                                  -- null = 알림 글(입장 · 퇴장 등)
  kind       text not null default 'text',          -- text · photo · video · audio · file · system
  body       text,
  file_path  text,
  file_name  text,
  file_size  bigint,
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists dt_msgs_room_idx on public.dt_msgs (room_id, id desc);

create table if not exists public.dt_reports (
  id         bigserial primary key,
  room_id    uuid references public.dt_rooms(id) on delete cascade,
  msg_id     bigint,
  reporter   uuid,
  target     uuid,
  reason     text,
  status     text not null default 'open',          -- open · done
  created_at timestamptz not null default now()
);

create table if not exists public.dt_blocks (
  user_id    uuid not null,
  blocked    uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked)
);

create table if not exists public.dt_push (
  user_id    uuid primary key,
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now()
);

alter table public.dt_rooms   enable row level security;
alter table public.dt_members enable row level security;
alter table public.dt_msgs    enable row level security;
alter table public.dt_reports enable row level security;
alter table public.dt_blocks  enable row level security;
alter table public.dt_push    enable row level security;
revoke all on public.dt_rooms, public.dt_members, public.dt_msgs, public.dt_reports, public.dt_blocks, public.dt_push from public, anon, authenticated;
grant  all on public.dt_rooms, public.dt_members, public.dt_msgs, public.dt_reports, public.dt_blocks, public.dt_push to service_role;
grant  usage, select on sequence public.dt_msgs_id_seq, public.dt_reports_id_seq to service_role;

-- ② 도우미 ------------------------------------------------------------
create or replace function public._dt_code() returns text language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := ''; for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from dt_rooms where code = c);
  end loop;
  return c;
end $$;

-- 글을 쓸 수 있는 방인가 (기간 안 · 운영 중 · 기한 날짜 전)
create or replace function public._dt_live(r dt_rooms) returns boolean language sql stable as $$
  select r.status = 'active' and r.until > now() and (r.ends_on is null or r.ends_on >= (now() at time zone 'Asia/Seoul')::date)
$$;

-- 지금 로그인한 사람이 이 방 사람인가 (사진 보관함 정책에서도 씁니다)
create or replace function public.dt_is_member(p_room uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dt_members where room_id = p_room and user_id = auth.uid() and state = 'in')
$$;

create or replace function public._dt_sys(p_room uuid, p_body text) returns void language sql security definer set search_path = public as $$
  insert into dt_msgs (room_id, kind, body) values (p_room, 'system', p_body);
  update dt_rooms set last_msg_at = now() where id = p_room;
$$;

create or replace function public._dt_nick(p text) returns text language sql immutable as $$
  select left(nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), ''), 16)
$$;

create or replace function public._dt_room_json(r dt_rooms, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'notice', r.notice, 'plan', r.plan,
    'until', r.until, 'ends_on', r.ends_on, 'status', r.status, 'live', _dt_live(r),
    'max_members', r.max_members, 'quota_bytes', r.quota_bytes, 'used_bytes', r.used_bytes,
    'owner', r.owner_id = p_me,
    'me', (select jsonb_build_object('nick', m.nick, 'color', m.color, 'role', m.role, 'muted', m.muted, 'last_read', m.last_read)
             from dt_members m where m.room_id = r.id and m.user_id = p_me),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('uid', m.user_id, 'nick', m.nick, 'color', m.color, 'role', m.role,
                                  'me', m.user_id = p_me, 'blocked', exists (select 1 from dt_blocks b where b.user_id = p_me and b.blocked = m.user_id))
                                  order by (m.role = 'owner') desc, m.joined_at), '[]'::jsonb)
                  from dt_members m where m.room_id = r.id and m.state = 'in'))
$$;

-- ③ 방 만들기 · 들어가기 ------------------------------------------------
create or replace function public.dt_create(p_name text, p_nick text, p_ends_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text; v_nick text := _dt_nick(p_nick);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'no_nick'); end if;
  if (select count(*) from dt_rooms where owner_id = v_uid and status = 'active') >= 5 then return jsonb_build_object('ok', false, 'error', 'too_many_rooms'); end if;
  if p_ends_on is not null and p_ends_on < (now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('ok', false, 'error', 'bad_date'); end if;
  v_code := _dt_code();
  insert into dt_rooms (code, name, owner_id, ends_on) values (v_code, left(btrim(p_name), 30), v_uid, p_ends_on) returning id into v_id;
  insert into dt_members (room_id, user_id, nick, color, role) values (v_id, v_uid, v_nick, floor(random() * 8)::int, 'owner');
  perform _dt_sys(v_id, v_nick || '님이 방을 만들었어요.');
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end $$;

-- 초대 코드로 미리 보기 (들어가기 전: 방 이름 · 인원만)
create or replace function public.dt_peek(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('ok', true, 'name', r.name, 'count', (select count(*) from dt_members m where m.room_id = r.id and m.state = 'in'),
                     'live', _dt_live(r), 'full', (select count(*) from dt_members m where m.room_id = r.id and m.state = 'in') >= r.max_members,
                     'joined', exists (select 1 from dt_members m where m.room_id = r.id and m.user_id = auth.uid() and m.state = 'in'), 'id', r.id)
                     from dt_rooms r where r.code = upper(btrim(p_code)) and r.status <> 'closed'),
                  jsonb_build_object('ok', false, 'error', 'no_room'))
$$;

create or replace function public.dt_join(p_code text, p_nick text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r dt_rooms; m dt_members; v_nick text := _dt_nick(p_nick);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select * into r from dt_rooms where code = upper(btrim(p_code)) and status <> 'closed';
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'no_room'); end if;
  select * into m from dt_members where room_id = r.id and user_id = v_uid;
  if m.state = 'in' then return jsonb_build_object('ok', true, 'id', r.id, 'again', true); end if;
  if m.state = 'kicked' then return jsonb_build_object('ok', false, 'error', 'kicked'); end if;
  if r.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'no_nick'); end if;
  if (select count(*) from dt_members where room_id = r.id and state = 'in') >= r.max_members then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  insert into dt_members (room_id, user_id, nick, color, last_read) values (r.id, v_uid, v_nick, floor(random() * 8)::int,
         coalesce((select max(id) from dt_msgs where room_id = r.id), 0))
  on conflict (room_id, user_id) do update set state = 'in', nick = excluded.nick, joined_at = now(), last_read = excluded.last_read;
  perform _dt_sys(r.id, v_nick || '님이 들어왔어요.');
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

-- ④ 내 방 목록 · 방 정보 -----------------------------------------------
create or replace function public.dt_my()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'sort') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'owner', r.owner_id = auth.uid(), 'live', _dt_live(r),
      'until', r.until, 'muted', m.muted,
      'count', (select count(*) from dt_members x where x.room_id = r.id and x.state = 'in'),
      'unread', (select count(*) from dt_msgs g where g.room_id = r.id and g.id > m.last_read and g.user_id is distinct from auth.uid() and g.kind <> 'system' and not g.deleted),
      'last', (select jsonb_build_object('kind', g.kind, 'body', case when g.deleted then null else left(g.body, 60) end, 't', g.created_at,
                 'nick', (select n.nick from dt_members n where n.room_id = r.id and n.user_id = g.user_id))
                 from dt_msgs g where g.room_id = r.id order by g.id desc limit 1),
      'sort', coalesce(r.last_msg_at, r.created_at)) as x
    from dt_members m join dt_rooms r on r.id = m.room_id
    where m.user_id = auth.uid() and m.state = 'in' and r.status <> 'closed') s
$$;

create or replace function public.dt_room(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r dt_rooms;
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  return jsonb_build_object('ok', true, 'room', _dt_room_json(r, auth.uid()));
end $$;

-- ⑤ 글 ---------------------------------------------------------------
-- p_after: 이 번호 다음 새 글 / p_before: 이 번호 앞의 옛 글 (둘 다 없으면 마지막 50개)
create or replace function public.dt_msgs(p_room uuid, p_after bigint default null, p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'msgs', (
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'uid', g.user_id, 'kind', g.kind,
             'body', case when g.deleted then null else g.body end, 'deleted', g.deleted,
             'path', case when g.deleted then null else g.file_path end, 'fname', g.file_name, 'size', g.file_size, 't', g.created_at,
             'nick', n.nick, 'color', n.color, 'mine', g.user_id = v_uid) order by g.id), '[]'::jsonb)
    from (select * from dt_msgs g0
           where g0.room_id = p_room
             and (p_after is null or g0.id > p_after) and (p_before is null or g0.id < p_before)
             and (g0.user_id is null or not exists (select 1 from dt_blocks b where b.user_id = v_uid and b.blocked = g0.user_id))
           order by g0.id desc limit case when p_after is not null then 200 else 50 end) g
    left join dt_members n on n.room_id = g.room_id and n.user_id = g.user_id),
    'reads', (select coalesce(jsonb_agg(m.last_read), '[]'::jsonb) from dt_members m where m.room_id = p_room and m.state = 'in'));
end $$;

create or replace function public.dt_send(p_room uuid, p_kind text, p_body text, p_path text default null, p_name text default null, p_size bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r dt_rooms; v_id bigint; v_kind text := coalesce(p_kind, 'text');
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  if not _dt_live(r) then return jsonb_build_object('ok', false, 'error', case when r.until <= now() then 'expired' else 'closed' end); end if;
  if v_kind not in ('text', 'photo', 'video', 'audio', 'file') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  if v_kind = 'text' and char_length(btrim(coalesce(p_body, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if v_kind <> 'text' then
    if p_path is null or split_part(p_path, '/', 1) <> p_room::text then return jsonb_build_object('ok', false, 'error', 'path'); end if;
    if coalesce(p_size, 0) <= 0 or p_size > 104857600 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
    if r.used_bytes + p_size > r.quota_bytes then return jsonb_build_object('ok', false, 'error', 'quota'); end if;
    update dt_rooms set used_bytes = used_bytes + p_size where id = p_room;
  end if;
  -- 너무 빠른 연속 글(도배) 막기: 10초에 20개
  if (select count(*) from dt_msgs where room_id = p_room and user_id = v_uid and created_at > now() - interval '10 seconds') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'slow');
  end if;
  insert into dt_msgs (room_id, user_id, kind, body, file_path, file_name, file_size)
  values (p_room, v_uid, v_kind, left(nullif(btrim(coalesce(p_body, '')), ''), 2000), p_path, left(p_name, 120), p_size)
  returning id into v_id;
  update dt_rooms set last_msg_at = now() where id = p_room;
  update dt_members set last_read = v_id where room_id = p_room and user_id = v_uid;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.dt_read(p_room uuid, p_last bigint)
returns void language sql security definer set search_path = public as $$
  update dt_members set last_read = greatest(last_read, coalesce(p_last, 0)) where room_id = p_room and user_id = auth.uid() and state = 'in';
$$;

-- 내 글 지우기 (방장은 누구 글이든)
create or replace function public.dt_delete_msg(p_room uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g dt_msgs;
begin
  select * into g from dt_msgs where id = p_id and room_id = p_room;
  if g.id is null or g.kind = 'system' then return jsonb_build_object('ok', false, 'error', 'no_msg'); end if;
  if g.user_id is distinct from auth.uid() and not exists (select 1 from dt_rooms where id = p_room and owner_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_mine');
  end if;
  update dt_msgs set deleted = true where id = p_id;
  if g.file_size is not null and not g.deleted then update dt_rooms set used_bytes = greatest(0, used_bytes - g.file_size) where id = p_room; end if;
  return jsonb_build_object('ok', true, 'path', g.file_path);
end $$;

-- ⑥ 나 ---------------------------------------------------------------
create or replace function public.dt_set_me(p_room uuid, p_nick text, p_muted boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old text; v_nick text := _dt_nick(p_nick);
begin
  select nick into v_old from dt_members where room_id = p_room and user_id = auth.uid() and state = 'in';
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'no_nick'); end if;
  update dt_members set nick = v_nick, muted = coalesce(p_muted, muted) where room_id = p_room and user_id = auth.uid();
  if v_nick <> v_old then perform _dt_sys(p_room, v_old || '님이 별명을 ' || v_nick || '(으)로 바꿨어요.'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_leave(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m dt_members; v_next uuid;
begin
  select * into m from dt_members where room_id = p_room and user_id = v_uid and state = 'in';
  if m.room_id is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  update dt_members set state = 'left' where room_id = p_room and user_id = v_uid;
  perform _dt_sys(p_room, m.nick || '님이 나갔어요.');
  if m.role = 'owner' then
    select user_id into v_next from dt_members where room_id = p_room and state = 'in' order by joined_at limit 1;
    if v_next is null then
      update dt_rooms set status = 'closed', updated_at = now() where id = p_room;      -- 아무도 없으면 방을 닫습니다
    else
      update dt_members set role = 'member' where room_id = p_room and user_id = v_uid;
      update dt_members set role = 'owner' where room_id = p_room and user_id = v_next;
      update dt_rooms set owner_id = v_next, updated_at = now() where id = p_room;
      perform _dt_sys(p_room, (select nick from dt_members where room_id = p_room and user_id = v_next) || '님이 새 방장이 됐어요.');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_block(p_user uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid() then return jsonb_build_object('ok', false); end if;
  if coalesce(p_on, true) then insert into dt_blocks (user_id, blocked) values (auth.uid(), p_user) on conflict do nothing;
  else delete from dt_blocks where user_id = auth.uid() and blocked = p_user; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_report(p_room uuid, p_msg bigint, p_target uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if (select count(*) from dt_reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 20 then return jsonb_build_object('ok', false, 'error', 'slow'); end if;
  insert into dt_reports (room_id, msg_id, reporter, target, reason)
  values (p_room, p_msg, auth.uid(), coalesce(p_target, (select user_id from dt_msgs where id = p_msg and room_id = p_room)), left(p_reason, 300));
  return jsonb_build_object('ok', true);
end $$;

-- ⑦ 방장 --------------------------------------------------------------
create or replace function public._dt_owner(p_room uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dt_rooms where id = p_room and owner_id = auth.uid() and status <> 'closed')
$$;

create or replace function public.dt_owner_set(p_room uuid, p_name text, p_notice text, p_ends_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms;
begin
  if not _dt_owner(p_room) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  select * into r from dt_rooms where id = p_room;
  update dt_rooms set name = left(btrim(p_name), 30), notice = left(nullif(btrim(coalesce(p_notice, '')), ''), 200), ends_on = p_ends_on, updated_at = now() where id = p_room;
  if coalesce(r.notice, '') <> coalesce(left(nullif(btrim(coalesce(p_notice, '')), ''), 200), '') and nullif(btrim(coalesce(p_notice, '')), '') is not null then
    perform _dt_sys(p_room, '📢 공지가 바뀌었어요.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_kick(p_room uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nick text;
begin
  if not _dt_owner(p_room) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  update dt_members set state = 'kicked' where room_id = p_room and user_id = p_user and state = 'in' returning nick into v_nick;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  perform _dt_sys(p_room, v_nick || '님을 방장이 내보냈어요.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_transfer(p_room uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nick text;
begin
  if not _dt_owner(p_room) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  select nick into v_nick from dt_members where room_id = p_room and user_id = p_user and state = 'in';
  if v_nick is null or p_user = auth.uid() then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  update dt_members set role = 'member' where room_id = p_room and user_id = auth.uid();
  update dt_members set role = 'owner' where room_id = p_room and user_id = p_user;
  update dt_rooms set owner_id = p_user, updated_at = now() where id = p_room;
  perform _dt_sys(p_room, v_nick || '님이 새 방장이 됐어요.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_new_code(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not _dt_owner(p_room) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  v_code := _dt_code();
  update dt_rooms set code = v_code, updated_at = now() where id = p_room;
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- ⑧ 알림 (단톡방 앱이 휴대폰 알림 주소를 맡깁니다 · 보내는 쪽은 dantok-notify 함수) ----------
create or replace function public.dt_push_set(p_token text, p_platform text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if p_token is null or length(p_token) < 20 then delete from dt_push where user_id = auth.uid(); return jsonb_build_object('ok', true, 'on', false); end if;
  delete from dt_push where token = p_token and user_id <> auth.uid();
  insert into dt_push (user_id, token, platform) values (auth.uid(), left(p_token, 400), left(p_platform, 20))
  on conflict (user_id) do update set token = excluded.token, platform = excluded.platform, updated_at = now();
  return jsonb_build_object('ok', true, 'on', true);
end $$;

-- 방금 쓴 글을 받을 휴대폰들 (보낸 사람 · 알림 끈 사람 · 보낸 사람을 차단한 사람 빼고). dantok-notify(service_role)가 부릅니다.
create or replace function public.dt_notify_targets(p_msg bigint, p_user uuid)
returns table (token text, room_name text, room_id uuid, nick text, preview text) language plpgsql security definer set search_path = public as $$
declare g dt_msgs;
begin
  select * into g from dt_msgs where id = p_msg;
  if g.id is null or g.user_id is distinct from p_user or g.created_at < now() - interval '2 minutes' then return; end if;
  return query
    select p.token, r.name, r.id, s.nick,
           case g.kind when 'photo' then '📷 사진' when 'video' then '🎬 동영상' when 'audio' then '🎵 음원' when 'file' then '📎 파일' else left(g.body, 80) end
      from dt_members m join dt_push p on p.user_id = m.user_id
      join dt_rooms r on r.id = m.room_id
      join dt_members s on s.room_id = m.room_id and s.user_id = g.user_id
     where m.room_id = g.room_id and m.state = 'in' and not m.muted and m.user_id <> g.user_id
       and not exists (select 1 from dt_blocks b where b.user_id = m.user_id and b.blocked = g.user_id);
end $$;

-- ⑨ 사진 · 동영상 보관함 (비공개: 방 사람만 보고, 방 칸(방번호/…)에만 올림) -----------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('dantok', 'dantok', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;
drop policy if exists "dantok member read" on storage.objects;
create policy "dantok member read" on storage.objects for select to authenticated
  using (bucket_id = 'dantok' and public.dt_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "dantok member write" on storage.objects;
create policy "dantok member write" on storage.objects for insert to authenticated
  with check (bucket_id = 'dantok' and public.dt_is_member(((storage.foldername(name))[1])::uuid));

-- ⑩ 권한 --------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array['dt_create(text, text, date)', 'dt_peek(text)', 'dt_join(text, text)', 'dt_my()', 'dt_room(uuid)',
                           'dt_msgs(uuid, bigint, bigint)', 'dt_send(uuid, text, text, text, text, bigint)', 'dt_read(uuid, bigint)',
                           'dt_delete_msg(uuid, bigint)', 'dt_set_me(uuid, text, boolean)', 'dt_leave(uuid)', 'dt_block(uuid, boolean)',
                           'dt_report(uuid, bigint, uuid, text)', 'dt_owner_set(uuid, text, text, date)', 'dt_kick(uuid, uuid)',
                           'dt_transfer(uuid, uuid)', 'dt_new_code(uuid)', 'dt_push_set(text, text)', 'dt_is_member(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_dt_code()', '_dt_sys(uuid, text)', '_dt_room_json(dt_rooms, uuid)', '_dt_owner(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  execute 'revoke execute on function public.dt_notify_targets(bigint, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.dt_notify_targets(bigint, uuid) to service_role';
end $$;

select 'dantok rooms ok' as result, (select public from storage.buckets where id = 'dantok') as bucket_public;
