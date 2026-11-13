-- =====================================================================
-- 종합관리자 · 차량 등록 현황 (가림 · 바로카 서버) — 2026-11-13
--   admin_car_report(from, to) : 차 한 대씩 (등록일 · 앱 · 등록한 사람 아이디 · 차번호 · 이용권 유무 · 지금 연결)
--   관리자(is_global_admin)만 부를 수 있습니다. 아무것도 바꾸지 않고 읽기만 합니다.
--
--   앱 구분: 차량 이용권으로 연 차는 결제한 상품으로(garim_car_… → 가림, baroka_… → 바로카),
--            간편 등록(무료쿠폰) 차는 등록할 때 고른 앱으로, 나머지는 가입한 앱으로 정합니다.
--
--   ⚠ Supabase(에일리어스콜 프로젝트) → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
-- =====================================================================

create or replace function public.admin_car_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(x order by at desc), '[]'::jsonb) into v from (
    select r.created_at as at, jsonb_build_object(
      'id', r.id,
      'at', r.created_at,
      'status', r.status,
      'plate', coalesce(rv.plate_number, r.search_key),
      'user_id', r.user_id,
      'nick', to_jsonb(p)->>'nickname',
      'login', u.email,
      'user_app', u.raw_user_meta_data->>'app',
      'paid', bc.registration_id is not null,
      'paid_at', bc.created_at,
      'pay_product', to_jsonb(q)->>'google_product_id',
      'pay_method', q.method,
      'pay_source', cr.source,
      'coupon_app', cc.app,
      'coupon_source', cc.source,
      'full_until', cc.full_until,
      'msg_until', cc.msg_until,
      'emergency_until', to_jsonb(p)->>'subscription_expires_at',
      'line_live', exists (select 1 from hotlines h where h.owner_user_id = r.user_id and h.expires_at > now()),
      'app', case
               when to_jsonb(q)->>'google_product_id' like 'baroka%' then 'baroka'
               when to_jsonb(q)->>'google_product_id' like 'garim_car%' then 'garim'
               when cc.app is not null then cc.app
               when u.raw_user_meta_data->>'app' in ('garim', 'baroka') then u.raw_user_meta_data->>'app'
               when bc.registration_id is not null then 'baroka?'
               else 'garim?' end,
      'mode', case when r.status::text = 'active' then public.registration_connect_mode(r.id) end
    ) as x
    from registrations r
    left join registration_vehicles rv on rv.registration_id = r.id
    left join auth.users u on u.id = r.user_id
    left join profiles p on p.id = r.user_id
    left join baroka_cars bc on bc.registration_id = r.id
    left join baroka_credits cr on cr.id = bc.credit_id
    left join payments q on q.id = cr.payment_id
    left join car_coupons cc on cc.registration_id = r.id
   where r.category::text = 'vehicle'
     and (p_from is null or (r.created_at at time zone 'Asia/Seoul')::date >= p_from)
     and (p_to   is null or (r.created_at at time zone 'Asia/Seoul')::date <= p_to)
   limit 20000
  ) s;
  return v;
end $$;

revoke execute on function public.admin_car_report(date, date) from public, anon;
grant  execute on function public.admin_car_report(date, date) to authenticated;

select 'admin cars ok' as result,
       (select count(*) from registrations where category::text = 'vehicle') as cars,
       (select count(*) from baroka_cars) as paid_cars,
       (select count(*) from car_coupons) as coupon_cars;
