// 바로카 앱 전화 알림을 더한 판 (2026-11-03) — 이 줄부터 파일 끝까지 통째로 붙여 넣으세요
// =====================================================
// Aliascall — aliascall-fcm-send Edge Function
// 2026-08-23 신설. 안드로이드 앱(FCM) 전용 푸시 발송기.
// 2026-08-25 다국어 대응.
// 2026-10-01 🔴 data_only — 전화 신호(kind: call · missed)는 notification 없이 data 만 보냅니다.
//   notification 을 함께 보내면 앱이 잠들어 있을 때 구글이 알림을 대신 만들어 버려서
//   앱의 CallMessagingService 가 아예 불리지 않습니다(잠금화면 전체 화면 · 벨소리가 안 됨).
//
// 호출 예 (보통 알림 — 예전과 같음):
//   { "user_id": "...", "title": "...", "body": "...", "title_en": "...", "body_en": "...", "data": {...} }
// 호출 예 (전화 신호):
//   { "user_id": "...", "data_only": true, "data": { "kind": "call", "call_id": "...", ... } }
//
// ⚠ 언어는 "사용자 단위"가 아니라 "토큰(기기) 단위"로 고름.
// 필요한 환경변수: FCM_SERVICE_ACCOUNT  ← Firebase 서비스 계정 JSON 전체
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ServiceAccount { project_id: string; client_email: string; private_key: string; }

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT 환경변수가 없습니다.');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('FCM_SERVICE_ACCOUNT 내용이 올바르지 않습니다.');
  return sa;
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(s: string): string { return b64urlFromBytes(new TextEncoder().encode(s)); }

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let _cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.expiresAt > now + 60) return _cachedToken.value;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
                   aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64urlFromBytes(new Uint8Array(sigBuf))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error('구글 액세스 토큰 발급 실패: ' + (await res.text()));
  const json = await res.json();
  _cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return _cachedToken.value;
}

const b64url = b64urlFromBytes;   // 🔴 2026-10-11 아이폰 전화(VoIP) 코드가 씁니다

/* ── 🔴 2026-10-10 아이폰 전화(VoIP) — 애플로 직접 ─────────────────── */
const IOS_BUNDLE = 'com.weaveapp.aliascall';
/* 🔴 2026-11-03 — 바로카 앱(com.weaveapp.baroka)도 같은 서버를 씁니다. 애플이 "다른 앱 번호"(DeviceTokenNotForTopic)라 하면 바로카 앱 번호로 한 번 더 */
const ALT_BUNDLE = 'com.weaveapp.baroka';

/* 아이폰 "전화용 기기 번호" 는 16진수 64자입니다. Firebase 번호는 ':' 가 들어 있어 구별됩니다. */
function isVoipToken(r: any): boolean {
  const t = String(r && r.push_token || '');
  return /^[0-9a-f]{64,200}$/i.test(t) || (r && r.platform === 'ios_voip');
}

let apnsJwt: string | null = null;
let apnsJwtAt = 0;

async function getApnsJwt(): Promise<string | null> {
  const p8 = Deno.env.get('APNS_KEY_P8') || '';
  // 🔴 따옴표 · 빈칸 · 줄바꿈이 섞여 들어와도 영문 · 숫자만 남깁니다
  const kid = (Deno.env.get('APNS_KEY_ID') || '').replace(/[^A-Za-z0-9]/g, '');
  const team = (Deno.env.get('APNS_TEAM_ID') || '').replace(/[^A-Za-z0-9]/g, '');
  if (!p8 || !kid || !team) {
    console.warn('[voip] ⚠ APNS_KEY_P8 · APNS_KEY_ID · APNS_TEAM_ID 중 없는 것이 있습니다. 아이폰 전화를 건너뜁니다.');
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwtAt < 50 * 60) return apnsJwt;   // 애플은 20분~60분 사이에 새로 만들라고 합니다

  /* 붙여넣다 줄바꿈이 사라져도 읽히도록, 머리 · 꼬리 · 빈칸을 모두 걷어냅니다 */
  const b64 = p8.replace(/-----[A-Z ]+-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  /* 🔴 2026-10-10 — 어떤 재료로 만드는지 남깁니다(비밀은 남기지 않음).
     열쇠 길이는 애플 알림 열쇠면 보통 200 자입니다. */
  console.log('[voip] 출입증 재료: team=' + team + ' / key=' + kid + ' / 열쇠 길이=' + b64.length);
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', raw.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const enc = new TextEncoder();
  const unsigned = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: kid }))) + '.' +
                   b64url(enc.encode(JSON.stringify({ iss: team, iat: now })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  apnsJwt = unsigned + '.' + b64url(new Uint8Array(sig));
  apnsJwtAt = now;
  console.log('[voip] 애플 출입증을 만들었습니다 (key=' + kid + ')');
  return apnsJwt;
}

/* 한 대 보내기. 정식(TestFlight · 앱스토어) 주소로 먼저, "모르는 번호" 면 시험용 주소로 한 번 더. */
async function sendVoip(jwt: string, token: string, data: any, sandbox = false, topic = IOS_BUNDLE): Promise<{ ok: boolean; status: number; out: any }> {
  const host = sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const res = await fetch(host + '/3/device/' + token, {
    method: 'POST',
    headers: {
      'authorization': 'bearer ' + jwt,
      'apns-topic': topic + '.voip',
      'apns-push-type': 'voip',
      'apns-priority': '10',
      // 40초 안에 못 전하면 버립니다 — 다 끝난 전화가 늦게 울리지 않게
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 40),
      'content-type': 'application/json',
    },
    body: JSON.stringify(Object.assign({ aps: {} }, data)),
  });
  const text = await res.text().catch(() => '');
  let out: any = {};
  try { out = text ? JSON.parse(text) : {}; } catch (_) { out = { raw: text.slice(0, 200) }; }
  const head = String(token).slice(0, 10) + '…';
  if (res.ok) {
    console.log('[voip] ✓ 애플로 보냈습니다 (' + head + (sandbox ? ' · 시험용' : '') + ')');
  } else {
    console.error('[voip] 🔴 애플이 거절 (' + head + ') ' + res.status + ' — ' + JSON.stringify(out).slice(0, 200));
    if (res.status === 403 && out && out.reason === 'InvalidProviderToken') {
      // 출입증이 틀렸습니다 — 다음 번엔 새로 만들게 버립니다
      apnsJwt = null;
      console.error('[voip] 🔴 애플: 출입증이 틀렸습니다. APNS_KEY_P8 이 AuthKey_' + ((Deno.env.get('APNS_KEY_ID') || '').replace(/[^A-Za-z0-9]/g, '')) +
        '.p8 파일 내용인지, APNS_TEAM_ID 가 맞는지 확인하세요.');
    }
    if (!sandbox && res.status === 400 && out && out.reason === 'BadDeviceToken') {
      return await sendVoip(jwt, token, data, true, topic);
    }
    if (res.status === 400 && out && out.reason === 'DeviceTokenNotForTopic' && topic === IOS_BUNDLE) {
      return await sendVoip(jwt, token, data, sandbox, ALT_BUNDLE);
    }
  }
  return { ok: res.ok, status: res.status, out: out };
}

async function sendToToken(
  sa: ServiceAccount, accessToken: string, token: string,
  title: string, body: string, data: Record<string, string>, dataOnly: boolean,
): Promise<{ ok: boolean; dead: boolean; detail?: string }> {
  /* 🔴 data_only — notification 을 빼고, 금방 사라지는 급한 신호로 보냅니다(ttl 45초).
     늦게 도착한 전화 신호가 끝난 통화의 벨을 울리지 않게 짧게 둡니다. */
  const message: any = dataOnly
    ? { token, data, android: { priority: 'HIGH', ttl: '45s' } }
    : {
        token,
        notification: { title, body },
        data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'aliascall_urgent', default_sound: true, default_vibrate_timings: true },
        },
        apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { alert: { title, body }, sound: 'default' } } },   // 🔴 2026-10-12 아이폰 — 제목·내용을 애플 칸에도 직접
      };
  /* 🔴 2026-10-11 아이폰 — 끝난 전화(missed)는 "부재중 전화" 알림으로 보이고, 앱을 깨워 울리던 전화 화면을 닫게 합니다.
     전화 신호(call) 자체는 아이폰에 일반 알림으로 보내지 않습니다(VoIP 가 맡음). */
  if (dataOnly && data.kind === 'missed') {
    message.apns = {
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
      payload: { aps: { alert: { title: '부재중 전화', body: data.who ? (data.who + ' 님의 전화') : '전화가 끊어졌습니다' },
                        'content-available': 1, 'thread-id': 'call-' + (data.call_id || '') } },
    };
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return { ok: true, dead: false };
  const text = await res.text();
  const dead = res.status === 404 || (res.status === 400 && text.includes('INVALID_ARGUMENT'));
  return { ok: false, dead, detail: `${res.status} ${text}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: CORS });

  // 서버 내부 호출 전용 — service_role 키를 가진 쪽만 허용
  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (auth.replace('Bearer ', '').trim() !== serviceKey) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: CORS });
  }

  try {
    const { user_id, title, body, title_en, body_en, data, data_only } = await req.json();
    const dataOnly = data_only === true;
    if (!user_id || (!title && !dataOnly)) {
      return new Response(JSON.stringify({ error: 'user_id, title이 필요합니다.' }), { status: 400, headers: CORS });
    }

    const { data: rows, error } = await supabase.from('push_tokens').select('token, lang').eq('user_id', user_id);
    if (error) return new Response(JSON.stringify({ error: '토큰 조회 실패: ' + error.message }), { status: 500, headers: CORS });
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: '등록된 앱 토큰 없음' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const sa = loadServiceAccount();
    const accessToken = await getAccessToken(sa);

    const strData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data ?? {})) if (v !== null && v !== undefined) strData[k] = String(v);

    let sent = 0, sentEn = 0;
    const deadTokens: string[] = [];

    /* 🔴 2026-10-11 아이폰 전화용 번호(16진수 64자)는 Firebase 가 아니라 애플로 — 전화 신호(call)일 때만 */
    const voipRows = rows.filter((r: any) => isVoipToken({ push_token: r.token }));
    let voipSent = 0;
    if (voipRows.length && dataOnly && strData.kind === 'call') {
      try {
        const jwt = await getApnsJwt();
        if (jwt) {
          for (const r of voipRows) {
            const o = await sendVoip(jwt, r.token, {
              kind: 'call', call_id: strData.call_id || '', call_type: strData.call_type || 'voice',
              who: (r.lang === 'en' ? (strData.who_en || strData.who) : strData.who) || '',
            });
            if (o.ok) voipSent++;
          }
        }
      } catch (e) { console.error('[voip] 🔴 아이폰 전화 보내기 실패:', String((e as Error).message ?? e)); }
    }

    for (const row of rows) {
      if (isVoipToken({ push_token: row.token })) continue;   // 아이폰 전화용 번호 — 위에서 처리(지우지 않음)
      const useEn = row.lang === 'en' && !!title_en;
      const t = useEn ? title_en : (title ?? '');
      const b = useEn ? (body_en ?? '') : (body ?? '');
      const r = await sendToToken(sa, accessToken, row.token, t, b, strData, dataOnly);
      if (r.ok) { sent++; if (useEn) sentEn++; console.log('[fcm] ✓ 보냈습니다 (' + String(row.token).slice(0, 12) + '…)'); }
      else { console.error('[fcm] 발송 실패:', r.detail); if (r.dead) deadTokens.push(row.token); }
    }

    if (deadTokens.length > 0) {
      await supabase.from('push_tokens').delete().in('token', deadTokens);
      console.log(`[fcm] 만료 토큰 ${deadTokens.length}개 삭제`);
    }
    return new Response(JSON.stringify({ ok: true, sent: sent + voipSent, sentEn, voip: voipSent, removed: deadTokens.length, dataOnly }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[fcm] 오류:', err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), { status: 500, headers: CORS });
  }
});
