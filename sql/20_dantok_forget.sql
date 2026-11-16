-- =====================================================================
-- 💬 단톡방 — 내 정보 지우기 (계정 삭제 화면 dantok.kr/delete.html 이 부릅니다) (2026-11-17)
--   내가 있는 모든 방에서 나가고(방장이면 다음 사람에게 넘김), 갤러리 · 프로필 · 알림 주소 · 즐겨찾기 · 차단 목록을 지웁니다.
--   내가 방에 쓴 글은 「지워진 글」로 바꿉니다. 보관함에서 지울 파일 목록을 돌려주면 화면이 지우고,
--   그다음 self-delete-account 함수(가림콜 · 단골창구와 같음)로 계정 자체를 지웁니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 19_dantok_pay.sql 다음.
-- =====================================================================
create or replace function public.dt_forget_me()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r record; v_paths jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  for r in select room_id from dt_members where user_id = v_uid and state = 'in' loop perform dt_leave(r.room_id); end loop;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_paths from (
    select path x from dt_photos where user_id = v_uid union all select thumb from dt_photos where user_id = v_uid
    union all select substr(avatar, 3) from dt_members where user_id = v_uid and avatar like 'p:%') s;
  delete from dt_albums where user_id = v_uid;
  update dt_members set avatar = null, nick = '나간 사람' where user_id = v_uid;
  update dt_msgs set deleted = true where user_id = v_uid;
  delete from dt_push where user_id = v_uid;
  delete from dt_stars where user_id = v_uid;
  delete from dt_blocks where user_id = v_uid or blocked = v_uid;
  return jsonb_build_object('ok', true, 'paths', v_paths);
end $$;
revoke execute on function public.dt_forget_me() from public, anon;
grant  execute on function public.dt_forget_me() to authenticated;
select 'dantok forget ok' as result;
