-- =====================================================================
-- 🏪 단골창구 — 가게 주소 (2026-11-15)
--   · 손님이 내비에 찍고 찾아갈 수 있게, 같은 상호를 구분할 수 있게 주소를 받습니다(새로 열 때 필수).
--   · 주소 · 상세주소도 다른 칸처럼 사장님이 언제든 고칠 수 있습니다(가게 꾸미기 → 저장).
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 9_dangol_desk.sql 다음.
-- =====================================================================

alter table public.dg_desks add column if not exists address        text;   -- 도로명 주소 (주소 검색으로)
alter table public.dg_desks add column if not exists address_detail text;   -- 상세 주소 (층 · 호수)

-- 손님 · 사장님 화면에 주소를 함께 보냅니다
create or replace function public._dg_desk_json(d dg_desks) returns jsonb language sql stable as $$
  select jsonb_build_object('code', d.code, 'name', d.name, 'category', d.category, 'intro', d.intro, 'hours', d.hours,
    'region', d.region, 'photo', d.photo_path, 'greeting', d.greeting, 'items', d.items, 'verified', d.verified,
    'address', d.address, 'address_detail', d.address_detail)
$$;

-- 새로 열기 (주소 필수) — 예전 dg_open(5칸)은 그대로 두어 옛 화면도 열립니다
create or replace function public.dg_open(p_name text, p_category text, p_intro text, p_hours text, p_region text,
                                          p_address text, p_address_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5 then return jsonb_build_object('ok', false, 'error', 'no_address'); end if;
  if (select count(*) from dg_desks where owner_user_id = v_uid and status <> 'closed') >= 3 then return jsonb_build_object('ok', false, 'error', 'too_many_desks'); end if;
  v_code := _dg_code();
  insert into dg_desks (owner_user_id, code, name, category, intro, hours, region, address, address_detail)
  values (v_uid, v_code, left(btrim(p_name), 30), left(p_category, 20), left(p_intro, 400), left(p_hours, 80), left(p_region, 40),
          left(btrim(p_address), 120), left(nullif(btrim(p_address_detail), ''), 60))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end $$;

-- 주소 고치기 (가게 꾸미기에서 [저장]할 때 dg_update 와 함께 부릅니다)
create or replace function public.dg_set_address(p_desk uuid, p_address text, p_address_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5 then return jsonb_build_object('ok', false, 'error', 'no_address'); end if;
  update dg_desks set address = left(btrim(p_address), 120), address_detail = left(nullif(btrim(p_address_detail), ''), 60), updated_at = now()
   where id = p_desk;
  return jsonb_build_object('ok', true);
end $$;

-- 「내가 물어본 가게」 목록에도 주소를 (같은 상호 구분)
create or replace function public.dg_guest_threads(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', t.id, 'code', d.code, 'name', d.name, 'photo', d.photo_path, 'status', t.status,
             'address', d.address, 'region', d.region,
             'unread', t.guest_unread, 'updated_at', t.updated_at, 'live', _dg_live(d),
             'msgs', (select coalesce(jsonb_agg(jsonb_build_object('o', m.from_owner, 'b', m.body, 't', m.created_at) order by m.id), '[]'::jsonb)
                        from dg_msgs m where m.thread_id = t.id)) as x
      from dg_threads t join dg_desks d on d.id = t.desk_id
     where t.guest_hash = _dg_hash(p_token) and d.status <> 'closed'
     order by t.updated_at desc limit 30) s
$$;

revoke execute on function public.dg_open(text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.dg_open(text, text, text, text, text, text, text) to authenticated;
revoke execute on function public.dg_set_address(uuid, text, text) from public, anon;
grant  execute on function public.dg_set_address(uuid, text, text) to authenticated;
grant  execute on function public.dg_guest_threads(text) to anon, authenticated;

select 'dangol address ok' as result, (select count(*) from public.dg_desks where address is null) as desks_without_address;
