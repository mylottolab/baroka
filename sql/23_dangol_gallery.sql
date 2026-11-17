-- ═══════════════════════════════════════════════════════════════════════
-- 🏪 2026-11-17 단골창구 「우리 가게 갤러리」 — 사장님만 올리고, 손님은 가게 화면에서 봅니다(신상 · 새 메뉴 · 가게 모습)
--   블록 쌓기(테트리스처럼): 사진마다 크기 1x1(작게) · 2x1(가로) · 1x2(세로) · 2x2(크게), 순서는 사장님이 정함.
--   새로 올린 사진이 맨 앞(신상이 먼저 보이게).  쇼핑몰처럼 값 · 주문은 없습니다(사진 + 한 줄 설명만).
--   몇 장까지:  기본형 12장 · 실용형 40장 · 프리미엄형 80장
--   사진 파일은 가게 사진과 같은 공개 보관함 'dangol' 의 사장님 폴더(<사장님 번호>/g-…)에 둡니다(9_dangol_desk.sql 의 올리기 규칙 그대로).
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 22_dangol_plans.sql 다음.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.dg_shots (
  id         bigserial primary key,
  desk_id    uuid not null references public.dg_desks(id) on delete cascade,
  path       text not null,
  span       text not null default '1x1' check (span in ('1x1', '2x1', '1x2', '2x2')),
  caption    text,
  pos        int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists dg_shots_desk_idx on public.dg_shots (desk_id, pos, id desc);
alter table public.dg_shots enable row level security;
revoke all on public.dg_shots from anon, authenticated;
grant all on public.dg_shots to service_role;

create or replace function public._dg_shot_max(d dg_desks) returns int language sql stable as $$
  select case _dg_rank(_dg_plan(d)) when 3 then 80 when 2 then 40 else 12 end
$$;
create or replace function public._dg_shots_json(p_desk uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'p', s.path, 's', s.span, 'c', s.caption, 't', s.created_at) order by s.pos, s.id desc), '[]'::jsonb)
    from dg_shots s where s.desk_id = p_desk
$$;

-- 손님: 가게 갤러리 보기 (운영 중인 가게만)
create or replace function public.dg_shots(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select _dg_shots_json(d.id) from dg_desks d where d.code = upper(btrim(coalesce(p_code, ''))) and _dg_live(d)), '[]'::jsonb)
$$;

-- 사장님: 내 갤러리 (몇 장까지인지 함께)
create or replace function public.dg_owner_shots(p_desk uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d dg_desks;
begin
  select * into d from dg_desks where id = p_desk and owner_user_id = auth.uid();
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true, 'max', _dg_shot_max(d), 'shots', _dg_shots_json(d.id));
end $$;

-- 사장님: 사진 더하기 (맨 앞으로)
create or replace function public.dg_shot_add(p_desk uuid, p_path text, p_span text default '1x1', p_caption text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; n int;
begin
  select * into d from dg_desks where id = p_desk and owner_user_id = auth.uid() for update;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if coalesce(p_path, '') not like auth.uid()::text || '/%' then return jsonb_build_object('ok', false, 'error', 'photo'); end if;
  select count(*) into n from dg_shots where desk_id = d.id;
  if n >= _dg_shot_max(d) then return jsonb_build_object('ok', false, 'error', 'gallery_full', 'max', _dg_shot_max(d)); end if;
  insert into dg_shots (desk_id, path, span, caption, pos)
  values (d.id, p_path, case when p_span in ('1x1', '2x1', '1x2', '2x2') then p_span else '1x1' end,
          left(nullif(btrim(coalesce(p_caption, '')), ''), 40),
          coalesce((select min(pos) from dg_shots where desk_id = d.id), 0) - 1);
  return jsonb_build_object('ok', true);
end $$;

-- 사장님: 크기 · 설명 바꾸기
create or replace function public.dg_shot_set(p_id bigint, p_span text, p_caption text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_shots s set span = case when p_span in ('1x1', '2x1', '1x2', '2x2') then p_span else s.span end,
                        caption = left(nullif(btrim(coalesce(p_caption, '')), ''), 40)
   where s.id = p_id and exists (select 1 from dg_desks d where d.id = s.desk_id and d.owner_user_id = auth.uid());
  return jsonb_build_object('ok', found);
end $$;

-- 사장님: 지우기 → 지운 파일 주소를 돌려줘 화면이 보관함에서도 지웁니다
create or replace function public.dg_shot_del(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text;
begin
  delete from dg_shots s where s.id = p_id and exists (select 1 from dg_desks d where d.id = s.desk_id and d.owner_user_id = auth.uid()) returning path into v;
  return jsonb_build_object('ok', v is not null, 'path', v);
end $$;

-- 사장님: 순서 정하기 (화면에 보이는 순서대로 번호 목록)
create or replace function public.dg_shot_order(p_desk uuid, p_ids jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  update dg_shots s set pos = x.i from (select (v #>> '{}')::bigint id, (o - 1)::int i from jsonb_array_elements(p_ids) with ordinality t(v, o)) x
   where s.id = x.id and s.desk_id = p_desk;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.dg_shots(text) from public;
grant  execute on function public.dg_shots(text) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['dg_owner_shots(uuid)', 'dg_shot_add(uuid, text, text, text)', 'dg_shot_set(bigint, text, text)', 'dg_shot_del(bigint)', 'dg_shot_order(uuid, jsonb)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

select 'dangol gallery ok' as result, (select count(*) from public.dg_shots) as shots;
