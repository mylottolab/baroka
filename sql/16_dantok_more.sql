-- =====================================================================
-- 💬 단톡방 — 기존 가림 · 부름 대화방 기능 옮겨 오기 (2026-11-17)
--   · 답장(인용) · 내 글 고치기 · 즐겨찾기 · 대화 검색
--   · 음성 메시지(kind = 'voice')
--   · 사라지는 메시지: 보낼 때 1시간 · 하루 · 일주일 중 고르면 그 시간이 지나 모두의 화면과 서버에서 지워집니다
--   · 유튜브 같이 보기(방 위에 고정) · 같이 듣기(회사가 고른 곡만 — 부름 서버의 gallery_music)
--   실시간 도착 · 입력 중 표시는 서버 변경 없이 화면끼리 방송(채널 dt-방번호)으로 합니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 15_dantok_rooms.sql 다음.
-- =====================================================================

alter table public.dt_msgs  add column if not exists reply_to   bigint;
alter table public.dt_msgs  add column if not exists edited_at  timestamptz;
alter table public.dt_msgs  add column if not exists expires_at timestamptz;
alter table public.dt_msgs  add column if not exists secs       int;          -- 음성 메시지 길이(초)
alter table public.dt_rooms add column if not exists yt         jsonb;        -- { v, by, nick, at }
alter table public.dt_rooms add column if not exists music      jsonb;        -- { id, title, artist, path, secs, by, nick, at }
create index if not exists dt_msgs_exp_idx on public.dt_msgs (expires_at) where expires_at is not null;

create table if not exists public.dt_stars (
  user_id    uuid not null,
  msg_id     bigint not null references public.dt_msgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, msg_id)
);
-- 사라진 글에 붙어 있던 파일 (보관함에서 지울 목록 — 정리 함수가 나중에 지웁니다)
create table if not exists public.dt_trash (
  path       text primary key,
  created_at timestamptz not null default now()
);
alter table public.dt_stars enable row level security;
alter table public.dt_trash enable row level security;
revoke all on public.dt_stars, public.dt_trash from public, anon, authenticated;
grant  all on public.dt_stars, public.dt_trash to service_role;

-- 방 정보에 유튜브 · 같이 듣기를 함께 (15번의 것 + yt · music)
create or replace function public._dt_room_json(r dt_rooms, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'notice', r.notice, 'plan', r.plan,
    'until', r.until, 'ends_on', r.ends_on, 'status', r.status, 'live', _dt_live(r),
    'max_members', r.max_members, 'quota_bytes', r.quota_bytes, 'used_bytes', r.used_bytes,
    'owner', r.owner_id = p_me, 'yt', r.yt, 'music', r.music, 'me_id', p_me,
    'me', (select jsonb_build_object('nick', m.nick, 'color', m.color, 'role', m.role, 'muted', m.muted, 'last_read', m.last_read)
             from dt_members m where m.room_id = r.id and m.user_id = p_me),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('uid', m.user_id, 'nick', m.nick, 'color', m.color, 'role', m.role,
                                  'me', m.user_id = p_me, 'blocked', exists (select 1 from dt_blocks b where b.user_id = p_me and b.blocked = m.user_id))
                                  order by (m.role = 'owner') desc, m.joined_at), '[]'::jsonb)
                  from dt_members m where m.room_id = r.id and m.state = 'in'))
$$;

-- 글 한 줄 모양 (목록 · 검색 · 즐겨찾기에서 같이 씁니다)
create or replace function public._dt_msg_json(g dt_msgs, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'uid', g.user_id, 'kind', g.kind,
    'body', case when g.deleted then null else g.body end, 'deleted', g.deleted,
    'path', case when g.deleted then null else g.file_path end, 'fname', g.file_name, 'size', g.file_size, 'secs', g.secs, 't', g.created_at,
    'edited', g.edited_at is not null, 'exp', g.expires_at,
    'nick', n.nick, 'color', n.color, 'mine', g.user_id = p_me,
    'star', exists (select 1 from dt_stars s where s.user_id = p_me and s.msg_id = g.id),
    'reply', case when g.reply_to is null then null else
       (select jsonb_build_object('id', q.id, 'kind', q.kind, 'nick', qn.nick,
                 'body', case when q.deleted or (q.expires_at is not null and q.expires_at < now()) then null else left(q.body, 80) end)
          from dt_msgs q left join dt_members qn on qn.room_id = q.room_id and qn.user_id = q.user_id where q.id = g.reply_to) end)
  from (select 1) x left join dt_members n on n.room_id = g.room_id and n.user_id = g.user_id
$$;

create or replace function public.dt_msgs(p_room uuid, p_after bigint default null, p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'msgs', (
    select coalesce(jsonb_agg(_dt_msg_json(g, v_uid) order by g.id), '[]'::jsonb)
    from (select * from dt_msgs g0
           where g0.room_id = p_room
             and (p_after is null or g0.id > p_after) and (p_before is null or g0.id < p_before)
             and (g0.expires_at is null or g0.expires_at > now())
             and (g0.user_id is null or not exists (select 1 from dt_blocks b where b.user_id = v_uid and b.blocked = g0.user_id))
           order by g0.id desc limit case when p_after is not null then 200 else 50 end) g),
    'reads', (select coalesce(jsonb_agg(m.last_read), '[]'::jsonb) from dt_members m where m.room_id = p_room and m.state = 'in'));
end $$;

-- 보내기 (답장 · 사라지는 시간 · 음성 길이 추가) — 15번의 6칸짜리는 지웁니다
drop function if exists public.dt_send(uuid, text, text, text, text, bigint);
create or replace function public.dt_send(p_room uuid, p_kind text, p_body text, p_path text default null, p_name text default null, p_size bigint default null,
                                          p_reply bigint default null, p_ttl int default null, p_secs int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r dt_rooms; v_id bigint; v_kind text := coalesce(p_kind, 'text');
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  if not _dt_live(r) then return jsonb_build_object('ok', false, 'error', case when r.until <= now() then 'expired' else 'closed' end); end if;
  if v_kind not in ('text', 'photo', 'video', 'audio', 'voice', 'file') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  if v_kind = 'text' and char_length(btrim(coalesce(p_body, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if p_ttl is not null and p_ttl not in (1, 24, 168) then return jsonb_build_object('ok', false, 'error', 'ttl'); end if;
  if p_reply is not null and not exists (select 1 from dt_msgs where id = p_reply and room_id = p_room) then return jsonb_build_object('ok', false, 'error', 'reply'); end if;
  if v_kind <> 'text' then
    if p_path is null or split_part(p_path, '/', 1) <> p_room::text then return jsonb_build_object('ok', false, 'error', 'path'); end if;
    if coalesce(p_size, 0) <= 0 or p_size > 104857600 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
    if r.used_bytes + p_size > r.quota_bytes then return jsonb_build_object('ok', false, 'error', 'quota'); end if;
    update dt_rooms set used_bytes = used_bytes + p_size where id = p_room;
  end if;
  if (select count(*) from dt_msgs where room_id = p_room and user_id = v_uid and created_at > now() - interval '10 seconds') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'slow');
  end if;
  insert into dt_msgs (room_id, user_id, kind, body, file_path, file_name, file_size, reply_to, expires_at, secs)
  values (p_room, v_uid, v_kind, left(nullif(btrim(coalesce(p_body, '')), ''), 2000), p_path, left(p_name, 120), p_size,
          p_reply, case when p_ttl is null then null else now() + make_interval(hours => p_ttl) end, least(greatest(p_secs, 0), 600))
  returning id into v_id;
  update dt_rooms set last_msg_at = now() where id = p_room;
  update dt_members set last_read = v_id where room_id = p_room and user_id = v_uid;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 내 글 고치기 (글자만 · 지운 글 · 사라진 글은 안 됨)
create or replace function public.dt_edit_msg(p_room uuid, p_id bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if char_length(btrim(coalesce(p_body, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  update dt_msgs set body = left(btrim(p_body), 2000), edited_at = now()
   where id = p_id and room_id = p_room and user_id = auth.uid() and kind = 'text' and not deleted
     and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_star(p_room uuid, p_id bigint, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not dt_is_member(p_room) or not exists (select 1 from dt_msgs where id = p_id and room_id = p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if coalesce(p_on, true) then insert into dt_stars (user_id, msg_id) values (auth.uid(), p_id) on conflict do nothing;
  else delete from dt_stars where user_id = auth.uid() and msg_id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dt_stars(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'msgs', (select coalesce(jsonb_agg(_dt_msg_json(g, auth.uid()) order by g.id desc), '[]'::jsonb)
    from dt_msgs g join dt_stars s on s.msg_id = g.id and s.user_id = auth.uid()
    where g.room_id = p_room and not g.deleted and (g.expires_at is null or g.expires_at > now())));
end $$;

-- 대화 검색 (글자 · 파일 이름 · 보낸 사람 별명, 최근 50개)
create or replace function public.dt_search(p_room uuid, p_q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := btrim(coalesce(p_q, ''));
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if char_length(q) < 1 then return jsonb_build_object('ok', true, 'msgs', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'msgs', (select coalesce(jsonb_agg(_dt_msg_json(g, auth.uid()) order by g.id desc), '[]'::jsonb) from (
    select g.* from dt_msgs g left join dt_members n on n.room_id = g.room_id and n.user_id = g.user_id
     where g.room_id = p_room and not g.deleted and g.kind <> 'system' and (g.expires_at is null or g.expires_at > now())
       and (g.body ilike '%' || q || '%' or g.file_name ilike '%' || q || '%' or n.nick ilike '%' || q || '%')
       and not exists (select 1 from dt_blocks b where b.user_id = auth.uid() and b.blocked = g.user_id)
     order by g.id desc limit 50) g));
end $$;

-- 유튜브 같이 보기: 방 위에 고정 (p_v = 영상 11자리 또는 'L:재생목록'), null 이면 내리기(띄운 사람 · 방장)
create or replace function public.dt_set_yt(p_room uuid, p_v text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_nick text;
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  select nick into v_nick from dt_members where room_id = p_room and user_id = auth.uid();
  if p_v is null then
    if r.yt is not null and (r.yt->>'by')::uuid is distinct from auth.uid() and r.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    update dt_rooms set yt = null where id = p_room;
    return jsonb_build_object('ok', true);
  end if;
  if not _dt_live(r) then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if p_v !~ '^([A-Za-z0-9_-]{11}|L:[A-Za-z0-9_-]{10,64})$' then return jsonb_build_object('ok', false, 'error', 'bad_video'); end if;
  update dt_rooms set yt = jsonb_build_object('v', p_v, 'by', auth.uid(), 'nick', v_nick, 'at', now()) where id = p_room;
  perform _dt_sys(p_room, '📺 ' || v_nick || '님이 유튜브 영상을 위에 띄웠어요.');
  return jsonb_build_object('ok', true);
end $$;

-- 같이 듣기: 회사가 고른 곡(부름 서버 gallery_music)의 정보만 받아 적어 둡니다. null 이면 멈추기(튼 사람 · 방장)
create or replace function public.dt_set_music(p_room uuid, p_track jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r dt_rooms; v_nick text;
begin
  if not dt_is_member(p_room) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  select * into r from dt_rooms where id = p_room;
  select nick into v_nick from dt_members where room_id = p_room and user_id = auth.uid();
  if p_track is null then
    if r.music is not null and (r.music->>'by')::uuid is distinct from auth.uid() and r.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    update dt_rooms set music = null where id = p_room;
    return jsonb_build_object('ok', true);
  end if;
  if not _dt_live(r) then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if coalesce(p_track->>'path', '') !~ '^[A-Za-z0-9 _./()-]{1,200}$' or p_track->>'path' like '%..%' then return jsonb_build_object('ok', false, 'error', 'bad_track'); end if;
  update dt_rooms set music = jsonb_build_object('id', p_track->>'id', 'title', left(p_track->>'title', 80), 'artist', left(p_track->>'artist', 60),
         'path', p_track->>'path', 'secs', (p_track->>'secs')::int, 'by', auth.uid(), 'nick', v_nick, 'at', now()) where id = p_room;
  perform _dt_sys(p_room, '🎵 ' || v_nick || '님이 「' || left(p_track->>'title', 40) || '」을(를) 함께 듣자고 틀었어요.');
  return jsonb_build_object('ok', true);
end $$;

-- 사라지는 메시지 정리 (pg_cron 이 있으면 10분마다 · 없어도 화면에는 이미 안 보입니다)
create or replace function public.dt_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into dt_trash (path) select file_path from dt_msgs where expires_at < now() and file_path is not null on conflict do nothing;
  update dt_rooms r set used_bytes = greatest(0, r.used_bytes - x.s)
    from (select room_id, sum(file_size) s from dt_msgs where expires_at < now() and file_size is not null and not deleted group by room_id) x
   where r.id = x.room_id;
  delete from dt_msgs where expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dantok-purge';
    perform cron.schedule('dantok-purge', '*/10 * * * *', 'select public.dt_purge()');
  end if;
exception when others then raise notice 'pg_cron 예약은 건너뜁니다: %', sqlerrm;
end $$;

-- 알림 미리보기에 음성 메시지 · 사라지는 메시지 표시 (15번의 것을 고칩니다)
create or replace function public.dt_notify_targets(p_msg bigint, p_user uuid)
returns table (token text, room_name text, room_id uuid, nick text, preview text) language plpgsql security definer set search_path = public as $$
declare g dt_msgs;
begin
  select * into g from dt_msgs where id = p_msg;
  if g.id is null or g.user_id is distinct from p_user or g.created_at < now() - interval '2 minutes' then return; end if;
  return query
    select p.token, r.name, r.id, s.nick,
           case when g.expires_at is not null then '⏳ 사라지는 메시지' else
           case g.kind when 'photo' then '📷 사진' when 'video' then '🎬 동영상' when 'audio' then '🎵 음원' when 'voice' then '🎤 음성 메시지'
                       when 'file' then '📎 파일' else left(g.body, 80) end end
      from dt_members m join dt_push p on p.user_id = m.user_id
      join dt_rooms r on r.id = m.room_id
      join dt_members s on s.room_id = m.room_id and s.user_id = g.user_id
     where m.room_id = g.room_id and m.state = 'in' and not m.muted and m.user_id <> g.user_id
       and not exists (select 1 from dt_blocks b where b.user_id = m.user_id and b.blocked = g.user_id);
end $$;

do $$ declare f text; begin
  foreach f in array array['dt_send(uuid, text, text, text, text, bigint, bigint, int, int)', 'dt_edit_msg(uuid, bigint, text)', 'dt_star(uuid, bigint, boolean)',
                           'dt_stars(uuid)', 'dt_search(uuid, text)', 'dt_set_yt(uuid, text)', 'dt_set_music(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public._dt_msg_json(dt_msgs, uuid) from public, anon, authenticated';
  execute 'revoke execute on function public.dt_purge() from public, anon, authenticated';
end $$;

select 'dantok more ok' as result, exists (select 1 from pg_extension where extname = 'pg_cron') as auto_purge;
