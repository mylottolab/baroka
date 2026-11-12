-- =====================================================================
-- 가림콜 차량 이용권 — 2026-11-12
--   가림콜(aliascall.com · 가림콜 앱)에서도 바로카와 똑같은 「차량 이용권」을 팝니다.
--     · 상품: garim_car_reg(2,500원 · 차 1대 등록) · garim_car_change(2,500원 · 번호 변경 1회)
--     · 권과 차는 바로카 것(baroka_credits · baroka_cars)을 그대로 씁니다 → 연결은 언제나 전화 + 메시지
--     · 매출은 상품 번호(garim_car_…)로 '가림'에 잡힙니다
--
--   이 파일이 하는 일
--     ① 이용권을 쓴 차는 번호를 「번호 변경(2,500원)」으로만 바꿀 수 있게 막습니다
--        (예전에는 가림콜 「수정」 창에서 번호를 마음대로 바꿀 수 있었음 — 바로카 규칙과 어긋남)
--     ② baroka_change_plate 가 ①의 막음을 통과하도록 한 줄을 더합니다(나머지는 그대로)
--
--   ⚠ Supabase → SQL Editor 에 통째로 붙여 Run 합니다. 다시 돌려도 안전합니다.
--   ⚠ 1_baroka.sql 을 먼저 돌린 서버여야 합니다(이미 돌렸습니다).
-- =====================================================================

-- ① 이용권 차는 번호를 바로 못 바꿉니다 ------------------------------------------------
create or replace function public.baroka_plate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('baroka.allow', true), '') = '1' then return new; end if;
  if TG_TABLE_NAME = 'registration_vehicles' then
    if new.plate_number is distinct from old.plate_number and baroka_is_car(new.registration_id) then
      raise exception 'baroka_change_required';
    end if;
  else
    if new.search_key is distinct from old.search_key and baroka_is_car(new.id) then
      raise exception 'baroka_change_required';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists baroka_plate_guard_rv on public.registration_vehicles;
create trigger baroka_plate_guard_rv before update of plate_number on public.registration_vehicles
  for each row execute function public.baroka_plate_guard();
drop trigger if exists baroka_plate_guard_reg on public.registrations;
create trigger baroka_plate_guard_reg before update of search_key on public.registrations
  for each row execute function public.baroka_plate_guard();

-- ② 번호 변경권으로 바꿀 때만 통과 ------------------------------------------------------
create or replace function public.baroka_change_plate(p_reg uuid, p_plate text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_old text; v_cr bigint; v_new text := trim(coalesce(p_plate, ''));
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select plate into v_old from baroka_cars where registration_id = p_reg and user_id = v_uid;
  if v_old is null then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if not baroka_plate_ok(v_new) then return jsonb_build_object('ok', false, 'error', 'bad_plate'); end if;
  if baroka_plate_key(v_new) = baroka_plate_key(v_old) then return jsonb_build_object('ok', false, 'error', 'same'); end if;

  select id into v_cr from baroka_credits
   where user_id = v_uid and kind = 'change' and used_at is null order by created_at limit 1 for update skip locked;
  if v_cr is null then return jsonb_build_object('ok', false, 'error', 'no_credit'); end if;

  perform set_config('baroka.allow', '1', true);          -- 🔴 ① 의 막음을 이 거래 안에서만 통과
  update baroka_credits set used_at = now(), used_reg = p_reg where id = v_cr;
  update baroka_cars set plate = v_new, plate_key = baroka_plate_key(v_new), changes = changes + 1, updated_at = now()
   where registration_id = p_reg;
  update registration_vehicles set plate_number = v_new where registration_id = p_reg;
  update registrations set search_key = v_new, updated_at = now() where id = p_reg;
  perform set_config('baroka.allow', '', true);
  insert into baroka_log (user_id, registration_id, action, old_plate, new_plate) values (v_uid, p_reg, 'change', v_old, v_new);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.baroka_plate_guard() from public, anon, authenticated;
revoke execute on function public.baroka_change_plate(uuid, text) from public, anon;
grant execute on function public.baroka_change_plate(uuid, text) to authenticated;

-- 확인: 아래가 보이면 끝
select 'garim car pass ok' as result,
       (select count(*) from pg_trigger where tgname in ('baroka_plate_guard_rv', 'baroka_plate_guard_reg')) as triggers;
