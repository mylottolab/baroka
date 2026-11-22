-- =====================================================================
-- 가림 서버 — 알림에서 바로 [답장] · [읽음] (2026-11-22) · 가림(에일리어스콜) Supabase SQL Editor 에서 Run
--   (단톡방은 25_dantok_quick_reply.sql 이 따로 있습니다)
--   · push_tokens.caps     새 앱(안드로이드)이 「알림 답장 됨(qr1)」 을 적어 둠 → 그 폰에만 위에 뜨는 답장 알림
--   · set_push_caps()      앱 화면(aliascall_push.js)이 부름 — 내 기기 줄에만 적음
--   · dg_owner_reply_as()  단골창구 사장님 답장(dangol-quick-reply 서버 함수만) — dg_owner_reply 와 같은 검사
--   · dg_owner_seen_as()   단골창구 [읽음]
--   새 칸 하나(push_tokens.caps), 새 표 없음. 다시 돌려도 안전합니다. 맨 아래 'garim quick reply ok'
-- =====================================================================
alter table public.push_tokens add column if not exists caps text;

create or replace function public.set_push_caps(p_token text, p_caps text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  update push_tokens set caps = left(coalesce(p_caps, ''), 40) where token::text = p_token and user_id = auth.uid();
  return found;
end $$;
revoke all on function public.set_push_caps(text, text) from public, anon;
grant execute on function public.set_push_caps(text, text) to authenticated;

create or replace function public.dg_owner_reply_as(p_owner uuid, p_thread uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_body text := btrim(coalesce(p_body, ''));
begin
  if not exists (select 1 from dg_threads t join dg_desks d on d.id = t.desk_id where t.id = p_thread and d.owner_user_id = p_owner) then
    return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'length'); end if;
  insert into dg_msgs (thread_id, from_owner, body) values (p_thread, true, v_body);
  update dg_threads set status = 'answered', guest_unread = guest_unread + 1, owner_unread = 0, updated_at = now() where id = p_thread;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dg_owner_seen_as(p_owner uuid, p_thread uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_threads t set owner_unread = 0 from dg_desks d where t.id = p_thread and d.id = t.desk_id and d.owner_user_id = p_owner;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.dg_owner_reply_as(uuid, uuid, text), public.dg_owner_seen_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dg_owner_reply_as(uuid, uuid, text), public.dg_owner_seen_as(uuid, uuid) to service_role;
select 'garim quick reply ok' as result;
