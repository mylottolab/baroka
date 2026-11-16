-- =====================================================================
-- 🏪 단골창구 — ① 가게 공지 한 줄  ② 자동 답장 (2026-11-16)
--   ① 공지: 「오늘 재료 소진으로 6시 마감」 — 손님 화면 맨 위에 띄웁니다(100자).
--   ② 자동 답장: 손님이 물으면 사장님 대신 바로 안내가 나갑니다(같은 손님에게 3시간에 한 번).
--      · 바쁨(사장님이 켜고 끔)          → 바쁨 안내 글
--      · 영업시간 밖(여는 · 닫는 시각, 쉬는 요일) → 영업시간 밖 안내 글
--      자동 답장은 「🤖 자동 안내」로 표시되고, 문의는 그대로 사장님 받은편지함에 남습니다.
--   에일리어스콜(가림) 프로젝트 SQL 편집기에서 한 번 실행하세요. 13_dangol_search.sql 다음.
-- =====================================================================

alter table public.dg_desks add column if not exists notice     text;
alter table public.dg_desks add column if not exists busy       boolean not null default false;
alter table public.dg_desks add column if not exists busy_msg   text;
alter table public.dg_desks add column if not exists hours_on   boolean not null default false;
alter table public.dg_desks add column if not exists open_time  time;
alter table public.dg_desks add column if not exists close_time time;
alter table public.dg_desks add column if not exists off_days   int[] not null default '{}';   -- 0=일 … 6=토
alter table public.dg_desks add column if not exists off_msg    text;
alter table public.dg_msgs  add column if not exists is_auto    boolean not null default false;

-- 지금(한국 시각) 영업시간 밖인가
create or replace function public._dg_away(d dg_desks) returns boolean language sql stable as $$
  select d.hours_on and d.open_time is not null and d.close_time is not null and (
           extract(dow from (now() at time zone 'Asia/Seoul'))::int = any(d.off_days)
           or case when d.open_time <= d.close_time
                   then not ((now() at time zone 'Asia/Seoul')::time between d.open_time and d.close_time)
                   else ((now() at time zone 'Asia/Seoul')::time between d.close_time and d.open_time)   -- 밤새 영업(예: 18:00~02:00)
              end)
$$;

-- 손님 · 사장님 화면에 함께 보내는 가게 정보 (12_dangol_address.sql 의 것 + 공지 · 자동 답장)
create or replace function public._dg_desk_json(d dg_desks) returns jsonb language sql stable as $$
  select jsonb_build_object('code', d.code, 'name', d.name, 'category', d.category, 'intro', d.intro, 'hours', d.hours,
    'region', d.region, 'photo', d.photo_path, 'greeting', d.greeting, 'items', d.items, 'verified', d.verified,
    'address', d.address, 'address_detail', d.address_detail,
    'notice', d.notice, 'busy', d.busy, 'busy_msg', d.busy_msg,
    'hours_on', d.hours_on, 'open_time', to_char(d.open_time, 'HH24:MI'), 'close_time', to_char(d.close_time, 'HH24:MI'),
    'off_days', to_jsonb(d.off_days), 'off_msg', d.off_msg, 'away', _dg_away(d))
$$;

-- 사장님: 공지 · 자동 답장 저장
create or replace function public.dg_set_extras(p_desk uuid, p_notice text, p_busy boolean, p_busy_msg text,
                                                p_hours_on boolean, p_open text, p_close text, p_off jsonb, p_off_msg text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_open time; v_close time;
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  begin v_open := nullif(btrim(coalesce(p_open, '')), '')::time; v_close := nullif(btrim(coalesce(p_close, '')), '')::time;
  exception when others then return jsonb_build_object('ok', false, 'error', 'bad_time'); end;
  if coalesce(p_hours_on, false) and (v_open is null or v_close is null) then return jsonb_build_object('ok', false, 'error', 'need_hours'); end if;
  update dg_desks set
    notice     = left(nullif(btrim(coalesce(p_notice, '')), ''), 100),
    busy       = coalesce(p_busy, false),
    busy_msg   = left(nullif(btrim(coalesce(p_busy_msg, '')), ''), 200),
    hours_on   = coalesce(p_hours_on, false),
    open_time  = v_open, close_time = v_close,
    off_days   = coalesce((select array_agg(distinct x::int) from jsonb_array_elements_text(case when jsonb_typeof(p_off) = 'array' then p_off else '[]'::jsonb end) x where x ~ '^[0-6]$'), '{}'),
    off_msg    = left(nullif(btrim(coalesce(p_off_msg, '')), ''), 200),
    updated_at = now()
  where id = p_desk;
  return jsonb_build_object('ok', true);
end $$;

-- 사장님: 「지금 바쁨」만 바로 켜고 끄기 (첫 화면 단추)
create or replace function public.dg_set_busy(p_desk uuid, p_busy boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_desks set busy = coalesce(p_busy, false), updated_at = now() where id = p_desk and owner_user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  return jsonb_build_object('ok', true, 'busy', coalesce(p_busy, false));
end $$;

-- 손님 글이 들어오면 → 필요할 때 자동 답장 한 줄 (같은 손님 대화에 3시간에 한 번)
create or replace function public._dg_auto_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare t dg_threads; d dg_desks; v_msg text;
begin
  if new.from_owner then return new; end if;
  select * into t from dg_threads where id = new.thread_id;
  select * into d from dg_desks where id = t.desk_id;
  if d.id is null then return new; end if;
  if _dg_away(d) then
    v_msg := coalesce(d.off_msg, '지금은 영업시간이 아니에요' || case when d.open_time is not null then ' (' || to_char(d.open_time, 'HH24:MI') || '~' || to_char(d.close_time, 'HH24:MI') || ')' else '' end || '. 문의는 잘 받았고, 영업시간에 답해 드릴게요.');
  elsif d.busy then
    v_msg := coalesce(d.busy_msg, '지금 손님이 많아 답이 조금 늦을 수 있어요. 문의는 잘 받았어요. 곧 답해 드릴게요!');
  else
    return new;
  end if;
  if exists (select 1 from dg_msgs m where m.thread_id = t.id and m.is_auto and m.created_at > now() - interval '3 hours') then return new; end if;
  insert into dg_msgs (thread_id, from_owner, body, is_auto) values (t.id, true, '🤖 자동 안내: ' || v_msg, true);
  update dg_threads set guest_unread = guest_unread + 1, updated_at = now() where id = t.id;
  return new;
end $$;

drop trigger if exists dg_msgs_auto_reply on public.dg_msgs;
create trigger dg_msgs_auto_reply after insert on public.dg_msgs for each row when (not new.from_owner) execute function public._dg_auto_reply();

revoke execute on function public.dg_set_extras(uuid, text, boolean, text, boolean, text, text, jsonb, text) from public, anon;
grant  execute on function public.dg_set_extras(uuid, text, boolean, text, boolean, text, text, jsonb, text) to authenticated;
revoke execute on function public.dg_set_busy(uuid, boolean) from public, anon;
grant  execute on function public.dg_set_busy(uuid, boolean) to authenticated;

select 'dangol notice auto ok' as result;
