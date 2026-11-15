-- =====================================================================
-- 🏪 단골창구 — 가게가 직접 적는 「자주 묻는 질문」 (가림 서버 · 2026-11-15)
--   업무용 프로의 공개 업체 페이지(aliascall_business.html)를 「○○ 단골창구」로 쓰면서,
--   손님이 상담을 요청하기 전에 가게의 자주 묻는 질문에서 먼저 답을 찾게 합니다.
--   상담 요청 · 상담방 · 알림은 기존 업무용 프로 그대로입니다(이 파일은 건드리지 않음).
--
--   만드는 것
--     dg_faq            업체(업무용 프로 구독)마다 인사말 · 자주 묻는 질문 30개까지
--     dg_get_faq(slug)  손님 화면이 읽음 (로그인 없이)
--     dg_my_faq(sub)    사장님 화면이 읽음
--     dg_set_faq(sub, items, greeting)  사장님이 저장 — 그 구독의 주인인지 get_my_business() 로 확인
--
--   ⚠ Supabase(에일리어스콜 프로젝트) → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
-- =====================================================================

create table if not exists public.dg_faq (
  subscription_id uuid primary key,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  slug            text not null,
  greeting        text,
  items           jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);
create index if not exists dg_faq_slug_idx on public.dg_faq (slug);
alter table public.dg_faq enable row level security;
revoke all on public.dg_faq from public, anon, authenticated;
grant all on public.dg_faq to service_role;

-- 손님: 가게 주소(slug)로 읽기
create or replace function public.dg_get_faq(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('greeting', f.greeting, 'items', f.items, 'updated_at', f.updated_at)
                     from dg_faq f where f.slug = p_slug order by f.updated_at desc limit 1),
                  jsonb_build_object('greeting', null, 'items', '[]'::jsonb));
$$;

-- 사장님: 내 것 읽기
create or replace function public.dg_my_faq(p_subscription_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  v := to_jsonb(public.get_my_business(p_subscription_id));
  if v is null or not coalesce((v->>'ok')::boolean, false) then return jsonb_build_object('ok', false, 'error', coalesce(v->>'error', '권한이 없습니다')); end if;
  return jsonb_build_object('ok', true, 'slug', v->>'slug',
    'greeting', (select greeting from dg_faq where subscription_id = p_subscription_id),
    'items', coalesce((select items from dg_faq where subscription_id = p_subscription_id), '[]'::jsonb));
end $$;

-- 사장님: 저장 (질문 30개까지 · 질문 80자 · 답 600자)
create or replace function public.dg_set_faq(p_subscription_id uuid, p_items jsonb, p_greeting text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v jsonb; v_items jsonb;
begin
  v := to_jsonb(public.get_my_business(p_subscription_id));
  if v is null or not coalesce((v->>'ok')::boolean, false) then return jsonb_build_object('ok', false, 'error', coalesce(v->>'error', '권한이 없습니다')); end if;
  if coalesce(v->>'slug', '') = '' then return jsonb_build_object('ok', false, 'error', '먼저 업체 정보를 저장해 주세요.'); end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then return jsonb_build_object('ok', false, 'error', '형식이 맞지 않습니다.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('q', left(btrim(x->>'q'), 80), 'a', left(btrim(x->>'a'), 600)) order by n), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(x, n)
   where n <= 30 and length(btrim(coalesce(x->>'q', ''))) > 0 and length(btrim(coalesce(x->>'a', ''))) > 0;
  insert into dg_faq (subscription_id, owner_user_id, slug, greeting, items)
  values (p_subscription_id, auth.uid(), v->>'slug', left(nullif(btrim(p_greeting), ''), 200), v_items)
  on conflict (subscription_id) do update set slug = excluded.slug, greeting = excluded.greeting, items = excluded.items,
         owner_user_id = excluded.owner_user_id, updated_at = now();
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_items), 'slug', v->>'slug');
end $$;

revoke execute on function public.dg_get_faq(text) from public;
grant  execute on function public.dg_get_faq(text) to anon, authenticated;
revoke execute on function public.dg_my_faq(uuid) from public, anon;
grant  execute on function public.dg_my_faq(uuid) to authenticated;
revoke execute on function public.dg_set_faq(uuid, jsonb, text) from public, anon;
grant  execute on function public.dg_set_faq(uuid, jsonb, text) to authenticated;

select 'dangol ok' as result, (select count(*) from dg_faq) as shops;
