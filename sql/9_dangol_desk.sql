-- =====================================================================
-- 🏪 단골창구 (전용 상품) — 가림 서버 · 2026-11-15
--   사업자등록증 없이, 가게 사진 · 간단한 소개만 올리면 바로 열리는 「가게 ↔ 손님」 문의 창구입니다.
--   · 개설료: 1년 9,900원 (처음 30일 무료 체험) — until 이 지나면 손님 화면이 「잠시 쉬는 중」이 됩니다.
--   · 손님: 앱 설치 · 가입 없이 QR(dangol.html?c=코드)로 열고, 자주 묻는 질문 → 사장님께 묻기.
--          손님 구분은 손님 휴대폰이 만든 임의 열쇠(토큰)의 해시로만 합니다. 전화번호 · 이름은 받지 않습니다(별명은 선택).
--   · 사장님: 가림콜 계정으로 dangol_owner.html 에서 열고 · 꾸미고 · 답장합니다.
--   · 안전장치: 손님 「신고하기」 → 종합관리자에서 즉시 중지 · 서류 확인 전 가게는 작게 「확인 전」 표시
--              (계좌번호 · 링크 경고는 화면에서 합니다)
--
--   만드는 것: dg_desks · dg_threads · dg_msgs · dg_reports · 사진 보관함(storage bucket 'dangol')
--   ⚠ Supabase(에일리어스콜 프로젝트) → SQL Editor 에 통째로 붙여 Run. 다시 돌려도 안전합니다.
-- =====================================================================

-- ① 표 -----------------------------------------------------------------
create table if not exists public.dg_desks (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code          text not null unique,
  name          text not null,
  category      text,
  intro         text,
  hours         text,
  region        text,
  photo_path    text,
  greeting      text,
  items         jsonb not null default '[]'::jsonb,
  status        text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  verified      boolean not null default false,
  until         timestamptz not null default now() + interval '30 days',
  trial_used    boolean not null default true,
  reports       int not null default 0,
  admin_note    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists dg_desks_owner_idx on public.dg_desks (owner_user_id);

create table if not exists public.dg_threads (
  id           uuid primary key default gen_random_uuid(),
  desk_id      uuid not null references public.dg_desks(id) on delete cascade,
  guest_hash   text not null,
  guest_name   text,
  status       text not null default 'open' check (status in ('open', 'answered', 'closed')),
  owner_unread int not null default 1,
  guest_unread int not null default 0,
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists dg_threads_desk_idx  on public.dg_threads (desk_id, updated_at desc);
create index if not exists dg_threads_guest_idx on public.dg_threads (guest_hash, updated_at desc);

create table if not exists public.dg_msgs (
  id         bigserial primary key,
  thread_id  uuid not null references public.dg_threads(id) on delete cascade,
  from_owner boolean not null default false,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists dg_msgs_thread_idx on public.dg_msgs (thread_id, id);

create table if not exists public.dg_reports (
  id         bigserial primary key,
  desk_id    uuid not null references public.dg_desks(id) on delete cascade,
  guest_hash text,
  reason     text,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.dg_desks   enable row level security;
alter table public.dg_threads enable row level security;
alter table public.dg_msgs    enable row level security;
alter table public.dg_reports enable row level security;
revoke all on public.dg_desks, public.dg_threads, public.dg_msgs, public.dg_reports from public, anon, authenticated;
grant  all on public.dg_desks, public.dg_threads, public.dg_msgs, public.dg_reports to service_role;
grant  usage, select on sequence public.dg_msgs_id_seq, public.dg_reports_id_seq to service_role;

-- 가게 사진 보관함 (누구나 볼 수 있고, 사장님은 자기 칸(사용자번호/…)에만 올림)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dangol', 'dangol', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "dangol owner write" on storage.objects;
create policy "dangol owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'dangol' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dangol owner update" on storage.objects;
create policy "dangol owner update" on storage.objects for update to authenticated
  using (bucket_id = 'dangol' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dangol owner delete" on storage.objects;
create policy "dangol owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dangol' and (storage.foldername(name))[1] = auth.uid()::text);

-- ② 도우미 ---------------------------------------------------------------
create or replace function public._dg_hash(p_token text) returns text language sql immutable as $$
  select case when length(coalesce(p_token, '')) >= 24 then md5('dg:' || p_token) end
$$;
create or replace function public._dg_live(d dg_desks) returns boolean language sql stable as $$
  select d.status = 'active' and d.until > now()
$$;
create or replace function public._dg_code() returns text language plpgsql volatile as $$
declare c text; abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from dg_desks where code = c);
  end loop;
  return c;
end $$;
create or replace function public._dg_desk_json(d dg_desks) returns jsonb language sql stable as $$
  select jsonb_build_object('code', d.code, 'name', d.name, 'category', d.category, 'intro', d.intro, 'hours', d.hours,
    'region', d.region, 'photo', d.photo_path, 'greeting', d.greeting, 'items', d.items, 'verified', d.verified)
$$;

-- ③ 손님 (로그인 없이) ------------------------------------------------------
create or replace function public.dg_desk(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d dg_desks;
begin
  select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
  if d.id is null or d.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status = 'suspended' then return jsonb_build_object('ok', false, 'error', 'suspended'); end if;
  if d.until <= now() then return jsonb_build_object('ok', false, 'error', 'paused', 'name', d.name); end if;
  return jsonb_build_object('ok', true) || _dg_desk_json(d);
end $$;

create or replace function public.dg_guest_send(p_code text, p_token text, p_body text, p_name text default null, p_thread uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; h text := _dg_hash(p_token); v_t uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if h is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;
  if char_length(v_body) < 1 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  if char_length(v_body) > 1000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
  if d.id is null or not _dg_live(d) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if (select count(*) from dg_msgs m join dg_threads t on t.id = m.thread_id
       where t.guest_hash = h and not m.from_owner and m.created_at > now() - interval '1 hour') >= 15 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  if p_thread is not null then
    select id into v_t from dg_threads where id = p_thread and desk_id = d.id and guest_hash = h;
  end if;
  if v_t is null then
    select id into v_t from dg_threads where desk_id = d.id and guest_hash = h and status <> 'closed' order by updated_at desc limit 1;
  end if;
  if v_t is null then
    insert into dg_threads (desk_id, guest_hash, guest_name) values (d.id, h, left(nullif(btrim(p_name), ''), 20)) returning id into v_t;
  else
    update dg_threads set status = 'open', owner_unread = owner_unread + 1, updated_at = now(),
           guest_name = coalesce(left(nullif(btrim(p_name), ''), 20), guest_name) where id = v_t;
  end if;
  insert into dg_msgs (thread_id, from_owner, body) values (v_t, false, v_body);
  return jsonb_build_object('ok', true, 'thread', v_t);
end $$;

create or replace function public.dg_guest_threads(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', t.id, 'code', d.code, 'name', d.name, 'photo', d.photo_path, 'status', t.status,
             'unread', t.guest_unread, 'updated_at', t.updated_at, 'live', _dg_live(d),
             'msgs', (select coalesce(jsonb_agg(jsonb_build_object('o', m.from_owner, 'b', m.body, 't', m.created_at) order by m.id), '[]'::jsonb)
                        from dg_msgs m where m.thread_id = t.id)) as x
      from dg_threads t join dg_desks d on d.id = t.desk_id
     where t.guest_hash = _dg_hash(p_token) and d.status <> 'closed'
     order by t.updated_at desc limit 30) s
$$;

create or replace function public.dg_guest_seen(p_token text, p_thread uuid)
returns void language sql security definer set search_path = public as $$
  update dg_threads set guest_unread = 0 where id = p_thread and guest_hash = _dg_hash(p_token);
$$;

create or replace function public.dg_report(p_code text, p_token text, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d dg_desks; h text := _dg_hash(p_token);
begin
  select * into d from dg_desks where code = upper(btrim(coalesce(p_code, '')));
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if h is not null and exists (select 1 from dg_reports where desk_id = d.id and guest_hash = h and created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if (select count(*) from dg_reports where created_at > now() - interval '1 minute') > 30 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  insert into dg_reports (desk_id, guest_hash, reason, note) values (d.id, h, left(coalesce(p_reason, '기타'), 40), left(p_note, 500));
  update dg_desks set reports = reports + 1 where id = d.id;
  return jsonb_build_object('ok', true);
end $$;

-- ④ 사장님 (가림콜 로그인) ----------------------------------------------------
create or replace function public.dg_open(p_name text, p_category text default null, p_intro text default null, p_hours text default null, p_region text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if (select count(*) from dg_desks where owner_user_id = v_uid and status <> 'closed') >= 3 then return jsonb_build_object('ok', false, 'error', 'too_many_desks'); end if;
  v_code := _dg_code();
  insert into dg_desks (owner_user_id, code, name, category, intro, hours, region)
  values (v_uid, v_code, left(btrim(p_name), 30), left(p_category, 20), left(p_intro, 400), left(p_hours, 80), left(p_region, 40))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end $$;

create or replace function public.dg_update(p_desk uuid, p_name text, p_category text, p_intro text, p_hours text, p_region text,
                                            p_photo text, p_greeting text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_items jsonb;
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if p_photo is not null and p_photo <> '' and split_part(p_photo, '/', 1) <> auth.uid()::text then return jsonb_build_object('ok', false, 'error', 'photo'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('q', left(btrim(x->>'q'), 80), 'a', left(btrim(x->>'a'), 600)) order by n), '[]'::jsonb) into v_items
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality as t(x, n)
   where n <= 30 and length(btrim(coalesce(x->>'q', ''))) > 0 and length(btrim(coalesce(x->>'a', ''))) > 0;
  update dg_desks set name = left(btrim(p_name), 30), category = left(p_category, 20), intro = left(p_intro, 400), hours = left(p_hours, 80),
         region = left(p_region, 40), photo_path = nullif(p_photo, ''), greeting = left(nullif(btrim(p_greeting), ''), 200), items = v_items, updated_at = now()
   where id = p_desk;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_items));
end $$;

create or replace function public.dg_owner_desks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_dg_desk_json(d) || jsonb_build_object('id', d.id, 'status', d.status, 'until', d.until, 'live', _dg_live(d),
           'waiting', (select count(*) from dg_threads t where t.desk_id = d.id and t.status = 'open'),
           'unread', (select coalesce(sum(owner_unread), 0) from dg_threads t where t.desk_id = d.id)) order by d.created_at), '[]'::jsonb)
    from dg_desks d where d.owner_user_id = auth.uid() and d.status <> 'closed'
$$;

create or replace function public.dg_owner_threads(p_desk uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from dg_desks where id = p_desk and owner_user_id = auth.uid()) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x->>'updated_at') desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', t.id, 'name', coalesce(t.guest_name, '손님 ' || upper(left(t.guest_hash, 4))), 'status', t.status,
             'unread', t.owner_unread, 'created_at', t.created_at, 'updated_at', t.updated_at,
             'msgs', (select coalesce(jsonb_agg(jsonb_build_object('o', m.from_owner, 'b', m.body, 't', m.created_at) order by m.id), '[]'::jsonb)
                        from dg_msgs m where m.thread_id = t.id)) as x
      from dg_threads t where t.desk_id = p_desk and t.updated_at > now() - interval '180 days'
     order by t.updated_at desc limit 300) s;
  return v;
end $$;

create or replace function public.dg_owner_reply(p_thread uuid, p_body text, p_close boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_body text := btrim(coalesce(p_body, ''));
begin
  if not exists (select 1 from dg_threads t join dg_desks d on d.id = t.desk_id where t.id = p_thread and d.owner_user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'length'); end if;
  insert into dg_msgs (thread_id, from_owner, body) values (p_thread, true, v_body);
  update dg_threads set status = case when p_close then 'closed' else 'answered' end, guest_unread = guest_unread + 1, owner_unread = 0, updated_at = now()
   where id = p_thread;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dg_owner_set(p_thread uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dg_threads t join dg_desks d on d.id = t.desk_id where t.id = p_thread and d.owner_user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_mine'); end if;
  if p_status = 'seen' then update dg_threads set owner_unread = 0 where id = p_thread;
  elsif p_status in ('open', 'answered', 'closed') then update dg_threads set status = p_status, owner_unread = 0, updated_at = now() where id = p_thread;
  else return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.dg_owner_close_desk(p_desk uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update dg_desks set status = 'closed', updated_at = now() where id = p_desk and owner_user_id = auth.uid() and status <> 'suspended';
  return jsonb_build_object('ok', found);
end $$;

-- 개설료(1년) 넣기 — 결제 함수(service_role) · 관리자
create or replace function public.dg_extend(p_desk uuid, p_months int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  update dg_desks set until = greatest(until, now()) + make_interval(months => p_months), updated_at = now() where id = p_desk returning until into v;
  return v;
end $$;

-- ⑤ 알림 (dangol-notify 함수가 service_role 로 부름) ----------------------------------
--   손님이 보낸 직후에만, 같은 대화는 2분에 한 번만 사장님 기기를 돌려줍니다.
create or replace function public.dg_notify_owner_targets(p_thread uuid, p_token text)
returns table (push_token text, lang text, desk_name text, guest text, preview text) language plpgsql security definer set search_path = public as $$
declare t dg_threads; d dg_desks; m dg_msgs;
begin
  select * into t from dg_threads where id = p_thread and guest_hash = _dg_hash(p_token);
  if t.id is null or (t.notified_at is not null and t.notified_at > now() - interval '2 minutes') then return; end if;
  select * into m from dg_msgs where thread_id = t.id order by id desc limit 1;
  if m.id is null or m.from_owner or m.created_at < now() - interval '2 minutes' then return; end if;
  select * into d from dg_desks where id = t.desk_id;
  update dg_threads set notified_at = now() where id = t.id;
  return query select k.token::text, coalesce(to_jsonb(k)->>'lang', 'ko'), d.name, coalesce(t.guest_name, '손님'), left(m.body, 80)
    from push_tokens k where k.user_id = d.owner_user_id and k.token is not null
     and k.token::text !~* '^[0-9a-f]{64,200}$' and k.token::text !~ '^[{h]';
end $$;

-- ⑥ 종합관리자 -----------------------------------------------------------------
create or replace function public.admin_dg_list()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(_dg_desk_json(d) || jsonb_build_object('id', d.id, 'status', d.status, 'until', d.until, 'reports', d.reports,
           'created_at', d.created_at, 'login', u.email, 'nick', (select to_jsonb(p)->>'nickname' from profiles p where p.id = d.owner_user_id),
           'admin_note', d.admin_note,
           'threads', (select count(*) from dg_threads t where t.desk_id = d.id),
           'report_list', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note, 'at', r.created_at) order by r.id desc), '[]'::jsonb)
                             from (select * from dg_reports r where r.desk_id = d.id order by r.id desc limit 10) r))
           order by d.reports desc, d.created_at desc), '[]'::jsonb) into v
    from dg_desks d left join auth.users u on u.id = d.owner_user_id;
  return v;
end $$;

create or replace function public.admin_dg_set(p_desk uuid, p_status text default null, p_verified boolean default null, p_months int default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_global_admin(), false) then raise exception 'not_admin'; end if;
  update dg_desks set status = coalesce(case when p_status in ('active', 'suspended', 'closed') then p_status end, status),
         verified = coalesce(p_verified, verified), admin_note = coalesce(p_note, admin_note), updated_at = now() where id = p_desk;
  if coalesce(p_months, 0) > 0 then perform dg_extend(p_desk, p_months); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ⑦ 권한 ---------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array['dg_desk(text)', 'dg_guest_send(text, text, text, text, uuid)', 'dg_guest_threads(text)', 'dg_guest_seen(text, uuid)',
                           'dg_report(text, text, text, text)'] loop
    execute 'revoke execute on function public.' || f || ' from public';
    execute 'grant execute on function public.' || f || ' to anon, authenticated';
  end loop;
  foreach f in array array['dg_open(text, text, text, text, text)', 'dg_update(uuid, text, text, text, text, text, text, text, jsonb)',
                           'dg_owner_desks()', 'dg_owner_threads(uuid)', 'dg_owner_reply(uuid, text, boolean)', 'dg_owner_set(uuid, text)',
                           'dg_owner_close_desk(uuid)', 'admin_dg_list()', 'admin_dg_set(uuid, text, boolean, int, text)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
  foreach f in array array['dg_extend(uuid, int)', 'dg_notify_owner_targets(uuid, text)', '_dg_code()'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || f || ' to service_role';
  end loop;
end $$;

select 'dangol desk ok' as result, (select count(*) from dg_desks) as desks,
       (select public from storage.buckets where id = 'dangol') as photo_bucket_public;
