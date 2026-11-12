-- =====================================================================
-- 차량 간편 등록 · 1개월 무료 쿠폰 — 2026-11-12
--   garimcall.com/car(= aliascall.com/car.html) 에서 등록한 차에 자동으로 붙습니다.
--     · 처음 1개월: 전화 + 문자
--     · 다음 1개월: 문자만
--     · 그 뒤: 연결 끊김 (차량 이용권 2,500원 · 바로카 등록 2,500원 · 회선/긴급 이용권으로 다시 열림)
--   한 계정 1번 · 한 차번호 1번만. 앱(가림콜 · 바로카)의 기존 무료 기간 규칙은 그대로입니다.
--
--   ⚠ Supabase → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
--   ⚠ 1_baroka.sql · 3_garim_car_pass.sql 을 먼저 돌린 서버여야 합니다.
-- =====================================================================

create table if not exists public.car_coupons (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  plate_key   text not null,
  app         text not null default 'garim' check (app in ('garim', 'baroka')),
  source      text,
  created_at  timestamptz not null default now(),
  full_until  timestamptz not null,
  msg_until   timestamptz not null
);
create unique index if not exists car_coupons_plate_uq on public.car_coupons (plate_key);
create unique index if not exists car_coupons_user_uq  on public.car_coupons (user_id);
alter table public.car_coupons enable row level security;
drop policy if exists car_coupons_own on public.car_coupons;
create policy car_coupons_own on public.car_coupons for select to authenticated using (user_id = auth.uid());
grant select on public.car_coupons to authenticated;
grant all on public.car_coupons to service_role;

-- ① 쿠폰 받기 (간편 등록 화면이 등록 직후 부릅니다) ----------------------------------------
create or replace function public.car_coupon_claim(p_reg uuid, p_app text, p_source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cat text; v_plate text; v_key text; v_full timestamptz; v_msg timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select r.category::text, coalesce(rv.plate_number, r.search_key) into v_cat, v_plate
    from registrations r left join registration_vehicles rv on rv.registration_id = r.id
   where r.id = p_reg and r.user_id = v_uid and r.status = 'active';
  if v_cat is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if v_cat <> 'vehicle' then return jsonb_build_object('ok', false, 'error', 'not_vehicle'); end if;
  if not baroka_plate_ok(v_plate) then return jsonb_build_object('ok', false, 'error', 'bad_plate'); end if;
  v_key := baroka_plate_key(v_plate);
  if exists (select 1 from car_coupons where user_id = v_uid) then return jsonb_build_object('ok', false, 'error', 'used_account'); end if;
  if exists (select 1 from car_coupons where plate_key = v_key) then return jsonb_build_object('ok', false, 'error', 'used_plate'); end if;
  v_full := now() + interval '1 month';
  v_msg  := v_full + interval '1 month';
  insert into car_coupons (registration_id, user_id, plate_key, app, source, full_until, msg_until)
  values (p_reg, v_uid, v_key, case when p_app = 'baroka' then 'baroka' else 'garim' end, left(p_source, 40), v_full, v_msg);
  return jsonb_build_object('ok', true, 'full_until', v_full, 'msg_until', v_msg);
end $$;

-- ①-2 받을 수 있는지 미리 보기 (등록 전에 부릅니다) -------------------------------------------
create or replace function public.car_coupon_check(p_plate text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'login'; end if;
  if not baroka_plate_ok(p_plate) then return 'bad_plate'; end if;
  if exists (select 1 from car_coupons where user_id = auth.uid()) then return 'used_account'; end if;
  if exists (select 1 from car_coupons where plate_key = baroka_plate_key(p_plate)) then return 'used_plate'; end if;
  return 'ok';
end $$;

-- ② 내 쿠폰 차 목록 (마이페이지 · 바로카 내 차 화면) ------------------------------------------
create or replace function public.car_coupon_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.registration_id, 'plate', coalesce(rv.plate_number, r.search_key), 'token', r.qr_code_token,
           'app', c.app, 'full_until', c.full_until, 'msg_until', c.msg_until,
           'paid', exists (select 1 from baroka_cars b where b.registration_id = c.registration_id))
         order by c.created_at), '[]'::jsonb)
    from car_coupons c join registrations r on r.id = c.registration_id and r.status = 'active'
    left join registration_vehicles rv on rv.registration_id = c.registration_id
   where c.user_id = auth.uid();
$$;

-- ③ 연결 판정에 쿠폰을 더합니다 (바로카 차 · 이용권 기간은 그대로 우선) ------------------------
create or replace function public.car_coupon_mode(p_reg uuid, p_base text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_full timestamptz; v_msg timestamptz;
begin
  if p_base = 'full' then return p_base; end if;               -- 회선 · 긴급 이용권 기간이면 그대로 전화까지
  select full_until, msg_until into v_full, v_msg from car_coupons where registration_id = p_reg;
  if v_full is null then return p_base; end if;                 -- 쿠폰 차가 아니면 예전 규칙 그대로
  if now() < v_full then return 'full'; end if;
  if now() < v_msg  then return 'message_only'; end if;
  return 'blocked';                                             -- 무료 2개월(전화 1 + 문자 1)이 끝남
end $$;

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
  if baroka_is_car(p_registration_id) then return 'full'; end if;     -- 바로카 · 차량 이용권
  return car_coupon_mode(p_registration_id, ac_mode_core(v_category, v_owner));   -- 🔴 쿠폰
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
  if baroka_is_car(v_reg) then return new; end if;
  v_mode := car_coupon_mode(v_reg, ac_mode_core(v_category, v_owner));   -- 🔴 쿠폰

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

revoke execute on function public.car_coupon_claim(uuid, text, text) from public, anon;
grant  execute on function public.car_coupon_claim(uuid, text, text) to authenticated;
revoke execute on function public.car_coupon_check(text) from public, anon;
grant  execute on function public.car_coupon_check(text) to authenticated;
revoke execute on function public.car_coupon_list() from public, anon;
grant  execute on function public.car_coupon_list() to authenticated;
revoke execute on function public.car_coupon_mode(uuid, text) from public, anon, authenticated;
revoke execute on function public.registration_connect_mode(uuid) from public;
grant  execute on function public.registration_connect_mode(uuid) to anon, authenticated;

select 'car coupon ok' as result, (select count(*) from car_coupons) as coupons;
