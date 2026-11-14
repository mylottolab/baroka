-- =====================================================================
-- 💬 고객센터 (자동 답변 + 1:1 문의) — 가림 · 바로카 서버 · 2026-11-15
--   카카오톡 채널 대신 앱 안에서 문의를 받습니다.
--   · 고객: 자동 답변(설명서 내용)으로 해결 안 되면 [상담원에게 보내기] → 이 표에 쌓입니다.
--   · 관리자: 종합관리자 「💬 고객문의」에서 읽고 답장합니다(지금은 사람이 직접 답합니다).
--   · 답장하면 고객 앱에 「답변이 왔어요」 알림(support-notify 함수)이 갑니다.
--
--   만드는 것
--     support_tickets  문의 한 건 (누가 · 어느 앱 · 상태: open 답변 대기 / answered 답변함 / closed 끝남)
--     support_msgs     문의 안의 글 (고객 글 · 관리자 답장)
--     support_faq_log  자동 답변이 도움이 됐는지 (안 풀린 질문을 모아 자주 묻는 질문을 늘리는 데 씁니다)
--
--   ⚠ Supabase(에일리어스콜 프로젝트) → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
--   ⚠ 전화번호 · 주소 같은 개인정보는 묻지 않습니다. 고객이 적은 글만 저장합니다.
--      탈퇴하면(계정 삭제) 문의도 함께 지워집니다(on delete cascade).
-- =====================================================================

-- ① 표 -----------------------------------------------------------------
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  app           text not null default 'garim',
  topic         text not null default '기타',
  status        text not null default 'open' check (status in ('open', 'answered', 'closed')),
  user_unread   int  not null default 0,
  admin_unread  int  not null default 1,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists support_tickets_user_idx   on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table if not exists public.support_msgs (
  id          bigserial primary key,
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  from_admin  boolean not null default false,
  admin_id    uuid,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists support_msgs_ticket_idx on public.support_msgs (ticket_id, id);

create table if not exists public.support_faq_log (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  app         text,
  q           text,
  faq_id      text,
  ok          boolean,
  created_at  timestamptz not null default now()
);
create index if not exists support_faq_log_at_idx on public.support_faq_log (created_at desc);

-- 화면은 아래 함수로만 읽고 씁니다(표를 직접 못 봄)
alter table public.support_tickets enable row level security;
alter table public.support_msgs    enable row level security;
alter table public.support_faq_log enable row level security;
revoke all on public.support_tickets, public.support_msgs, public.support_faq_log from public, anon, authenticated;
grant  all on public.support_tickets, public.support_msgs, public.support_faq_log to service_role;
grant  usage, select on sequence public.support_msgs_id_seq, public.support_faq_log_id_seq to service_role;

create or replace function public._support_app(p text) returns text language sql immutable as $$
  select case when p in ('garim', 'baroka') then p else 'garim' end
$$;

-- ② 고객 ---------------------------------------------------------------
-- 문의 보내기 (p_ticket 이 있으면 그 문의에 이어 쓰기)
create or replace function public.support_send(p_app text, p_topic text, p_body text,
                                               p_ticket uuid default null, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_logged_in'; end if;
  if char_length(v_body) < 2 then raise exception 'too_short'; end if;
  if char_length(v_body) > 2000 then raise exception 'too_long'; end if;
  -- 도배 막기: 한 시간에 글 10개, 하루 30개
  if (select count(*) from support_msgs m join support_tickets t on t.id = m.ticket_id
       where t.user_id = v_uid and not m.from_admin and m.created_at > now() - interval '1 hour') >= 10
  or (select count(*) from support_msgs m join support_tickets t on t.id = m.ticket_id
       where t.user_id = v_uid and not m.from_admin and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many';
  end if;

  if p_ticket is not null then
    select id into v_id from support_tickets where id = p_ticket and user_id = v_uid for update;
    if v_id is null then raise exception 'not_found'; end if;
    update support_tickets set status = 'open', admin_unread = admin_unread + 1, updated_at = now() where id = v_id;
  else
    if (select count(*) from support_tickets where user_id = v_uid and status = 'open') >= 5 then raise exception 'too_many_open'; end if;
    insert into support_tickets (user_id, app, topic, meta)
    values (v_uid, _support_app(p_app), left(coalesce(nullif(btrim(p_topic), ''), '기타'), 40),
            coalesce(p_meta, '{}'::jsonb) - 'admin')
    returning id into v_id;
  end if;
  insert into support_msgs (ticket_id, from_admin, body) values (v_id, false, v_body);
  return v_id;
end $$;

-- 내 문의 목록 (글까지 함께)
create or replace function public.support_my()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', t.id, 'app', t.app, 'topic', t.topic, 'status', t.status,
             'unread', t.user_unread, 'created_at', t.created_at, 'updated_at', t.updated_at,
             'msgs', (select coalesce(jsonb_agg(jsonb_build_object('a', m.from_admin, 'b', m.body, 't', m.created_at) order by m.id), '[]'::jsonb)
                        from support_msgs m where m.ticket_id = t.id)) as x
      from support_tickets t where t.user_id = auth.uid()
     order by t.updated_at desc limit 30) s
$$;

-- 읽음 표시 · 끝내기
create or replace function public.support_seen(p_ticket uuid)
returns void language sql security definer set search_path = public as $$
  update support_tickets set user_unread = 0 where id = p_ticket and user_id = auth.uid();
$$;
create or replace function public.support_close(p_ticket uuid)
returns void language sql security definer set search_path = public as $$
  update support_tickets set status = 'closed', user_unread = 0, updated_at = now() where id = p_ticket and user_id = auth.uid();
$$;

-- 안 읽은 답장 수 (단추 옆 빨간 숫자)
create or replace function public.support_unread()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(user_unread), 0)::int from support_tickets where user_id = auth.uid();
$$;

-- 자동 답변이 도움이 됐는지 남기기 (로그인한 분만 · 하루 300건까지)
create or replace function public.support_log(p_app text, p_q text, p_faq text, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or char_length(btrim(coalesce(p_q, ''))) < 2 then return; end if;
  if (select count(*) from support_faq_log where user_id = v_uid and created_at > now() - interval '1 day') >= 300 then return; end if;
  insert into support_faq_log (user_id, app, q, faq_id, ok)
  values (v_uid, _support_app(p_app), left(btrim(p_q), 200), left(p_faq, 60), p_ok);
end $$;

-- ③ 관리자 ---------------------------------------------------------------
create or replace function public.admin_support_list(p_status text default null, p_days int default 120)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', t.id, 'app', t.app, 'topic', t.topic, 'status', t.status, 'meta', t.meta,
      'admin_unread', t.admin_unread, 'user_unread', t.user_unread,
      'created_at', t.created_at, 'updated_at', t.updated_at,
      'user_id', t.user_id, 'login', u.email, 'joined', u.created_at,
      'user_app', u.raw_user_meta_data->>'app',
      'nick', (select to_jsonb(p)->>'nickname' from profiles p where p.id = t.user_id),
      'n_tickets', (select count(*) from support_tickets t2 where t2.user_id = t.user_id),
      'msgs', (select coalesce(jsonb_agg(jsonb_build_object('a', m.from_admin, 'b', m.body, 't', m.created_at) order by m.id), '[]'::jsonb)
                 from support_msgs m where m.ticket_id = t.id)) as x
      from support_tickets t left join auth.users u on u.id = t.user_id
     where (p_status is null or p_status = '' or t.status = p_status)
       and t.updated_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 120), 3650)))
     order by t.updated_at desc limit 500) s;
  return v;
end $$;

create or replace function public.admin_support_reply(p_ticket uuid, p_body text, p_close boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_body text := btrim(coalesce(p_body, ''));
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  if char_length(v_body) < 1 then raise exception 'too_short'; end if;
  if not exists (select 1 from support_tickets where id = p_ticket) then raise exception 'not_found'; end if;
  insert into support_msgs (ticket_id, from_admin, admin_id, body) values (p_ticket, true, auth.uid(), left(v_body, 4000));
  update support_tickets set status = case when p_close then 'closed' else 'answered' end,
         user_unread = user_unread + 1, admin_unread = 0, updated_at = now()
   where id = p_ticket;
end $$;

create or replace function public.admin_support_set(p_ticket uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  if p_status = 'seen' then update support_tickets set admin_unread = 0 where id = p_ticket; return; end if;
  if p_status not in ('open', 'answered', 'closed') then raise exception 'bad_status'; end if;
  update support_tickets set status = p_status, admin_unread = 0, updated_at = now() where id = p_ticket;
end $$;

-- 자동 답변으로 안 풀린 질문 모아 보기 (자주 묻는 질문을 늘릴 때)
create or replace function public.admin_support_faq_misses(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) into v from (
    select jsonb_build_object('q', min(q), 'app', min(app), 'n', count(*), 'last', max(created_at),
                              'faq', min(faq_id), 'bad', count(*) filter (where ok is false)) as x
      from support_faq_log
     where created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
       and (ok is not true)
     group by lower(regexp_replace(q, '\s+', ' ', 'g'))
     order by count(*) desc limit 200) s;
  return v;
end $$;

-- 답장 알림 보낼 기기 (support-notify 함수가 관리자 로그인으로 부릅니다)
drop function if exists public.admin_support_push_targets(uuid);
create or replace function public.admin_support_push_targets(p_ticket uuid)
returns table (push_token text, platform text, lang text, channel text) language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select user_id into v_uid from support_tickets where id = p_ticket;
  if v_uid is null then return; end if;
  return query select k.token::text, coalesce(to_jsonb(k)->>'platform', ''), coalesce(to_jsonb(k)->>'lang', 'ko'), 'aliascall_urgent'::text
      from push_tokens k where k.user_id = v_uid and k.token is not null
       and k.token::text !~* '^[0-9a-f]{64,200}$' and k.token::text !~ '^[{h]';
end $$;

-- ④ 권한 ---------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['support_send(text, text, text, uuid, jsonb)', 'support_my()', 'support_seen(uuid)', 'support_close(uuid)',
    'support_unread()', 'support_log(text, text, text, boolean)', 'admin_support_list(text, int)', 'admin_support_reply(uuid, text, boolean)',
    'admin_support_set(uuid, text)', 'admin_support_faq_misses(int)', 'admin_support_push_targets(uuid)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

select 'support ok' as result,
       (select count(*) from support_tickets) as tickets,
       (select count(*) from support_tickets where status = 'open') as waiting;
