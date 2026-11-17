-- ═══════════════════════════════════════════════════════════════════════
-- 🏪 2026-11-17 단골창구 요금제 3단계 · 사진/동영상 · 번호 없는 통화
--   기본형    1년  9,900원  글 문의 · 답장 · 공지 · 자동 안내 (지금 그대로)
--   실용형    1년 19,800원  + 사진 · 짧은 동영상(30초) 주고받기 + 바로 음성 통화
--   프리미엄형 1년 33,000원  + 영상 통화
--   중간에 올리기: 결제는 늘 새 상품 1년치. 남은 기간의 값(옛 가격 기준)을 새 가격으로 바꿔 날짜로 더해 줍니다.
--     예) 기본형 120일 남음 → 실용형: 9,900 × 120/365 ÷ 19,800 × 365 = 60일 → 365 + 60일
--   낮은 상품을 샀는데 높은 상품이 아직 남아 있으면: 산 값을 높은 상품 날짜로 바꿔 더합니다(요금제는 그대로).
--   상품: 단골창구 앱 dangol_1y · dangol_plus_1y · dangol_premium_1y (애플은 끝에 _nr)
--         가림콜 앱  garim_dangol_1y · garim_dangol_plus_1y · garim_dangol_premium_1y
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 14_dangol_notice_auto.sql 다음.
-- ═══════════════════════════════════════════════════════════════════════

-- ① 칸 더하기 ------------------------------------------------------------
alter table public.dg_desks add column if not exists plan    text    not null default 'basic';
alter table public.dg_desks add column if not exists call_on boolean not null default true;
do $$ begin
  alter table public.dg_desks add constraint dg_desks_plan_chk check (plan in ('basic', 'plus', 'premium'));
exception when duplicate_object then null; end $$;

alter table public.dg_msgs add column if not exists kind  text not null default 'text';
alter table public.dg_msgs add column if not exists media text;
alter table public.dg_msgs add column if not exists secs  int;
do $$ begin
  alter table public.dg_msgs add constraint dg_msgs_kind_chk check (kind in ('text', 'photo', 'video', 'call'));
exception when duplicate_object then null; end $$;

alter table public.dg_pay_log add column if not exists plan text;
alter table public.dg_pay_log add column if not exists bonus_days int;

-- 올리기 표(손님 · 사장님이 받은 올리기 허가) — 같은 사람 · 같은 가게 것만 메시지로 붙일 수 있게
create table if not exists public.dg_media_tickets (
  path       text primary key,
  desk_id    uuid not null references public.dg_desks(id) on delete cascade,
  guest_hash text,               -- 손님이면 손님 열쇠, 사장님이면 null
  kind       text not null check (kind in ('photo', 'video')),
  used       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.dg_media_tickets enable row level security;
revoke all on public.dg_media_tickets from anon, authenticated;
grant all on public.dg_media_tickets to service_role;

-- 통화 한 통 = 한 줄 (울림 → 받음 → 끝)
create table if not exists public.dg_calls (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.dg_threads(id) on delete cascade,
  desk_id     uuid not null references public.dg_desks(id) on delete cascade,
  video       boolean not null default false,
  state       text not null default 'ring' check (state in ('ring', 'live', 'done', 'missed', 'declined')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  ended_at    timestamptz,
  notified    boolean not null default false
);
create index if not exists dg_calls_desk_idx on public.dg_calls (desk_id, created_at desc);
alter table public.dg_calls enable row level security;
revoke all on public.dg_calls from anon, authenticated;
grant all on public.dg_calls to service_role;

-- 사진 · 동영상 보관함 (비공개 — 볼 때마다 1시간짜리 열쇠를 dangol-media 함수가 줍니다)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dangol_chat', 'dangol_chat', false, 31457280, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = 31457280,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];

-- ② 요금제 계산 -----------------------------------------------------------
create or replace function public._dg_rank(p text) returns int language sql immutable as $$
  select case p when 'premium' then 3 when 'plus' then 2 else 1 end
$$;
create or replace function public._dg_price(p text) returns int language sql immutable as $$
  select case p when 'premium' then 33000 when 'plus' then 19800 else 9900 end
$$;
-- 지금 쓸 수 있는 요금제 (기간이 끝났으면 기본형)
create or replace function public._dg_plan(d dg_desks) returns text language sql stable as $$
  select case when d.until > now() then coalesce(d.plan, 'basic') else 'basic' end
$$;

-- 가게 정보 (14 의 것 + 요금제 · 사진 · 통화 가능 여부)
create or replace function public._dg_desk_json(d dg_desks) returns jsonb language sql stable as $$
  select jsonb_build_object('code', d.code, 'name', d.name, 'category', d.category, 'intro', d.intro, 'hours', d.hours,
    'region', d.region, 'photo', d.photo_path, 'greeting', d.greeting, 'items', d.items, 'verified', d.verified,
    'address', d.address, 'address_detail', d.address_detail,
    'notice', d.notice, 'busy', d.busy, 'busy_msg', d.busy_msg,
    'hours_on', d.hours_on, 'open_time', to_char(d.open_time, 'HH24:MI'), 'close_time', to_char(d.close_time, 'HH24:MI'),
    'off_days', to_jsonb(d.off_days), 'off_msg', d.off_msg, 'away', _dg_away(d),
    'plan', _dg_plan(d), 'call_on', d.call_on,
    'media', _dg_rank(_dg_plan(d)) >= 2,
    'call',  _dg_rank(_dg_plan(d)) >= 2 and d.call_on and not _dg_away(d),
    'vcall', _dg_rank(_dg_plan(d)) >= 3 and d.call_on and not _dg_away(d))
$$;

create or replace function public.dg_owner_desks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_dg_desk_json(d) || jsonb_build_object('id', d.id, 'status', d.status, 'until', d.until, 'live', _dg_live(d),
           'plan_bought', d.plan,
           'waiting', (select count(*) from dg_threads t where t.desk_id = d.id and t.status = 'open'),
           'unread', (select coalesce(sum(owner_unread), 0) from dg_threads t where t.desk_id = d.id)) order by d.created_at), '[]'::jsonb)
    from dg_desks d where d.owner_user_id = auth.uid() and d.status <> 'closed'
$$;

-- 결제 전에 「이렇게 바뀌어요」 미리 보기 (사장님 화면)
create or replace function public._dg_quote(d dg_desks, p_plan text, p_months int)
returns jsonb language plpgsql stable as $$
declare cur text := _dg_plan(d); rem numeric := greatest(0, extract(epoch from (d.until - now())) / 86400.0);
        bonus int := 0; v timestamptz; keep text;
begin
  if d.until <= now() or cur = p_plan then
    keep := p_plan; v := greatest(d.until, now()) + make_interval(months => p_months);
  elsif _dg_rank(p_plan) > _dg_rank(cur) then
    -- 올리기: 남은 기간의 값(옛 가격)을 새 가격 날짜로
    bonus := floor(rem * _dg_price(cur) / _dg_price(p_plan))::int;
    keep := p_plan; v := now() + make_interval(months => p_months) + make_interval(days => bonus);
  else
    -- 더 높은 요금제가 남아 있는데 낮은 것을 삼: 산 값을 높은 요금제 날짜로 바꿔 더함
    bonus := floor(365.0 * p_months / 12 * _dg_price(p_plan) / _dg_price(cur))::int;
    keep := cur; v := d.until + make_interval(days => bonus);
  end if;
  return jsonb_build_object('cur', cur, 'plan', keep, 'rem_days', floor(rem)::int, 'bonus_days', bonus, 'until', v,
                            'upgrade', d.until > now() and _dg_rank(p_plan) > _dg_rank(cur));
end $$;

create or replace function public.dg_plan_quote(p_desk uuid, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d dg_desks;
begin
  if p_plan not in ('basic', 'plus', 'premium') then return jsonb_build_object('ok', false, 'error', 'bad_plan'); end if;
  select * into d from dg_desks where id = p_desk and owner_user_id = auth.uid();
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true) || _dg_quote(d, p_plan, 12);
end $$;

-- 결제 확인 뒤 넣기 (멱등) — 결제 함수가 상품에 맞는 요금제를 넘깁니다
create or replace function public.dg_grant_plan(p_user uuid, p_desk uuid, p_months int, p_payment uuid, p_source text, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; l dg_pay_log; q jsonb;
begin
  select * into l from dg_pay_log where payment_id = p_payment;
  if l.payment_id is not null then
    return jsonb_build_object('ok', l.desk_id = p_desk, 'already', true, 'until', l.until_after);
  end if;
  if p_plan not in ('basic', 'plus', 'premium') then return jsonb_build_object('ok', false, 'error', 'bad_plan'); end if;
  select * into d from dg_desks where id = p_desk for update;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'no_desk'); end if;
  if d.owner_user_id <> p_user then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if d.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if coalesce(p_months, 0) < 1 or p_months > 36 then return jsonb_build_object('ok', false, 'error', 'bad_months'); end if;
  q := _dg_quote(d, p_plan, p_months);
  update dg_desks set plan = q->>'plan', until = (q->>'until')::timestamptz, updated_at = now() where id = p_desk;
  insert into dg_pay_log (payment_id, desk_id, user_id, months, until_after, source, plan, bonus_days)
  values (p_payment, p_desk, p_user, p_months, (q->>'until')::timestamptz, p_source, p_plan, (q->>'bonus_days')::int);
  return jsonb_build_object('ok', true, 'until', q->>'until', 'plan', q->>'plan', 'bonus_days', (q->>'bonus_days')::int);
end $$;

-- 옛 이름(기본형)도 그대로 — 지금 배포된 결제 함수가 부르는 이름
create or replace function public.dg_grant_paid(p_user uuid, p_desk uuid, p_months int, p_payment uuid, p_source text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.dg_grant_plan(p_user, p_desk, p_months, p_payment, p_source, 'basic')
$$;

-- 사장님: 통화 받기 켜고 끄기
create or replace function public.dg_set_call(p_desk uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_desks set call_on = coalesce(p_on, true), updated_at = now() where id = p_desk and owner_user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true, 'call_on', coalesce(p_on, true));
end $$;

-- ③ 대화 목록에 사진 · 동영상 · 통화 칸 ---------------------------------------
create or replace function public._dg_msgs_json(p_thread uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'o', m.from_owner, 'b', m.body, 't', m.created_at,
           'k', m.kind, 'u', m.media, 's', m.secs) order by m.id), '[]'::jsonb)
    from dg_msgs m where m.thread_id = p_thread
$$;

create or replace function public.dg_guest_threads(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', t.id, 'code', d.code, 'name', d.name, 'photo', d.photo_path, 'status', t.status,
             'address', d.address, 'region', d.region,
             'unread', t.guest_unread, 'updated_at', t.updated_at, 'live', _dg_live(d),
             'msgs', _dg_msgs_json(t.id)) as x
      from dg_threads t join dg_desks d on d.id = t.desk_id
     where t.guest_hash = _dg_hash(p_token) and d.status <> 'closed'
     order by t.updated_at desc limit 30) s
$$;

create or replace function public.dg_owner_threads(p_desk uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', t.id, 'name', coalesce(t.guest_name, '손님 ' || upper(left(t.guest_hash, 4))), 'status', t.status,
             'unread', t.owner_unread, 'created_at', t.created_at, 'updated_at', t.updated_at,
             'msgs', _dg_msgs_json(t.id)) as x
      from dg_threads t where t.desk_id = p_desk and t.updated_at > now() - interval '180 days'
     order by t.updated_at desc limit 300) s;
  return v;
end $$;

-- 손님 대화 찾기 · 없으면 만들기 (글 · 사진 · 통화 모두 이 길로)
create or replace function public._dg_guest_thread(d dg_desks, h text, p_thread uuid, p_name text)
returns uuid language plpgsql as $$
declare v_t uuid;
begin
  if p_thread is not null then select id into v_t from dg_threads where id = p_thread and desk_id = d.id and guest_hash = h; end if;
  if v_t is null then select id into v_t from dg_threads where desk_id = d.id and guest_hash = h and status <> 'closed' order by updated_at desc limit 1; end if;
  if v_t is null then
    insert into dg_threads (desk_id, guest_hash, guest_name, owner_unread) values (d.id, h, left(nullif(btrim(p_name), ''), 20), 0) returning id into v_t;
  elsif nullif(btrim(coalesce(p_name, '')), '') is not null then
    update dg_threads set guest_name = left(btrim(p_name), 20) where id = v_t;
  end if;
  return v_t;
end $$;

-- ④ 사진 · 동영상 ----------------------------------------------------------
--   (1) dangol-media 함수가 허가를 확인하고(dg_media_ticket) 올릴 주소를 줍니다.
--   (2) 화면이 올린 뒤 메시지로 붙입니다(손님 dg_guest_media · 사장님 dg_owner_media).
create or replace function public.dg_media_ticket(p_code text, p_token text, p_thread uuid, p_owner uuid, p_kind text, p_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; h text;
begin
  if p_kind not in ('photo', 'video') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if p_owner is not null then
    select d0.* into d from dg_threads t join dg_desks d0 on d0.id = t.desk_id where t.id = p_thread and d0.owner_user_id = p_owner;
    if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  else
    h := _dg_hash(p_token);
    if h is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
    select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
    if d.id is null or not _dg_live(d) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    if (select count(*) from dg_media_tickets where guest_hash = h and created_at > now() - interval '1 hour') >= 20 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  end if;
  if _dg_rank(_dg_plan(d)) < 2 then return jsonb_build_object('ok', false, 'error', 'plan'); end if;
  insert into dg_media_tickets (path, desk_id, guest_hash, kind) values (d.id || '/' || p_path, d.id, h, p_kind);
  return jsonb_build_object('ok', true, 'path', d.id || '/' || p_path);
end $$;

create or replace function public.dg_guest_media(p_code text, p_token text, p_path text, p_secs int default null, p_name text default null, p_thread uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; h text := _dg_hash(p_token); k dg_media_tickets; v_t uuid;
begin
  if h is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
  if d.id is null or not _dg_live(d) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if _dg_rank(_dg_plan(d)) < 2 then return jsonb_build_object('ok', false, 'error', 'plan'); end if;
  select * into k from dg_media_tickets where path = p_path and desk_id = d.id and guest_hash = h and not used for update;
  if k.path is null then return jsonb_build_object('ok', false, 'error', 'ticket'); end if;
  update dg_media_tickets set used = true where path = k.path;
  v_t := _dg_guest_thread(d, h, p_thread, p_name);
  insert into dg_msgs (thread_id, from_owner, body, kind, media, secs)
  values (v_t, false, case k.kind when 'video' then '🎬 동영상' else '📷 사진' end, k.kind, k.path, least(greatest(coalesce(p_secs, 0), 0), 60));
  update dg_threads set status = 'open', owner_unread = owner_unread + 1, updated_at = now() where id = v_t;
  return jsonb_build_object('ok', true, 'thread', v_t);
end $$;

create or replace function public.dg_owner_media(p_thread uuid, p_path text, p_secs int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k dg_media_tickets;
begin
  if not exists (select 1 from dg_threads t join dg_desks d on d.id = t.desk_id where t.id = p_thread and d.owner_user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  select * into k from dg_media_tickets where path = p_path and guest_hash is null and not used
     and desk_id = (select desk_id from dg_threads where id = p_thread) for update;
  if k.path is null then return jsonb_build_object('ok', false, 'error', 'ticket'); end if;
  update dg_media_tickets set used = true where path = k.path;
  insert into dg_msgs (thread_id, from_owner, body, kind, media, secs)
  values (p_thread, true, case k.kind when 'video' then '🎬 동영상' else '📷 사진' end, k.kind, k.path, least(greatest(coalesce(p_secs, 0), 0), 60));
  update dg_threads set status = 'answered', guest_unread = guest_unread + 1, owner_unread = 0, updated_at = now() where id = p_thread;
  return jsonb_build_object('ok', true);
end $$;

-- dangol-media 함수: 이 대화의 사진 · 동영상 주소 목록 (볼 사람이 맞는지 확인)
create or replace function public.dg_media_list(p_thread uuid, p_token text, p_owner uuid)
returns table (path text) language sql stable security definer set search_path = public as $$
  select m.media from dg_msgs m join dg_threads t on t.id = m.thread_id join dg_desks d on d.id = t.desk_id
   where m.thread_id = p_thread and m.media is not null
     and ((p_owner is not null and d.owner_user_id = p_owner) or (p_owner is null and t.guest_hash = _dg_hash(p_token)))
$$;

-- ⑤ 통화 ----------------------------------------------------------------
--   손님이 걸면 dg_calls 한 줄이 생기고(울림), 사장님 화면이 dg_owner_ring 으로 보고 받습니다.
--   말은 Supabase 방송 채널 'dgc-<통화 번호>' 로 주고받고(WebRTC), 소리는 기기끼리 직접 · 막히면 중계(TURN).
create or replace function public.dg_call_start(p_code text, p_token text, p_video boolean, p_name text default null, p_thread uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; h text := _dg_hash(p_token); v_t uuid; c uuid;
begin
  if h is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
  if d.id is null or not _dg_live(d) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if _dg_rank(_dg_plan(d)) < (case when p_video then 3 else 2 end) then return jsonb_build_object('ok', false, 'error', 'plan'); end if;
  if not d.call_on then return jsonb_build_object('ok', false, 'error', 'call_off'); end if;
  if _dg_away(d) then return jsonb_build_object('ok', false, 'error', 'away'); end if;
  if (select count(*) from dg_calls c0 join dg_threads t on t.id = c0.thread_id where t.guest_hash = h and c0.created_at > now() - interval '1 hour') >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  -- 사장님이 이미 다른 통화 중이면
  if exists (select 1 from dg_calls where desk_id = d.id and (state = 'live' and ended_at is null and answered_at > now() - interval '2 hours'
                                                               or state = 'ring' and created_at > now() - interval '45 seconds')) then
    return jsonb_build_object('ok', false, 'error', 'line_busy'); end if;
  v_t := _dg_guest_thread(d, h, p_thread, p_name);
  insert into dg_calls (thread_id, desk_id, video) values (v_t, d.id, coalesce(p_video, false)) returning id into c;
  update dg_threads set updated_at = now() where id = v_t;
  return jsonb_build_object('ok', true, 'call', c, 'thread', v_t);
end $$;

-- 사장님 화면이 몇 초마다 봅니다: 지금 울리는 전화
create or replace function public.dg_owner_ring(p_desk uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c dg_calls; t dg_threads;
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return null; end if;
  -- 45초 넘게 아무도 안 받은 전화는 부재중으로
  for c in select * from dg_calls where desk_id = p_desk and state = 'ring' and created_at < now() - interval '45 seconds' loop
    perform _dg_call_end(c.id, 'missed');
  end loop;
  select * into c from dg_calls where desk_id = p_desk and state = 'ring' order by created_at desc limit 1;
  if c.id is null then return null; end if;
  select * into t from dg_threads where id = c.thread_id;
  return jsonb_build_object('call', c.id, 'thread', c.thread_id, 'video', c.video, 'at', c.created_at,
                            'name', coalesce(t.guest_name, '손님 ' || upper(left(t.guest_hash, 4))));
end $$;

-- 통화 끝 → 대화에 한 줄 남김
create or replace function public._dg_call_end(p_call uuid, p_state text)
returns void language plpgsql security definer set search_path = public as $$
declare c dg_calls; s int; b text;
begin
  select * into c from dg_calls where id = p_call for update;
  if c.id is null or c.state in ('done', 'missed', 'declined') then return; end if;
  if p_state = 'done' and c.answered_at is null then p_state := 'missed'; end if;
  update dg_calls set state = p_state, ended_at = now() where id = p_call;
  s := case when c.answered_at is not null then greatest(0, extract(epoch from (now() - c.answered_at))::int) end;
  b := (case when c.video then '🎥 영상 통화' else '📞 음성 통화' end) ||
       case p_state when 'done' then ' ' || (s / 60) || '분 ' || (s % 60) || '초'
                    when 'declined' then ' — 사장님이 지금 받기 어려워요' else ' — 부재중' end;
  insert into dg_msgs (thread_id, from_owner, body, kind, secs) values (c.thread_id, false, b, 'call', s);
  update dg_threads set updated_at = now(),
         owner_unread = owner_unread + case when p_state = 'missed' then 1 else 0 end,
         status = case when p_state = 'missed' then 'open' else status end
   where id = c.thread_id;
end $$;

-- 통화 상태 바꾸기 — 손님(p_token) 또는 사장님(로그인)
--   사장님: 'live'(받음) · 'declined'(거절) · 'done'(끊음)    손님: 'done'(끊음 · 취소)
create or replace function public.dg_call_set(p_call uuid, p_state text, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c dg_calls; own boolean; gst boolean;
begin
  select * into c from dg_calls where id = p_call;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'no_call'); end if;
  own := exists (select 1 from dg_desks where id = c.desk_id and owner_user_id = auth.uid());
  gst := p_token is not null and exists (select 1 from dg_threads where id = c.thread_id and guest_hash = _dg_hash(p_token));
  if not own and not gst then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if p_state = 'live' and own then
    if c.state <> 'ring' then return jsonb_build_object('ok', false, 'error', 'gone', 'state', c.state); end if;
    update dg_calls set state = 'live', answered_at = now() where id = p_call;
    update dg_threads set owner_unread = 0 where id = c.thread_id;
  elsif p_state = 'declined' and own then perform _dg_call_end(p_call, 'declined');
  elsif p_state = 'done' then perform _dg_call_end(p_call, 'done');
  else return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 손님 화면: 내 통화가 지금 어떤지 (받았나 · 끝났나)
create or replace function public.dg_call_state(p_call uuid, p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('state', c.state, 'video', c.video)
    from dg_calls c join dg_threads t on t.id = c.thread_id
   where c.id = p_call and t.guest_hash = _dg_hash(p_token)
$$;

-- dangol-notify 함수: 울리는 전화 → 사장님 휴대폰 (한 통에 한 번만)
create or replace function public.dg_notify_call_targets(p_call uuid, p_token text)
returns table (push_token text, desk_name text, guest text, video boolean, thread uuid) language plpgsql security definer set search_path = public as $$
declare c dg_calls; t dg_threads; d dg_desks;
begin
  select * into c from dg_calls where id = p_call and state = 'ring' and not notified and created_at > now() - interval '45 seconds';
  if c.id is null then return; end if;
  select * into t from dg_threads where id = c.thread_id and guest_hash = _dg_hash(p_token);
  if t.id is null then return; end if;
  update dg_calls set notified = true where id = c.id;
  select * into d from dg_desks where id = c.desk_id;
  return query select k.token::text, d.name, coalesce(t.guest_name, '손님'), c.video, c.thread_id
    from push_tokens k where k.user_id = d.owner_user_id and k.token is not null
     and k.token::text !~* '^[0-9a-f]{64,200}$' and k.token::text !~ '^[{h]';
end $$;

-- ⑥ 권한 -----------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['dg_guest_threads(text)', 'dg_guest_media(text, text, text, int, text, uuid)', 'dg_call_start(text, text, boolean, text, uuid)',
                           'dg_call_set(uuid, text, text)', 'dg_call_state(uuid, text)'] loop
    execute 'revoke execute on function public.' || f || ' from public';
    execute 'grant execute on function public.' || f || ' to anon, authenticated';
  end loop;
  foreach f in array array['dg_owner_desks()', 'dg_owner_threads(uuid)', 'dg_plan_quote(uuid, text)', 'dg_set_call(uuid, boolean)',
                           'dg_owner_media(uuid, text, int)', 'dg_owner_ring(uuid)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
  foreach f in array array['dg_grant_plan(uuid, uuid, int, uuid, text, text)', 'dg_grant_paid(uuid, uuid, int, uuid, text)',
                           'dg_media_ticket(text, text, uuid, uuid, text, text)', 'dg_media_list(uuid, text, uuid)',
                           'dg_notify_call_targets(uuid, text)', '_dg_call_end(uuid, text)', '_dg_guest_thread(dg_desks, text, uuid, text)',
                           '_dg_quote(dg_desks, text, int)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;

select 'dangol plans ok' as result,
       (select count(*) from public.dg_desks where plan = 'basic') as basic_desks,
       (select public from storage.buckets where id = 'dangol_chat') as chat_bucket_public;
