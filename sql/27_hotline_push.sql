-- =====================================================================
-- 가림 서버 — 회선(핫라인) 대화 새 메시지 알림 + 알림에서 바로 [답장] · [읽음] (2026-11-22)
--   가림(에일리어스콜) Supabase SQL Editor 에서 Run. 다시 돌려도 안전합니다. 맨 아래 'hotline push ok'
--   · 개인 회선 · 전문관리(상담) 회선 모두 — 개설자 + 승인된 참가자 모두에게 (보낸 사람 빼고)
--   · 개설자 폰  : push_tokens (로그인한 앱 — 지금 그대로)
--   · 참가자 폰  : hotline_member_push (새 표 — 방에 들어오면 앱이 이 폰 알림 주소를 맡김)
--   · 보안(암호) 회선은 내용 대신 「🔒 새 메시지」, 답장 칸 없음
--   · hotline_push_sent : 같은 메시지로 알림이 두 번 가지 않게(서버 함수만 씀)
--   ⚠ 26_garim_quick_reply.sql(push_tokens.caps)을 먼저 돌려 두셔야 합니다.
-- =====================================================================

-- ① 참가자 폰 알림 주소 -----------------------------------------------------
create table if not exists public.hotline_member_push (
  hotline_id     uuid not null references public.hotlines(id) on delete cascade,
  member_anon_id text not null,
  token          text not null,
  caps           text,
  lang           text,
  updated_at     timestamptz not null default now(),
  primary key (hotline_id, member_anon_id, token)
);
create index if not exists hotline_member_push_token on public.hotline_member_push(token);
alter table public.hotline_member_push enable row level security;
revoke all on public.hotline_member_push from public, anon, authenticated;
grant select, insert, update, delete on public.hotline_member_push to service_role;

-- ② 알림 보낸 기록(중복 방지) ------------------------------------------------
create table if not exists public.hotline_push_sent (
  message_id uuid primary key,
  sent_at    timestamptz not null default now()
);
alter table public.hotline_push_sent enable row level security;
revoke all on public.hotline_push_sent from public, anon, authenticated;
grant select, insert, update, delete on public.hotline_push_sent to service_role;

-- 회선 주인(개인 회선 = hotlines.owner_user_id, 전문관리 = 구독 주인)
create or replace function public._hl_owner(p_hotline uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(h.owner_user_id, s.owner_user_id)
    from hotlines h left join hotline_subscriptions s on s.id = h.subscription_id
   where h.id = p_hotline
$$;
revoke all on function public._hl_owner(uuid) from public, anon, authenticated;

-- ③ 참가자가 방에 들어오면 이 폰 알림 주소를 맡깁니다(앱 화면이 부름 · 로그인 없어도 됨)
--    승인된 참가자만. 한 폰은 한 방에 한 사람으로만(같은 폰 옛 참가자 줄은 지움).
create or replace function public.hotline_push_join(p_hotline uuid, p_member text, p_token text, p_caps text default null, p_lang text default null)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_tok text := btrim(coalesce(p_token, ''));
begin
  if p_hotline is null or coalesce(p_member, '') = '' or char_length(v_tok) < 20 or char_length(v_tok) > 400 then return false; end if;
  if p_member like 'owner-%' then return false; end if;                 -- 개설자는 push_tokens 로 받습니다
  if not ac_hotline_alive(p_hotline) then return false; end if;
  if not exists (select 1 from hotline_members m where m.hotline_id = p_hotline and m.member_anon_id = p_member
                   and coalesce(m.status::text, 'approved') = 'approved') then return false; end if;
  delete from hotline_member_push where hotline_id = p_hotline and token = v_tok and member_anon_id <> p_member;
  insert into hotline_member_push(hotline_id, member_anon_id, token, caps, lang, updated_at)
  values (p_hotline, p_member, v_tok, left(coalesce(p_caps, ''), 40), left(coalesce(p_lang, ''), 8), now())
  on conflict (hotline_id, member_anon_id, token) do update set caps = excluded.caps, lang = excluded.lang, updated_at = now();
  return true;
end $$;
revoke all on function public.hotline_push_join(uuid, text, text, text, text) from public;
grant execute on function public.hotline_push_join(uuid, text, text, text, text) to anon, authenticated;

-- 알림 끄기(방에서 나가거나 끌 때)
create or replace function public.hotline_push_leave(p_hotline uuid, p_member text, p_token text)
returns boolean language sql volatile security definer set search_path = public as $$
  with d as (delete from hotline_member_push where hotline_id = p_hotline and member_anon_id = p_member and token = p_token returning 1)
  select exists (select 1 from d)
$$;
revoke all on function public.hotline_push_leave(uuid, text, text) from public;
grant execute on function public.hotline_push_leave(uuid, text, text) to anon, authenticated;

-- ④ 이 메시지 알림을 받을 폰들 (hotline-notify 서버 함수만) ---------------------
--    처음 한 번만 돌려줍니다(두 번째 부르면 빈 목록). 3분 지난 메시지 · 알림 안 보내는 종류(통화기록 등)는 빈 목록.
create or replace function public.hotline_notify_targets(p_message uuid)
returns table (hotline_id uuid, title text, tier text, invite_token text, sender_anon_id text, sender_nickname text,
               message_type text, content text, who text, push_token text, caps text, lang text)
language plpgsql volatile security definer set search_path = public as $$
declare m hotline_messages; v_owner uuid;
begin
  select * into m from hotline_messages x where x.id = p_message;
  if m.id is null or m.created_at < now() - interval '3 minutes' then return; end if;
  if coalesce(m.message_type::text, 'text') not in ('text', 'photo', 'video', 'document', 'voice') then return; end if;
  if not ac_hotline_alive(m.hotline_id) then return; end if;
  insert into hotline_push_sent(message_id) values (m.id) on conflict do nothing;
  if not found then return; end if;
  delete from hotline_push_sent where sent_at < now() - interval '2 days';
  v_owner := _hl_owner(m.hotline_id);

  return query
  with h as (select * from hotlines where id = m.hotline_id),
  t as (
    -- 개설자 (보낸 사람이 개설자가 아니면)
    select 'owner-' || v_owner::text as who, pt.token::text as push_token, pt.caps, pt.lang::text as lang
      from push_tokens pt
     where v_owner is not null and pt.user_id = v_owner and m.sender_anon_id::text <> 'owner-' || v_owner::text
       and pt.token::text !~* '^[0-9a-f]{64,200}$'
    union all
    -- 승인된 참가자 (보낸 사람 빼고)
    select mp.member_anon_id, mp.token, mp.caps, mp.lang
      from hotline_member_push mp
      join hotline_members hm on hm.hotline_id = mp.hotline_id and hm.member_anon_id = mp.member_anon_id
                             and coalesce(hm.status::text, 'approved') = 'approved'
     where mp.hotline_id = m.hotline_id and mp.member_anon_id <> m.sender_anon_id::text
  ),
  u as (select distinct on (t.push_token) t.* from t order by t.push_token, (t.who like 'owner-%') desc)
  select h.id, h.title::text, h.tier::text, h.invite_token::text, m.sender_anon_id::text, m.sender_nickname::text,
         coalesce(m.message_type::text, 'text')::text, left(coalesce(m.content, ''), 300), u.who, u.push_token, u.caps::text, u.lang
    from u cross join h;
end $$;
revoke all on function public.hotline_notify_targets(uuid) from public, anon, authenticated;
grant execute on function public.hotline_notify_targets(uuid) to service_role;

-- ⑤ 알림에서 바로 답장 (hotline-quick-reply 가 서명을 확인한 뒤 부름) ---------------
--    p_sender = 'owner-<개설자 id>' 또는 참가자 번호. 회선이 살아 있고 · 그 사람이 이 방 사람이어야 합니다.
create or replace function public.hotline_send_as(p_hotline uuid, p_sender text, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_body text := btrim(coalesce(p_body, '')); h hotlines; v_owner uuid; v_nick text; r hotline_messages;
begin
  select * into h from hotlines where id = p_hotline;
  if h.id is null or not ac_hotline_alive(p_hotline) then return jsonb_build_object('ok', false, 'error', 'line_ended'); end if;
  if coalesce(h.tier::text, '') like '%\_secure' then return jsonb_build_object('ok', false, 'error', 'secure'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'length'); end if;
  v_owner := _hl_owner(p_hotline);
  if p_sender like 'owner-%' then
    if v_owner is null or p_sender <> 'owner-' || v_owner::text then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
    select nickname into v_nick from hotline_members where hotline_id = p_hotline and member_anon_id = p_sender;
    if v_nick is null and h.subscription_id is not null then
      select nullif(to_jsonb(s)->>'display_name', '') into v_nick from hotline_subscriptions s where s.id = h.subscription_id;
    end if;
    v_nick := coalesce(v_nick, '개설자');
  else
    select nickname into v_nick from hotline_members
     where hotline_id = p_hotline and member_anon_id = p_sender and coalesce(status::text, 'approved') = 'approved';
    if not found then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
    v_nick := coalesce(v_nick, '참가자');
  end if;
  insert into hotline_messages(hotline_id, sender_anon_id, sender_nickname, message_type, content)
  values (p_hotline, p_sender, v_nick, 'text', v_body) returning * into r;
  return jsonb_build_object('ok', true, 'message', to_jsonb(r));
end $$;

-- [읽음] — 그 사람의 읽은 시각을 지금으로
create or replace function public.hotline_read_as(p_hotline uuid, p_sender text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_at timestamptz := now();
begin
  update hotline_members set last_read_at = v_at where hotline_id = p_hotline and member_anon_id = p_sender;
  return jsonb_build_object('ok', found, 'readAt', v_at);
end $$;
revoke all on function public.hotline_send_as(uuid, text, text), public.hotline_read_as(uuid, text) from public, anon, authenticated;
grant execute on function public.hotline_send_as(uuid, text, text), public.hotline_read_as(uuid, text) to service_role;

select 'hotline push ok' as result;
