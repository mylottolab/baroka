-- =====================================================================
-- 💬 단톡방 — 🙋 자기소개 · 인사 코너 (2026-11-23)
--   방마다 사람마다 소개 하나: 소개 글(500자) + 사진 또는 짧은 영상(30초) 하나.
--   목록은 카톡처럼 왼쪽 동그라미(사진 · 영상 · 프로필) + 오른쪽 별명 · 소개 글. 위에서 줄 세우기(들어온 순 · 최근 소개 · 이름순).
--   · 사진 · 영상은 보관함 dantok 의 "<방번호>/intro/<내 번호>-<시각>.<확장자>" — 그 방 사람만 봅니다(기존 방 칸 정책 그대로).
--   · 처음 소개를 올리면 방에 「○○님이 자기소개를 올렸어요 🙋」 알림 글이 한 줄 뜹니다.
--   · 방을 나가거나 내보내지면 목록에서 빠집니다(기록은 방이 닫힐 때 함께 사라짐).
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 다시 돌려도 안전합니다. 17_dantok_avatar.sql 다음.
-- =====================================================================

create table if not exists public.dt_intros (
  room_id    uuid not null references public.dt_rooms(id) on delete cascade,
  user_id    uuid not null,
  body       text not null default '',
  media_kind text,                              -- null · photo · video
  media_path text,
  media_secs numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.dt_intros enable row level security;
revoke all on public.dt_intros from anon, authenticated;
grant all on public.dt_intros to service_role;

-- 목록: 방에 있는 사람 모두(소개를 아직 안 쓴 사람도) ---------------------------------------
create or replace function public.dt_intro_list(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if not public.dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'me', auth.uid(), 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', m.user_id, 'nick', m.nick, 'color', m.color, 'role', m.role, 'avatar', m.avatar, 'joined_at', m.joined_at,
      'me', m.user_id = auth.uid(),
      'body', i.body, 'kind', i.media_kind, 'path', i.media_path, 'secs', i.media_secs, 'at', i.updated_at)
      order by m.joined_at)
      from dt_members m left join dt_intros i on i.room_id = m.room_id and i.user_id = m.user_id
     where m.room_id = p_room and m.state = 'in'
       and not exists (select 1 from dt_blocks b where b.user_id = auth.uid() and b.blocked = m.user_id)), '[]'::jsonb));
end $$;

-- 쓰기 · 고치기 (사진 · 영상을 바꾸면 예전 파일 주소를 돌려줘 화면이 지웁니다) ----------------------
create or replace function public.dt_intro_set(p_room uuid, p_body text, p_kind text, p_path text, p_secs numeric default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); old dt_intros; nk text; b text := left(btrim(coalesce(p_body, '')), 500);
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if not public.dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if p_kind is not null and p_kind not in ('photo', 'video') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if (p_kind is null) <> (p_path is null) then return jsonb_build_object('ok', false, 'error', 'bad_path'); end if;
  if p_path is not null and p_path not like (p_room::text || '/intro/' || me::text || '-%') then return jsonb_build_object('ok', false, 'error', 'bad_path'); end if;
  if p_kind = 'video' and coalesce(p_secs, 0) > 31 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if b = '' and p_path is null then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select * into old from dt_intros where room_id = p_room and user_id = me;
  insert into dt_intros(room_id, user_id, body, media_kind, media_path, media_secs, updated_at)
  values (p_room, me, b, p_kind, p_path, p_secs, now())
  on conflict (room_id, user_id) do update set body = excluded.body, media_kind = excluded.media_kind, media_path = excluded.media_path,
    media_secs = excluded.media_secs, updated_at = now();
  if old.user_id is null then
    select nick into nk from dt_members where room_id = p_room and user_id = me;
    perform public._dt_sys(p_room, coalesce(nk, '') || '님이 자기소개를 올렸어요 🙋');
  end if;
  return jsonb_build_object('ok', true, 'old', case when old.media_path is distinct from p_path then old.media_path end);
end $$;

-- 지우기 --------------------------------------------------------------------------------
create or replace function public.dt_intro_del(p_room uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare old text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  delete from dt_intros where room_id = p_room and user_id = auth.uid() returning media_path into old;
  return jsonb_build_object('ok', true, 'old', old);
end $$;

revoke all on function public.dt_intro_list(uuid), public.dt_intro_set(uuid, text, text, text, numeric), public.dt_intro_del(uuid) from public, anon;
grant execute on function public.dt_intro_list(uuid), public.dt_intro_set(uuid, text, text, text, numeric), public.dt_intro_del(uuid) to authenticated;

-- 보관함: 내가 올린 소개 사진 · 영상은 내가 지울 수 있게 (방 칸 읽기 · 올리기는 기존 정책 그대로)
drop policy if exists "dantok intro del" on storage.objects;
create policy "dantok intro del" on storage.objects for delete to authenticated
  using (bucket_id = 'dantok' and (storage.foldername(name))[2] = 'intro' and owner = auth.uid());

select 'dantok intro ok' as result, (select count(*) from pg_proc where proname like 'dt_intro_%') as funcs;
