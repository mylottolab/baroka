-- =====================================================================
-- 단톡방 — 알림에서 바로 [답장] · [읽음] (2026-11-22) · 가림(에일리어스콜) Supabase SQL Editor 에서 Run
--   dantok-quick-reply 함수(서버)만 부를 수 있는 함수 둘. 화면 · 손님은 못 부릅니다.
--   · dt_send_as(사람, 방, 글)  — dt_send 와 같은 검사(방 사람인지 · 방이 열려 있는지 · 너무 빠른지)로 글 한 줄
--   · dt_read_as(사람, 방)      — 그 방을 끝까지 읽음으로
--   새 표 없음. 다시 돌려도 안전합니다. 맨 아래 'dantok quick reply ok'
-- =====================================================================
create or replace function public.dt_send_as(p_user uuid, p_room uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_id bigint; b text := left(btrim(coalesce(p_body, '')), 2000);
begin
  if not exists (select 1 from dt_members where room_id = p_room and user_id = p_user and state = 'in') then
    return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  if r.id is null or not _dt_live(r) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if b = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from dt_msgs where room_id = p_room and user_id = p_user and created_at > now() - interval '10 seconds') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'slow'); end if;
  insert into dt_msgs (room_id, user_id, kind, body) values (p_room, p_user, 'text', b) returning id into v_id;
  update dt_rooms set last_msg_at = now() where id = p_room;
  update dt_members set last_read = v_id where room_id = p_room and user_id = p_user;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.dt_read_as(p_user uuid, p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dt_members set last_read = greatest(last_read, coalesce((select max(id) from dt_msgs where room_id = p_room), 0))
   where room_id = p_room and user_id = p_user and state = 'in';
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.dt_send_as(uuid, uuid, text), public.dt_read_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dt_send_as(uuid, uuid, text), public.dt_read_as(uuid, uuid) to service_role;
select 'dantok quick reply ok' as result;
