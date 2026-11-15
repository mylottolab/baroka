-- =====================================================================
-- 🏪 단골창구 — 손님에게도 「사장님 답장」 알림 (단골창구 앱 · 2026-11-15)
--   손님은 가입이 없습니다. 단골창구 앱에서 「답장 오면 알림 받기」를 누르면
--   이 휴대폰의 손님 열쇠(dangol_token, 서버에는 지문만)와 알림 주소(FCM)를 짝지어 둡니다.
--   사장님이 답장하면 dangol-notify 함수(사장님 로그인으로 부름)가 그 손님 휴대폰에만 알립니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 9_dangol_desk.sql 다음.
-- =====================================================================

create table if not exists public.dg_guest_push (
  guest_hash  text primary key,
  push_token  text not null,
  platform    text,
  updated_at  timestamptz not null default now()
);
create index if not exists dg_guest_push_token_idx on public.dg_guest_push (push_token);
alter table public.dg_guest_push enable row level security;
revoke all on public.dg_guest_push from anon, authenticated;
grant all on public.dg_guest_push to service_role;

alter table public.dg_threads add column if not exists guest_notified_at timestamptz;

-- 손님 휴대폰이 부릅니다 (로그인 없이 · 손님 열쇠로)  p_push = null 이면 알림 끄기
create or replace function public.dg_guest_push_set(p_token text, p_push text, p_platform text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text := _dg_hash(p_token);
begin
  if h is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if p_push is null or length(p_push) < 20 then
    delete from dg_guest_push where guest_hash = h;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  if length(p_push) > 400 then return jsonb_build_object('ok', false, 'error', 'push'); end if;
  delete from dg_guest_push where push_token = p_push and guest_hash <> h;   -- 같은 휴대폰의 옛 짝 정리
  insert into dg_guest_push (guest_hash, push_token, platform) values (h, p_push, left(p_platform, 20))
  on conflict (guest_hash) do update set push_token = excluded.push_token, platform = excluded.platform, updated_at = now();
  return jsonb_build_object('ok', true, 'on', true);
end $$;

create or replace function public.dg_guest_push_on(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dg_guest_push where guest_hash = _dg_hash(p_token));
$$;

-- 사장님이 답장한 직후 dangol-notify 가 부릅니다(service_role). 그 사장님의 대화인지 · 방금 사장님이 쓴 글인지 확인
create or replace function public.dg_notify_guest_targets(p_thread uuid, p_owner uuid)
returns table (push_token text, desk_name text, code text, preview text) language plpgsql security definer set search_path = public as $$
declare t dg_threads; d dg_desks; m dg_msgs;
begin
  select * into t from dg_threads where id = p_thread;
  if t.id is null then return; end if;
  select * into d from dg_desks where id = t.desk_id;
  if d.owner_user_id is distinct from p_owner then return; end if;
  if t.guest_notified_at is not null and t.guest_notified_at > now() - interval '1 minute' then return; end if;
  select * into m from dg_msgs where thread_id = t.id order by id desc limit 1;
  if m.id is null or not m.from_owner or m.created_at < now() - interval '2 minutes' then return; end if;
  update dg_threads set guest_notified_at = now() where id = t.id;
  return query select g.push_token, d.name, d.code, left(m.body, 80) from dg_guest_push g where g.guest_hash = t.guest_hash;
end $$;

revoke execute on function public.dg_guest_push_set(text, text, text) from public;
grant  execute on function public.dg_guest_push_set(text, text, text) to anon, authenticated;
revoke execute on function public.dg_guest_push_on(text) from public;
grant  execute on function public.dg_guest_push_on(text) to anon, authenticated;
revoke execute on function public.dg_notify_guest_targets(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.dg_notify_guest_targets(uuid, uuid) to service_role;

select 'dangol guest push ok' as result, (select count(*) from public.dg_guest_push) as phones;
