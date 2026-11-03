-- =====================================================================
-- 바로카 (baroka.kr) — 2026-11-03
--   에일리어스콜 서버(qmwaraittiurkynszjts)를 같이 씁니다. 차량 등록 · 연락 · 통화는 에일리어스콜 것을 그대로 쓰고,
--   바로카만의 것은 이 파일이 만듭니다.
--
--   ① 등록권 · 번호변경권 (baroka_credits)  — 결제 1번 = 1장. 2,500원 · 2,500원
--   ② 바로카 차량 (baroka_cars)             — 등록권으로 등록한 차. 월 요금 없이 계속 '전화 + 메시지'
--   ③ 기록 (baroka_log)                      — 등록 · 번호 변경 · 처분(말소 · 매도 · 폐차)
--   ④ 타일 광고 (baroka_ads)                 — 관리자가 올리고, 화면 여백에 타일로 나옵니다
--   ⑤ 연결 규칙                              — 바로카 차량은 이용권과 상관없이 언제나 'full'
--
--   ⚠ Supabase → SQL Editor 에 통째로 붙여 Run 합니다. 다시 돌려도 안전합니다.
--   ⚠ 에일리어스콜 기존 차량 · 회선 · 결제는 건드리지 않습니다(⑤는 바로카 차량일 때만 'full' 을 더합니다).
-- =====================================================================

-- ① 등록권 · 번호변경권 ----------------------------------------------------
create table if not exists public.baroka_credits (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('reg', 'change')),
  source      text not null default 'web',        -- web · google · apple · grant(관리자)
  payment_id  uuid,                                -- payments.id (결제로 생긴 것)
  note        text,
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  used_reg    uuid                                 -- 어느 차에 썼나
);
create unique index if not exists baroka_credits_payment_uq on public.baroka_credits(payment_id) where payment_id is not null;
create index if not exists baroka_credits_user_idx on public.baroka_credits(user_id) where used_at is null;
alter table public.baroka_credits enable row level security;
revoke all on public.baroka_credits from anon, authenticated;

-- ② 바로카 차량 -----------------------------------------------------------
create table if not exists public.baroka_cars (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  plate       text not null,                       -- 보이는 모양 그대로 (12가 3456)
  plate_key   text not null,                       -- 띄어쓰기 · 줄표 뺀 것 (찾기 · 겹침 확인)
  credit_id   bigint,
  changes     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists baroka_cars_user_idx on public.baroka_cars(user_id);
create index if not exists baroka_cars_plate_idx on public.baroka_cars(plate_key);
alter table public.baroka_cars enable row level security;
revoke all on public.baroka_cars from anon, authenticated;

-- ③ 기록 ------------------------------------------------------------------
create table if not exists public.baroka_log (
  id          bigserial primary key,
  user_id     uuid,
  registration_id uuid,
  action      text not null,                       -- reg · change · remove · grant
  old_plate   text,
  new_plate   text,
  reason      text,
  at          timestamptz not null default now()
);
alter table public.baroka_log enable row level security;
revoke all on public.baroka_log from anon, authenticated;

-- ④ 타일 광고 -------------------------------------------------------------
create table if not exists public.baroka_ads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  sub         text not null default '',            -- 한 줄 설명
  image_url   text,                                -- 그림(없으면 글자 타일)
  link_url    text,                                -- 누르면 갈 곳
  bg          text not null default '#FFFFFF',     -- 글자 타일 바탕색
  advertiser  text not null default '',            -- 광고주(관리자만 봄)
  memo        text not null default '',            -- 계약 메모(관리자만 봄)
  sort        integer not null default 0,
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  views       bigint not null default 0,
  clicks      bigint not null default 0,
  created_at  timestamptz not null default now()
);
-- 🔴 어느 앱에 싣나: baroka(바로카) · baronu(바로너). 바로너는 부름 서버지만 광고는 여기서 읽어 갑니다.
alter table public.baroka_ads add column if not exists apps text[] not null default array['baroka'];
alter table public.baroka_ads enable row level security;
revoke all on public.baroka_ads from anon, authenticated;

-- 값(관리자가 바꿀 수 있게 표로) ---------------------------------------------
create table if not exists public.baroka_settings (
  id          integer primary key default 1 check (id = 1),
  price_reg   integer not null default 2500,
  price_change integer not null default 2500
);
insert into public.baroka_settings (id) values (1) on conflict (id) do nothing;
alter table public.baroka_settings enable row level security;
revoke all on public.baroka_settings from anon, authenticated;

-- 번호 모양 정리 -----------------------------------------------------------
create or replace function public.baroka_plate_key(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9A-Za-z가-힣]', '', 'g')
$$;

-- 한국 번호판 모양인지 (12가3456 · 123가4567 · 서울12가3456 · 서울1가1234) -----
create or replace function public.baroka_plate_ok(p text)
returns boolean language sql immutable as $$
  select baroka_plate_key(p) ~ '^([가-힣]{2})?[0-9]{2,3}[가-힣][0-9]{4}$'
$$;

-- ⑤ 내 상태 (화면이 부릅니다) ---------------------------------------------
create or replace function public.baroka_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select jsonb_build_object(
    'ok', true,
    'nickname', (select nickname from profiles where id = v_uid),
    'reg_credits', (select count(*) from baroka_credits where user_id = v_uid and kind = 'reg' and used_at is null),
    'change_credits', (select count(*) from baroka_credits where user_id = v_uid and kind = 'change' and used_at is null),
    'price_reg', (select price_reg from baroka_settings where id = 1),
    'price_change', (select price_change from baroka_settings where id = 1),
    'cars', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.registration_id, 'plate', c.plate, 'changes', c.changes, 'created_at', c.created_at,
        'token', r.qr_code_token::text, 'status', r.status::text,
        'make', rv.make, 'color', rv.color,
        'dup', exists (select 1 from baroka_cars d where d.plate_key = c.plate_key and d.registration_id <> c.registration_id)
      ) order by c.created_at)
      from baroka_cars c join registrations r on r.id = c.registration_id
      left join registration_vehicles rv on rv.registration_id = c.registration_id
      where c.user_id = v_uid), '[]'::jsonb),
    -- 에일리어스콜에서 예전에 등록한 차(바로카로 옮길 수 있음)
    'other_cars', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'plate', coalesce(rv.plate_number, r.search_key), 'token', r.qr_code_token::text))
      from registrations r left join registration_vehicles rv on rv.registration_id = r.id
      where r.user_id = v_uid and r.category::text = 'vehicle' and r.status::text = 'active'
        and not exists (select 1 from baroka_cars c where c.registration_id = r.id)), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- 등록권 쓰기 — 방금 만든(또는 예전에 만든) 내 차량 등록을 바로카 차로 -------------
create or replace function public.baroka_claim(p_reg uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cat text; v_owner uuid; v_plate text; v_cr bigint; v_dup boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select r.category::text, r.user_id, coalesce(rv.plate_number, r.search_key)
    into v_cat, v_owner, v_plate
    from registrations r left join registration_vehicles rv on rv.registration_id = r.id where r.id = p_reg;
  if v_owner is null or v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if v_cat <> 'vehicle' then return jsonb_build_object('ok', false, 'error', 'not_vehicle'); end if;
  if exists (select 1 from baroka_cars where registration_id = p_reg) then return jsonb_build_object('ok', true, 'already', true); end if;
  if not baroka_plate_ok(v_plate) then return jsonb_build_object('ok', false, 'error', 'bad_plate'); end if;

  select id into v_cr from baroka_credits
   where user_id = v_uid and kind = 'reg' and used_at is null order by created_at limit 1 for update skip locked;
  if v_cr is null then return jsonb_build_object('ok', false, 'error', 'no_credit'); end if;

  update baroka_credits set used_at = now(), used_reg = p_reg where id = v_cr;
  v_dup := exists (select 1 from baroka_cars where plate_key = baroka_plate_key(v_plate));
  insert into baroka_cars (registration_id, user_id, plate, plate_key, credit_id)
  values (p_reg, v_uid, trim(v_plate), baroka_plate_key(v_plate), v_cr);
  insert into baroka_log (user_id, registration_id, action, new_plate) values (v_uid, p_reg, 'reg', trim(v_plate));
  return jsonb_build_object('ok', true, 'dup', v_dup);
end $$;

-- 번호 변경(번호판을 바꿨을 때) — 번호변경권 1장 ---------------------------------
create or replace function public.baroka_change_plate(p_reg uuid, p_plate text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_old text; v_cr bigint; v_new text := trim(coalesce(p_plate, ''));
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select plate into v_old from baroka_cars where registration_id = p_reg and user_id = v_uid;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if not baroka_plate_ok(v_new) then return jsonb_build_object('ok', false, 'error', 'bad_plate'); end if;
  if baroka_plate_key(v_new) = baroka_plate_key(v_old) then return jsonb_build_object('ok', false, 'error', 'same'); end if;

  select id into v_cr from baroka_credits
   where user_id = v_uid and kind = 'change' and used_at is null order by created_at limit 1 for update skip locked;
  if v_cr is null then return jsonb_build_object('ok', false, 'error', 'no_credit'); end if;

  update baroka_credits set used_at = now(), used_reg = p_reg where id = v_cr;
  update baroka_cars set plate = v_new, plate_key = baroka_plate_key(v_new), changes = changes + 1, updated_at = now()
   where registration_id = p_reg;
  update registration_vehicles set plate_number = v_new where registration_id = p_reg;
  update registrations set search_key = v_new, updated_at = now() where id = p_reg;
  insert into baroka_log (user_id, registration_id, action, old_plate, new_plate) values (v_uid, p_reg, 'change', v_old, v_new);
  return jsonb_build_object('ok', true);
end $$;

-- 처분(차를 팔았어요 · 폐차 · 말소) — 무료. 등록을 지웁니다 --------------------------
create or replace function public.baroka_remove(p_reg uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_old text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select plate into v_old from baroka_cars where registration_id = p_reg and user_id = v_uid;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  insert into baroka_log (user_id, registration_id, action, old_plate, reason)
  values (v_uid, p_reg, 'remove', v_old, left(coalesce(p_reason, ''), 40));
  delete from registrations where id = p_reg and user_id = v_uid;   -- baroka_cars 는 따라서 지워집니다
  return jsonb_build_object('ok', true);
end $$;

-- 결제가 끝나면 서버(결제 함수)가 부릅니다 — 같은 결제로 두 번 주지 않습니다 -----------
create or replace function public.baroka_grant_paid(p_user uuid, p_kind text, p_payment uuid, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_kind not in ('reg', 'change') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  select id into v_id from baroka_credits where payment_id = p_payment;
  if v_id is not null then return jsonb_build_object('ok', true, 'already', true, 'credit', v_id); end if;
  insert into baroka_credits (user_id, kind, source, payment_id) values (p_user, p_kind, coalesce(p_source, 'web'), p_payment)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'credit', v_id);
end $$;

-- 환불되면(구글 · 애플 · 관리자) 쓰지 않은 권은 거둡니다. 이미 쓴 권은 기록만 남깁니다 ----
create or replace function public.baroka_revoke_paid(p_payment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select * into v from baroka_credits where payment_id = p_payment;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if v.used_at is null then delete from baroka_credits where id = v.id; return jsonb_build_object('ok', true, 'removed', true); end if;
  insert into baroka_log (user_id, registration_id, action, reason) values (v.user_id, v.used_reg, 'refund_after_use', p_payment::text);
  return jsonb_build_object('ok', true, 'used', true);
end $$;

-- ④ 타일 광고 — 누구나 볼 수 있는 목록 · 보기/누르기 숫자 ---------------------------
drop function if exists public.baroka_ads_list();
create or replace function public.baroka_ads_list(p_app text default 'baroka')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'sub', sub, 'image', image_url, 'link', link_url, 'bg', bg)
                            order by sort, created_at), '[]'::jsonb)
    from baroka_ads
   where active and coalesce(p_app, 'baroka') = any(apps)
     and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
$$;

create or replace function public.baroka_ad_hit(p_id uuid, p_click boolean default false)
returns void language sql security definer set search_path = public as $$
  update baroka_ads set views = views + case when p_click then 0 else 1 end,
                        clicks = clicks + case when p_click then 1 else 0 end
   where id = p_id
$$;

-- 관리자 --------------------------------------------------------------------
create or replace function public.baroka_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  return jsonb_build_object('ok', true,
    'cars', (select count(*) from baroka_cars),
    'cars_7d', (select count(*) from baroka_cars where created_at > now() - interval '7 days'),
    'changes', (select count(*) from baroka_log where action = 'change'),
    'removed', (select count(*) from baroka_log where action = 'remove'),
    'credits_unused', (select count(*) from baroka_credits where used_at is null),
    'paid', (select count(*) from baroka_credits where payment_id is not null),
    'ads', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort, a.created_at) from baroka_ads a), '[]'::jsonb),
    'price_reg', (select price_reg from baroka_settings where id = 1),
    'price_change', (select price_change from baroka_settings where id = 1));
end $$;

create or replace function public.baroka_admin_ad_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
        v_apps text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'apps', '["baroka"]'::jsonb)) x
                                    where x in ('baroka', 'baronu')), array['baroka']);
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  if v_id is null then
    insert into baroka_ads (title, sub, image_url, link_url, bg, advertiser, memo, sort, active, starts_at, ends_at, apps)
    values (coalesce(p->>'title', ''), coalesce(p->>'sub', ''), nullif(p->>'image_url', ''), nullif(p->>'link_url', ''),
            coalesce(nullif(p->>'bg', ''), '#FFFFFF'), coalesce(p->>'advertiser', ''), coalesce(p->>'memo', ''),
            coalesce((p->>'sort')::int, 0), coalesce((p->>'active')::boolean, true),
            nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, v_apps)
    returning id into v_id;
  else
    update baroka_ads set title = coalesce(p->>'title', ''), sub = coalesce(p->>'sub', ''),
      image_url = nullif(p->>'image_url', ''), link_url = nullif(p->>'link_url', ''),
      bg = coalesce(nullif(p->>'bg', ''), '#FFFFFF'), advertiser = coalesce(p->>'advertiser', ''), memo = coalesce(p->>'memo', ''),
      sort = coalesce((p->>'sort')::int, 0), active = coalesce((p->>'active')::boolean, true),
      starts_at = nullif(p->>'starts_at', '')::timestamptz, ends_at = nullif(p->>'ends_at', '')::timestamptz, apps = v_apps
    where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.baroka_admin_ad_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  delete from baroka_ads where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 관리자가 권을 드리기(시험 · 보상 · 홍보) — 닉네임으로 --------------------------------
create or replace function public.baroka_admin_grant(p_nickname text, p_kind text, p_n integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; i int;
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  if p_kind not in ('reg', 'change') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  select id into v_user from profiles where lower(nickname) = lower(trim(p_nickname)) limit 1;
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  for i in 1 .. greatest(1, least(coalesce(p_n, 1), 20)) loop
    insert into baroka_credits (user_id, kind, source, note) values (v_user, p_kind, 'grant', 'admin ' || coalesce(auth.uid()::text, ''));
  end loop;
  insert into baroka_log (user_id, action, reason) values (v_user, 'grant', p_kind || ' x' || p_n);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.baroka_admin_prices(p_reg integer, p_change integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_global_admin(), false) then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  update baroka_settings set price_reg = p_reg, price_change = p_change where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ⑤ 연결 규칙 — 바로카 차량은 이용권과 상관없이 언제나 전화 + 메시지 ---------------------
--   (release_1101/1_connect_mode.sql 의 두 함수에 "바로카 차량이면 full" 한 줄씩만 더했습니다)
create or replace function public.baroka_is_car(p_reg uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from baroka_cars where registration_id = p_reg)
$$;

create or replace function public.registration_connect_mode(p_registration_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_category text; v_owner uuid;
begin
  select category::text, user_id into v_category, v_owner
    from registrations where id = p_registration_id and status = 'active';
  if v_owner is null then return 'blocked'; end if;
  if v_category = 'temp_contact' then
    return case when exists (select 1 from temp_cards where registration_id = p_registration_id
                              and ended_at is null and expires_at > now()) then 'full' else 'blocked' end;
  end if;
  if baroka_is_car(p_registration_id) then return 'full'; end if;     -- 🔴 바로카
  return ac_mode_core(v_category, v_owner);
end $$;

create or replace function public.connect_mode_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_reg uuid; v_category text; v_owner uuid; v_status text; v_mode text; v_type text := '';
begin
  v_reg := new.registration_id;
  if TG_TABLE_NAME = 'webrtc_sessions' then
    v_type := coalesce(new.call_type::text, '');
    if v_reg is null and new.case_id is not null then
      select registration_id into v_reg from cases where id = new.case_id;
    end if;
  end if;
  if v_reg is null then return new; end if;

  select category::text, user_id, status::text into v_category, v_owner, v_status from registrations where id = v_reg;
  if v_category is null or v_category = 'temp_contact' then return new; end if;

  if TG_TABLE_NAME = 'webrtc_sessions' then
    if coalesce(new.direction, '') <> 'owner_to_finder' and v_status <> 'active' then return new; end if;
  elsif v_status <> 'active' then
    return new;
  end if;
  if baroka_is_car(v_reg) then return new; end if;                    -- 🔴 바로카 — 언제나 full
  v_mode := ac_mode_core(v_category, v_owner);

  if v_type in ('voice', 'video') then
    if v_mode = 'message_only' then raise exception 'plan_message_only'; end if;
    if v_mode = 'blocked' then raise exception 'plan_blocked'; end if;
  elsif v_mode = 'blocked' then
    if TG_TABLE_NAME = 'webrtc_sessions' then
      if new.case_id is not null and exists (select 1 from cases where id = new.case_id) then return new; end if;
    end if;
    raise exception 'plan_blocked';
  end if;
  return new;
end $$;

-- 누가 부를 수 있나 -------------------------------------------------------------
revoke execute on function public.baroka_state() from public, anon;
revoke execute on function public.baroka_claim(uuid) from public, anon;
revoke execute on function public.baroka_change_plate(uuid, text) from public, anon;
revoke execute on function public.baroka_remove(uuid, text) from public, anon;
revoke execute on function public.baroka_grant_paid(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.baroka_revoke_paid(uuid) from public, anon, authenticated;
revoke execute on function public.baroka_is_car(uuid) from public, anon, authenticated;
revoke execute on function public.baroka_admin_overview() from public, anon;
revoke execute on function public.baroka_admin_ad_save(jsonb) from public, anon;
revoke execute on function public.baroka_admin_ad_delete(uuid) from public, anon;
revoke execute on function public.baroka_admin_grant(text, text, integer) from public, anon;
revoke execute on function public.baroka_admin_prices(integer, integer) from public, anon;
grant execute on function public.baroka_state() to authenticated;
grant execute on function public.baroka_claim(uuid) to authenticated;
grant execute on function public.baroka_change_plate(uuid, text) to authenticated;
grant execute on function public.baroka_remove(uuid, text) to authenticated;
grant execute on function public.baroka_grant_paid(uuid, text, uuid, text) to service_role;
grant execute on function public.baroka_revoke_paid(uuid) to service_role;
grant execute on function public.baroka_admin_overview() to authenticated;
grant execute on function public.baroka_admin_ad_save(jsonb) to authenticated;
grant execute on function public.baroka_admin_ad_delete(uuid) to authenticated;
grant execute on function public.baroka_admin_grant(text, text, integer) to authenticated;
grant execute on function public.baroka_admin_prices(integer, integer) to authenticated;
grant execute on function public.baroka_ads_list(text) to anon, authenticated;
grant execute on function public.baroka_ad_hit(uuid, boolean) to anon, authenticated;
grant execute on function public.baroka_plate_key(text) to anon, authenticated;
grant execute on function public.baroka_plate_ok(text) to anon, authenticated;
grant all on public.baroka_credits, public.baroka_cars, public.baroka_log, public.baroka_ads, public.baroka_settings to service_role;
grant usage, select on sequence public.baroka_credits_id_seq, public.baroka_log_id_seq to service_role;
revoke execute on function public.registration_connect_mode(uuid) from public;
grant execute on function public.registration_connect_mode(uuid) to anon, authenticated;

-- 광고 그림 보관함(누구나 보기 · 관리자만 올리기) ------------------------------------------
insert into storage.buckets (id, name, public) values ('baroka-ads', 'baroka-ads', true) on conflict (id) do nothing;
drop policy if exists baroka_ads_read on storage.objects;
create policy baroka_ads_read on storage.objects for select using (bucket_id = 'baroka-ads');
drop policy if exists baroka_ads_write on storage.objects;
create policy baroka_ads_write on storage.objects for insert to authenticated
  with check (bucket_id = 'baroka-ads' and coalesce(public.is_global_admin(), false));
drop policy if exists baroka_ads_del on storage.objects;
create policy baroka_ads_del on storage.objects for delete to authenticated
  using (bucket_id = 'baroka-ads' and coalesce(public.is_global_admin(), false));

-- 확인: 아래가 보이면 끝
select 'baroka ok' as result, (select count(*) from baroka_cars) as cars, (select count(*) from baroka_ads) as ads;
