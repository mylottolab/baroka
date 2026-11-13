-- =====================================================================
-- 종합관리자 · 가입자 현황 / 이용권 구매 현황 (가림 · 바로카 서버) — 2026-11-13
--   admin_member_report()             : 가입자 한 명씩 (가입일 · 앱 · 닉네임 · 산 이용권 · 금액 · 유효기간)
--   admin_purchase_report(from, to)   : 결제 한 건씩 (결제일 · 앱 · 닉네임 · 상품 · 결제 방법 · 금액 · 유효기간)
--   관리자(is_global_admin)만 부를 수 있습니다. 아무것도 바꾸지 않고 읽기만 합니다.
--
--   ⚠ Supabase(에일리어스콜 프로젝트) → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
-- =====================================================================

create or replace function public.admin_member_report()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(x order by joined desc), '[]'::jsonb) into v from (
    select u.created_at as joined, jsonb_build_object(
      'id', u.id,
      'joined', u.created_at,
      'app', coalesce(nullif(u.raw_user_meta_data->>'app', ''),
               case when exists (select 1 from payments q where q.user_id = u.id and to_jsonb(q)->>'google_product_id' like 'baroka%')
                      or ((exists (select 1 from baroka_cars b where b.user_id = u.id) or exists (select 1 from baroka_credits c where c.user_id = u.id))
                          and not exists (select 1 from payments q where q.user_id = u.id and to_jsonb(q)->>'google_product_id' like 'garim_car%'))
                    then 'baroka?' else 'garim?' end),
      'nick', to_jsonb(p)->>'nickname',
      'login', u.email,
      'anon', coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false),
      'last_in', u.last_sign_in_at,
      'emergency_until', to_jsonb(p)->>'subscription_expires_at',
      'line_until', (select max(h.expires_at) from hotlines h where h.owner_user_id = u.id),
      'lines_live', (select count(*) from hotlines h where h.owner_user_id = u.id and h.expires_at > now()),
      'cars_paid', (select count(*) from baroka_cars b where b.user_id = u.id),
      'coupon', (select jsonb_build_object('full_until', c.full_until, 'msg_until', c.msg_until) from car_coupons c where c.user_id = u.id limit 1),
      'pay_n', coalesce(pp.n, 0), 'pay_krw', coalesce(pp.krw, 0), 'pay_other', pp.other, 'products', pp.products,
      'refund_n', coalesce(pp.rn, 0)
    ) as x
    from auth.users u
    left join profiles p on p.id = u.id
    left join lateral (
      select count(*) filter (where q.status = 'completed') as n,
             sum(q.amount_minor_units) filter (where q.status = 'completed' and trim(q.currency_code) = 'KRW') as krw,
             nullif(string_agg(distinct case when q.status = 'completed' and trim(q.currency_code) <> 'KRW'
                      then (q.amount_minor_units / 100.0)::text || ' ' || trim(q.currency_code) end, ', '), '') as other,
             count(*) filter (where q.status = 'refunded') as rn,
             jsonb_agg(distinct coalesce(to_jsonb(q)->>'google_product_id', q.purpose::text)) filter (where q.status = 'completed') as products
        from payments q where q.user_id = u.id and q.status in ('completed', 'refunded')
    ) pp on true
  ) s;
  return v;
end $$;

create or replace function public.admin_purchase_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(x order by at desc), '[]'::jsonb) into v from (
    select coalesce(q.completed_at, q.created_at) as at, jsonb_build_object(
      'id', q.id,
      'at', coalesce(q.completed_at, q.created_at),
      'user_id', q.user_id,
      'nick', to_jsonb(p)->>'nickname',
      'login', u.email,
      'joined', u.created_at,
      'user_app', u.raw_user_meta_data->>'app',
      'product', coalesce(to_jsonb(q)->>'google_product_id', q.purpose::text),
      'action', to_jsonb(q)->>'google_action',
      'purpose', q.purpose,
      'method', q.method,
      'amount', q.amount_minor_units,
      'currency', trim(q.currency_code),
      'status', q.status,
      'until', coalesce(
         (select h.expires_at::text from hotlines h where h.id::text = to_jsonb(q)->>'hotline_id'),
         (select coalesce(to_jsonb(hs)->>'expires_at', to_jsonb(hs)->>'ends_at', to_jsonb(hs)->>'current_period_end')
            from hotline_subscriptions hs where hs.id::text = to_jsonb(q)->>'hotline_subscription_id'),
         case when q.purpose::text = 'subscription' or to_jsonb(q)->>'google_action' = 'emergency'
              then to_jsonb(p)->>'subscription_expires_at' end)
    ) as x
    from payments q
    left join auth.users u on u.id = q.user_id
    left join profiles p on p.id = q.user_id
   where q.status in ('completed', 'refunded')
     and (p_from is null or (coalesce(q.completed_at, q.created_at) at time zone 'Asia/Seoul')::date >= p_from)
     and (p_to   is null or (coalesce(q.completed_at, q.created_at) at time zone 'Asia/Seoul')::date <= p_to)
   limit 20000
  ) s;
  return v;
end $$;

revoke execute on function public.admin_member_report() from public, anon;
grant  execute on function public.admin_member_report() to authenticated;
revoke execute on function public.admin_purchase_report(date, date) from public, anon;
grant  execute on function public.admin_purchase_report(date, date) to authenticated;

-- 확인: 아래 한 줄이 보이면 끝 (관리자가 아닌 SQL Editor 에서는 숫자 대신 이 문구만 나옵니다)
select 'admin members ok' as result,
       (select count(*) from auth.users) as members,
       (select count(*) from payments where status = 'completed') as paid;
