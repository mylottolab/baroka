-- =====================================================================
-- 단톡방 관리 화면 (2026-11-22) · 에일리어스콜(가림) Supabase(qmwaraittiurkynszjts) SQL Editor 에서 Run
--   aliascall.com/aliascall_admin_dantok.html (위브앱 통합 관리 → 💬 단톡방) 이 쓰는 함수 셋. 관리자만(is_global_admin).
--   · admin_dt_report()   방 목록 · 신고 · 요약
--   · admin_dt_set()      방 멈춤(blocked) / 재개(active) · 기간 늘리기
--   · admin_dt_done()     그 방 신고 「처리함」
--   새 표 없음. 다시 돌려도 안전합니다. 맨 아래 'dantok admin ok'
-- =====================================================================
create or replace function public.admin_dt_report()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'rooms', (select count(*) from dt_rooms),
      'active', (select count(*) from dt_rooms where status = 'active' and until > now()),
      'new7', (select count(*) from dt_rooms where created_at > now() - interval '7 days'),
      'people', (select count(distinct user_id) from dt_members where state = 'in'),
      'msgs7', (select count(*) from dt_msgs where created_at > now() - interval '7 days' and user_id is not null),
      'reports', (select count(*) from dt_reports where status = 'open'),
      'paid', (select count(*) from dt_pay_log)),
    'by_sku', (select coalesce(jsonb_object_agg(sku, n), '{}') from (select sku, count(*) n from dt_pay_log group by sku) x),
    'rooms', (select coalesce(jsonb_agg(row_to_json(z)::jsonb order by z.reports desc, z.last_msg_at desc nulls last), '[]') from (
       select r.id, r.code, r.name, r.plan, r.status, r.until, r.ends_on, r.used_bytes, r.quota_bytes, r.last_msg_at, r.created_at,
              (select email from auth.users u where u.id = r.owner_id) as owner_login,
              (select nick from dt_members m where m.room_id = r.id and m.user_id = r.owner_id) as owner_nick,
              (select count(*) from dt_members m where m.room_id = r.id and m.state = 'in') as people,
              (select count(*) from dt_msgs m where m.room_id = r.id and m.user_id is not null) as msgs,
              (select count(*) from dt_reports p where p.room_id = r.id and p.status = 'open') as reports,
              (select coalesce(jsonb_agg(jsonb_build_object('reason', p.reason, 'at', p.created_at,
                        'body', (select left(coalesce(m.body, m.file_name, m.kind), 120) from dt_msgs m where m.id = p.msg_id),
                        'nick', (select nick from dt_members m where m.room_id = p.room_id and m.user_id = p.target)) order by p.created_at desc), '[]')
                 from dt_reports p where p.room_id = r.id and p.status = 'open') as report_list
         from dt_rooms r order by r.created_at desc limit 1000) z)
  ) into r;
  return r;
end $$;

create or replace function public.admin_dt_set(p_room uuid, p_status text default null, p_months int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  if p_status is not null and p_status not in ('active', 'blocked') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  update dt_rooms set status = coalesce(p_status, status),
         until = case when coalesce(p_months, 0) > 0 then greatest(until, now()) + make_interval(months => p_months) else until end,
         updated_at = now()
   where id = p_room;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.admin_dt_done(p_room uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  update dt_reports set status = 'done' where room_id = p_room and status = 'open';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'done', n);
end $$;

revoke all on function public.admin_dt_report(), public.admin_dt_set(uuid, text, int), public.admin_dt_done(uuid) from public, anon;
grant execute on function public.admin_dt_report(), public.admin_dt_set(uuid, text, int), public.admin_dt_done(uuid) to authenticated;
select 'dantok admin ok' as result;
