-- =====================================================================
-- 💬 단톡방 — 방장 바뀜 보완 (2026-11-17)
--   ① 이용 기간 연장 · 저장권은 방 사람 누구나 낼 수 있습니다(방장 권한은 그대로).
--      결제하면 방에 「OO님이 이용 기간을 늘렸어요」가 뜹니다.
--   ② 방장 자리비움: 방을 만들 때 개설자가 「방장이 며칠 동안 안 들어오면 다른 사람이 방장 맡기를 누를 수 있게 할지」 정합니다(7~365일, 기본 60일).
--      그 기간이 지나면 방 사람 누구나 「👑 방장 맡기」를 누를 수 있고, 방에 알림이 뜹니다.
--      7일 안에 원래 방장이 들어오면 신청이 취소되고, 안 들어오면 신청한 사람이 방장이 됩니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 20_dantok_forget.sql 다음.
-- =====================================================================

alter table public.dt_rooms   add column if not exists away_days int not null default 60;
alter table public.dt_rooms   add column if not exists claim     jsonb;            -- { by, nick, at }
alter table public.dt_members add column if not exists last_seen timestamptz not null default now();

-- 방장 자리비움 처리: 원래 방장이 돌아왔으면 신청 취소, 7일이 지났으면 신청한 사람에게 넘김
create or replace function public._dt_owner_check(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_seen timestamptz; v_by uuid; v_nick text;
begin
  select * into r from dt_rooms where id = p_room;
  if r.id is null or r.claim is null then return; end if;
  select last_seen into v_seen from dt_members where room_id = p_room and user_id = r.owner_id and state = 'in';
  v_by := (r.claim->>'by')::uuid;
  if v_seen is not null and v_seen > (r.claim->>'at')::timestamptz then
    update dt_rooms set claim = null where id = p_room;
    perform _dt_sys(p_room, '👑 방장이 돌아와서 「방장 맡기」 신청이 취소됐어요.');
  elsif (r.claim->>'at')::timestamptz < now() - interval '7 days' then
    select nick into v_nick from dt_members where room_id = p_room and user_id = v_by and state = 'in';
    if v_nick is null then update dt_rooms set claim = null where id = p_room; return; end if;
    update dt_members set role = 'member' where room_id = p_room and user_id = r.owner_id;
    update dt_members set role = 'owner' where room_id = p_room and user_id = v_by;
    update dt_rooms set owner_id = v_by, claim = null, updated_at = now() where id = p_room;
    perform _dt_sys(p_room, '👑 방장이 오래 자리를 비워 ' || v_nick || '님이 새 방장이 됐어요.');
  end if;
end $$;

-- 들어올 때마다 「마지막으로 본 때」를 적고, 자리비움을 처리합니다
create or replace function public._dt_seen(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update dt_members set last_seen = now() where room_id = p_room and user_id = auth.uid() and state = 'in' and last_seen < now() - interval '5 minutes';
  perform _dt_owner_check(p_room);
end $$;

create or replace function public.dt_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_seen timestamptz;
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  perform _dt_seen(p_room);
  select * into r from dt_rooms where id = p_room;
  select last_seen into v_seen from dt_members where room_id = p_room and user_id = r.owner_id;
  return jsonb_build_object('ok', true, 'room', _dt_room_json(r, auth.uid()) || jsonb_build_object(
    'away_days', r.away_days, 'owner_seen', v_seen, 'claim', r.claim,
    'can_claim', r.owner_id <> auth.uid() and r.claim is null and r.status = 'active' and coalesce(v_seen, r.created_at) < now() - make_interval(days => r.away_days)));
end $$;

create or replace function public.dt_read(p_room uuid, p_last bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update dt_members set last_read = greatest(last_read, coalesce(p_last, 0)) where room_id = p_room and user_id = auth.uid() and state = 'in';
  perform _dt_seen(p_room);
end $$;

-- 방 만들기 (자리비움 날수 추가) — 15번의 3칸짜리는 지웁니다
drop function if exists public.dt_create(text, text, date);
create or replace function public.dt_create(p_name text, p_nick text, p_ends_on date default null, p_away_days int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text; v_nick text := _dt_nick(p_nick);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'no_nick'); end if;
  if coalesce(p_away_days, 60) not between 7 and 365 then return jsonb_build_object('ok', false, 'error', 'away_days'); end if;
  if (select count(*) from dt_rooms where owner_id = v_uid and status = 'active') >= 5 then return jsonb_build_object('ok', false, 'error', 'too_many_rooms'); end if;
  if p_ends_on is not null and p_ends_on < (now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('ok', false, 'error', 'bad_date'); end if;
  v_code := _dt_code();
  insert into dt_rooms (code, name, owner_id, ends_on, away_days) values (v_code, left(btrim(p_name), 30), v_uid, p_ends_on, coalesce(p_away_days, 60)) returning id into v_id;
  insert into dt_members (room_id, user_id, nick, color, role) values (v_id, v_uid, v_nick, floor(random() * 8)::int, 'owner');
  perform _dt_sys(v_id, v_nick || '님이 방을 만들었어요. (방장이 ' || coalesce(p_away_days, 60) || '일 동안 자리를 비우면 다른 분이 방장을 맡을 수 있어요)');
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end $$;

-- 방장: 자리비움 날수 바꾸기
create or replace function public.dt_set_away(p_room uuid, p_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _dt_owner(p_room) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if coalesce(p_days, 0) not between 7 and 365 then return jsonb_build_object('ok', false, 'error', 'away_days'); end if;
  update dt_rooms set away_days = p_days, updated_at = now() where id = p_room and away_days <> p_days;
  if found then perform _dt_sys(p_room, '👑 방장 자리비움 기간이 ' || p_days || '일로 바뀌었어요.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 방 사람: 👑 방장 맡기 신청
create or replace function public.dt_claim(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_seen timestamptz; v_nick text;
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  perform _dt_owner_check(p_room);
  select * into r from dt_rooms where id = p_room for update;
  if r.owner_id = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if r.claim is not null then return jsonb_build_object('ok', false, 'error', 'claimed'); end if;
  select last_seen into v_seen from dt_members where room_id = p_room and user_id = r.owner_id;
  if coalesce(v_seen, r.created_at) >= now() - make_interval(days => r.away_days) then return jsonb_build_object('ok', false, 'error', 'owner_here'); end if;
  select nick into v_nick from dt_members where room_id = p_room and user_id = auth.uid();
  update dt_rooms set claim = jsonb_build_object('by', auth.uid(), 'nick', v_nick, 'at', now()) where id = p_room;
  perform _dt_sys(p_room, '👑 방장이 ' || r.away_days || '일 넘게 자리를 비워 ' || v_nick || '님이 「방장 맡기」를 신청했어요. 방장이 7일 안에 들어오지 않으면 ' || v_nick || '님이 새 방장이 돼요.');
  return jsonb_build_object('ok', true);
end $$;

-- ① 연장 · 저장권은 방 사람 누구나 (19번의 것을 고칩니다)
create or replace function public.dt_can_pay(p_user uuid, p_sku text, p_target text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is null then return false; end if;
  if p_sku in ('dantok_room_1y', 'dantok_room_10g') then
    return p_target ~ '^[0-9a-f-]{36}$' and exists (select 1 from dt_rooms r join dt_members m on m.room_id = r.id
             where r.id = p_target::uuid and r.status = 'active' and m.user_id = p_user and m.state = 'in');
  end if;
  return p_sku in ('dantok_gal_5g', 'dantok_gal_15g');
end $$;

create or replace function public.dt_grant_paid(p_user uuid, p_sku text, p_target text, p_payment uuid, p_source text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l dt_pay_log; r dt_rooms; v jsonb; v_until timestamptz; v_bytes bigint; v_nick text;
begin
  select * into l from dt_pay_log where payment_id = p_payment;
  if l.payment_id is not null then return coalesce(l.result, '{}'::jsonb) || jsonb_build_object('already', true); end if;
  if not dt_can_pay(p_user, p_sku, p_target) then return jsonb_build_object('ok', false, 'error', 'no_target'); end if;
  if p_sku in ('dantok_room_1y', 'dantok_room_10g') then
    select nick into v_nick from dt_members where room_id = p_target::uuid and user_id = p_user;
  end if;
  if p_sku = 'dantok_room_1y' then
    update dt_rooms set until = greatest(until, now()) + interval '12 months', updated_at = now() where id = p_target::uuid returning * into r;
    perform _dt_sys(r.id, '🎉 ' || coalesce(v_nick, '') || '님이 이용 기간을 ' || to_char(r.until at time zone 'Asia/Seoul', 'YYYY.MM.DD') || '까지 늘렸어요. 고마워요!');
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'room', 'until', r.until);
  elsif p_sku = 'dantok_room_10g' then
    insert into dt_room_packs (room_id, bytes, until, payment_id) values (p_target::uuid, 10737418240, now() + interval '12 months', p_payment);
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'room_storage', 'quota', _dt_requota(p_target::uuid));
    perform _dt_sys(p_target::uuid, '💾 ' || coalesce(v_nick, '') || '님이 방 저장 공간을 10GB 늘렸어요. 고마워요!');
  else
    v_bytes := case p_sku when 'dantok_gal_15g' then 16106127360 else 5368709120 end;
    insert into dt_user_plan (user_id, gal_bytes, until) values (p_user, v_bytes, now() + interval '12 months')
    on conflict (user_id) do update set
      gal_bytes = case when dt_user_plan.until > now() then greatest(dt_user_plan.gal_bytes, excluded.gal_bytes) else excluded.gal_bytes end,
      until = greatest(coalesce(dt_user_plan.until, now()), now()) + interval '12 months', updated_at = now()
    returning until, gal_bytes into v_until, v_bytes;
    v := jsonb_build_object('ok', true, 'kind', 'dantok', 'what', 'gallery', 'until', v_until, 'bytes', v_bytes);
  end if;
  insert into dt_pay_log (payment_id, user_id, sku, target, result, source) values (p_payment, p_user, p_sku, p_target, v, p_source);
  return v;
end $$;

-- 넘김 · 나감이 생기면 남아 있던 맡기 신청은 지웁니다
create or replace function public._dt_claim_clear() returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then new.claim := null; end if;
  return new;
end $$;
drop trigger if exists dt_rooms_claim_clear on public.dt_rooms;
create trigger dt_rooms_claim_clear before update of owner_id on public.dt_rooms for each row execute function public._dt_claim_clear();

do $$ declare f text; begin
  foreach f in array array['dt_room(uuid)', 'dt_read(uuid, bigint)', 'dt_create(text, text, date, int)', 'dt_set_away(uuid, int)', 'dt_claim(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_dt_owner_check(uuid)', '_dt_seen(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

select 'dantok owner ok' as result;
