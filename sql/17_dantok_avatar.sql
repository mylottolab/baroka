-- =====================================================================
-- 💬 단톡방 — 프로필 사진 · 그림 (2026-11-17)
--   이름 첫 글자 동그라미 대신 내 사진이나 그림(이모티콘)을 고릅니다. 방마다 따로, 또는 내 모든 방에 한 번에.
--   avatar 칸: 'p:av/<내 번호>/<파일>.jpg' (사진) · 'e:🐶' (그림) · null (첫 글자)
--   사진은 보관함 dantok 의 av/<내 번호>/ 칸에 올리고, 나와 같은 방에 있는 사람만 볼 수 있습니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 16_dantok_more.sql 다음.
-- =====================================================================

alter table public.dt_members add column if not exists avatar text;

-- 나와 이 사람이 같은 방에 있나 (프로필 사진 보기 허락)
create or replace function public.dt_shares_room(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from dt_members a join dt_members b on b.room_id = a.room_id
     where a.user_id = auth.uid() and a.state = 'in' and b.user_id = p_user and b.state = 'in')
$$;

create or replace function public._dt_av_ok(p text) returns boolean language sql immutable as $$
  select p is null
      or (p like 'e:%' and char_length(p) between 3 and 14)
      or p ~ ('^p:av/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,60}\.jpg$')
$$;

-- p_all = true 면 내가 있는 모든 방에 같이
create or replace function public.dt_set_avatar(p_room uuid, p_avatar text, p_all boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not _dt_av_ok(p_avatar) then return jsonb_build_object('ok', false, 'error', 'bad_avatar'); end if;
  if p_avatar like 'p:%' and split_part(p_avatar, '/', 2) <> auth.uid()::text then return jsonb_build_object('ok', false, 'error', 'bad_avatar'); end if;
  if coalesce(p_all, false) then update dt_members set avatar = p_avatar where user_id = auth.uid() and state = 'in';
  else update dt_members set avatar = p_avatar where room_id = p_room and user_id = auth.uid(); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 방 정보 · 글에 프로필을 함께 (16번의 것 + avatar)
create or replace function public._dt_room_json(r dt_rooms, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'notice', r.notice, 'plan', r.plan,
    'until', r.until, 'ends_on', r.ends_on, 'status', r.status, 'live', _dt_live(r),
    'max_members', r.max_members, 'quota_bytes', r.quota_bytes, 'used_bytes', r.used_bytes,
    'owner', r.owner_id = p_me, 'yt', r.yt, 'music', r.music, 'me_id', p_me,
    'me', (select jsonb_build_object('nick', m.nick, 'color', m.color, 'role', m.role, 'muted', m.muted, 'last_read', m.last_read, 'avatar', m.avatar)
             from dt_members m where m.room_id = r.id and m.user_id = p_me),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('uid', m.user_id, 'nick', m.nick, 'color', m.color, 'role', m.role, 'avatar', m.avatar,
                                  'me', m.user_id = p_me, 'blocked', exists (select 1 from dt_blocks b where b.user_id = p_me and b.blocked = m.user_id))
                                  order by (m.role = 'owner') desc, m.joined_at), '[]'::jsonb)
                  from dt_members m where m.room_id = r.id and m.state = 'in'))
$$;

create or replace function public._dt_msg_json(g dt_msgs, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'uid', g.user_id, 'kind', g.kind,
    'body', case when g.deleted then null else g.body end, 'deleted', g.deleted,
    'path', case when g.deleted then null else g.file_path end, 'fname', g.file_name, 'size', g.file_size, 'secs', g.secs, 't', g.created_at,
    'edited', g.edited_at is not null, 'exp', g.expires_at,
    'nick', n.nick, 'color', n.color, 'avatar', n.avatar, 'mine', g.user_id = p_me,
    'star', exists (select 1 from dt_stars s where s.user_id = p_me and s.msg_id = g.id),
    'reply', case when g.reply_to is null then null else
       (select jsonb_build_object('id', q.id, 'kind', q.kind, 'nick', qn.nick,
                 'body', case when q.deleted or (q.expires_at is not null and q.expires_at < now()) then null else left(q.body, 80) end)
          from dt_msgs q left join dt_members qn on qn.room_id = q.room_id and qn.user_id = q.user_id where q.id = g.reply_to) end)
  from (select 1) x left join dt_members n on n.room_id = g.room_id and n.user_id = g.user_id
$$;

-- 보관함: av/<내 번호>/ 에는 나만 올리고, 나와 같은 방 사람만 봅니다
drop policy if exists "dantok avatar read" on storage.objects;
create policy "dantok avatar read" on storage.objects for select to authenticated
  using (bucket_id = 'dantok' and (storage.foldername(name))[1] = 'av' and public.dt_shares_room(((storage.foldername(name))[2])::uuid));
drop policy if exists "dantok avatar write" on storage.objects;
create policy "dantok avatar write" on storage.objects for insert to authenticated
  with check (bucket_id = 'dantok' and (storage.foldername(name))[1] = 'av' and (storage.foldername(name))[2] = auth.uid()::text);
-- 방 사진 정책은 첫 칸이 방 번호일 때만 맞도록 (av 칸에서 uuid 변환 오류가 나지 않게)
drop policy if exists "dantok member read" on storage.objects;
create policy "dantok member read" on storage.objects for select to authenticated
  using (bucket_id = 'dantok' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.dt_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "dantok member write" on storage.objects;
create policy "dantok member write" on storage.objects for insert to authenticated
  with check (bucket_id = 'dantok' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.dt_is_member(((storage.foldername(name))[1])::uuid));

revoke execute on function public.dt_set_avatar(uuid, text, boolean) from public, anon;
grant  execute on function public.dt_set_avatar(uuid, text, boolean) to authenticated;
revoke execute on function public.dt_shares_room(uuid) from public, anon;
grant  execute on function public.dt_shares_room(uuid) to authenticated;

select 'dantok avatar ok' as result;
