-- ═══════════════════════════════════════════════════════════════════════
-- 🏪 2026-11-15 단골창구 개설료 결제 — 1년 9,900원
--   상품: 구글 garim_dangol_1y · 애플 garim_dangol_1y_nr(비갱신) · 웹 카드(이니시스)
--   aliascall-google-verify · aliascall-web-pay 함수가 결제를 확인한 뒤 service_role 로 부릅니다.
--   같은 결제로 두 번 늘어나지 않게 결제 번호를 적어 둡니다(dg_pay_log).
--   에일리어스콜 프로젝트(qmwaraittiurkynszjts) SQL 편집기에서 한 번 실행하세요.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.dg_pay_log (
  payment_id  uuid primary key,
  desk_id     uuid not null references public.dg_desks(id) on delete cascade,
  user_id     uuid not null,
  months      int not null,
  until_after timestamptz,
  source      text,
  created_at  timestamptz not null default now()
);
alter table public.dg_pay_log enable row level security;
revoke all on public.dg_pay_log from anon, authenticated;
grant all on public.dg_pay_log to service_role;

-- 결제 전 확인: 내 단골창구이고 닫지 않았는가 (웹 결제 precheck · 앱 화면)
create or replace function public.dg_can_pay(p_user uuid, p_desk uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from dg_desks where id = p_desk and owner_user_id = p_user and status <> 'closed');
$$;

-- 결제 확인 뒤 기간 넣기 (멱등)
create or replace function public.dg_grant_paid(p_user uuid, p_desk uuid, p_months int, p_payment uuid, p_source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; l dg_pay_log; v timestamptz;
begin
  select * into l from dg_pay_log where payment_id = p_payment;
  if l.payment_id is not null then
    return jsonb_build_object('ok', l.desk_id = p_desk, 'already', true, 'until', l.until_after);
  end if;
  select * into d from dg_desks where id = p_desk for update;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'no_desk'); end if;
  if d.owner_user_id <> p_user then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if d.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if coalesce(p_months, 0) < 1 or p_months > 36 then return jsonb_build_object('ok', false, 'error', 'bad_months'); end if;
  v := dg_extend(p_desk, p_months);
  insert into dg_pay_log (payment_id, desk_id, user_id, months, until_after, source)
  values (p_payment, p_desk, p_user, p_months, v, p_source);
  return jsonb_build_object('ok', true, 'until', v);
end $$;

revoke all on function public.dg_can_pay(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dg_grant_paid(uuid, uuid, int, uuid, text) from public, anon, authenticated;
grant execute on function public.dg_can_pay(uuid, uuid) to service_role;
grant execute on function public.dg_grant_paid(uuid, uuid, int, uuid, text) to service_role;

select 'dangol pay ok' as result, (select count(*) from public.dg_pay_log) as paid;
