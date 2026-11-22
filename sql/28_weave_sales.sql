-- =====================================================================
-- 💰 매출 센터 — 가림(에일리어스콜) 서버 (2026-11-22)
--   가림 Supabase SQL Editor 에서 Run. 읽기 전용 함수 하나만 만듭니다(표는 바꾸지 않음). 맨 아래 'weave sales garim ok'
--
--   weave_sales(시작일, 끝일, 달러환율) — 관리자만(is_global_admin)
--     날짜 · 앱 · 상품 · 결제수단별로 건수 · 총매출(원) · 환불 건수 · 환불액(원)을 돌려줍니다.
--     앱:   상품 번호가 baroka_ → 바로카 · dangol_ → 단골창구 · dantok_ → 단톡방 · 나머지 → 가림콜
--     수단: google_play → 구글 · app_store → 애플 · 무통장 → 무통장 · 그 밖(이니시스 카드 · PayPal) → 카드(PG)
--     날짜: 결제 완료 시각(한국 시간). 환불된 결제는 그 결제일의 매출과 환불에 함께 잡힙니다(순매출 = 총 − 환불).
--     달러(PayPal)는 센트 → 원(화면에서 정한 환율)으로 바꿉니다.
--   수수료 · 순매출은 화면(매출 센터)이 수단별 비율로 계산합니다(구글 15% · 애플 15% · 카드 5% · 무통장 0%).
-- =====================================================================
create or replace function public.weave_sales(p_from date, p_to date, p_usd_krw numeric default 1400)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_to   date := coalesce(p_to, (now() at time zone 'Asia/Seoul')::date);
  v_from date := coalesce(p_from, v_to - 29);
  v_rows jsonb;
begin
  if not coalesce(is_global_admin(), false) then raise exception 'not_admin'; end if;
  if v_from > v_to then raise exception 'bad_range'; end if;
  if v_to - v_from > 800 then v_from := v_to - 800; end if;

  with p as (
    select (coalesce(x.completed_at, x.created_at) at time zone 'Asia/Seoul')::date as day,
           x.status::text as st,
           lower(coalesce(x.google_product_id, '')) as pid,
           lower(coalesce(x.google_action, '')) as act,
           lower(coalesce(x.method::text, '')) as m,
           upper(trim(coalesce(x.currency_code::text, 'KRW'))) as cur,
           coalesce(x.amount_minor_units, 0)::numeric as amt,
           coalesce(x.purpose, '') as purpose,
           coalesce(x.hotline_tier, '') as tier,
           x.hotline_duration_months as months
      from payments x
     where x.status::text in ('completed', 'refunded')
       and (coalesce(x.completed_at, x.created_at) at time zone 'Asia/Seoul')::date between v_from and v_to
  ), q as (
    select day, st,
           case when pid like 'baroka%' or act like 'baroka%' then 'baroka'
                when pid like 'dangol%' or act = 'dangol' then 'dangol'
                when pid like 'dantok%' or act = 'dantok' then 'dantok'
                else 'garim' end as app,
           case when m like '%google%' then 'google'
                when m like '%app_store%' or m like '%apple%' then 'apple'
                when m like '%bank%' then 'bank'
                else 'pg' end as channel,
           coalesce(nullif(regexp_replace(pid, '_nr$', ''), ''),
                    nullif(purpose || case when tier <> '' then ' · ' || tier else '' end
                                    || case when months is not null then ' · ' || months || '개월' else '' end, ''),
                    '기타') as product,
           round(case when cur = 'USD' then amt / 100.0 * coalesce(p_usd_krw, 1400) else amt end) as krw
      from p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', day, 'app', app, 'product', product, 'channel', channel,
           'orders', n, 'gross', g, 'refunds', rn, 'refund', r) order by day, app, product), '[]'::jsonb)
    into v_rows
    from (select day, app, product, channel, count(*) n, sum(krw) g,
                 count(*) filter (where st = 'refunded') rn, coalesce(sum(krw) filter (where st = 'refunded'), 0) r
            from q group by 1, 2, 3, 4) t;

  return jsonb_build_object('server', 'garim', 'from', v_from, 'to', v_to, 'rows', v_rows);
end $$;
revoke all on function public.weave_sales(date, date, numeric) from public, anon;
grant execute on function public.weave_sales(date, date, numeric) to authenticated;

select 'weave sales garim ok' as result;
