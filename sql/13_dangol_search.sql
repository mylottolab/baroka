-- =====================================================================
-- 🔎 단골창구 — 가게 이름으로 찾기 (2026-11-15)
--   고객님 화면의 찾기 칸: 6자리 코드 또는 가게 이름 · 동네(여러 낱말이면 모두 들어간 가게)
--   예) 「칼국수」 · 「행복칼국수」 · 「칼국수 권선」 · 「HYAASH」
--   지금 문의를 받는 가게(운영 중 · 기간 안)만, 최대 20곳. 로그인 없이 부릅니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 12_dangol_address.sql 다음.
-- =====================================================================

create or replace function public.dg_search(p_q text)
returns jsonb language sql stable security definer set search_path = public as $$
  with q as (select btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')) as s),
  w as (select array_remove(regexp_split_to_array(lower((select s from q)), ' '), '') as ws),
  hit as (
    select d.*,
      case when upper((select s from q)) = d.code then 0
           when lower(replace(d.name, ' ', '')) = lower(replace((select s from q), ' ', '')) then 1
           when lower(replace(d.name, ' ', '')) like lower(replace((select s from q), ' ', '')) || '%' then 2
           else 3 end as rank
      from dg_desks d
     where d.status = 'active' and d.until > now()
       and char_length((select s from q)) >= 2
       and (upper((select s from q)) = d.code
            or not exists (select 1 from unnest((select ws from w)) x
                            where position(replace(x, ' ', '') in lower(replace(d.name || coalesce(d.address, '') || coalesce(d.region, '') || coalesce(d.category, ''), ' ', ''))) = 0))
     order by rank, d.verified desc, d.updated_at desc
     limit 20)
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'category', category, 'address', address,
           'region', region, 'verified', verified, 'photo', photo_path) order by rank, verified desc, updated_at desc), '[]'::jsonb)
    from hit;
$$;

revoke execute on function public.dg_search(text) from public;
grant  execute on function public.dg_search(text) to anon, authenticated;

select 'dangol search ok' as result, jsonb_array_length(public.dg_search('가게')) as sample;
