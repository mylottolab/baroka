// =====================================================================
// 💬 단톡방 — dantok-notify Edge Function (가림 서버 · 2026-11-17)
//   방에 글을 보내면 보낸 사람 화면이 부릅니다 → 같은 방 사람들 휴대폰에 알림.
//     POST /functions/v1/dantok-notify   { msg: <글 번호> }   (단톡방 익명 로그인 토큰으로)
//   ✅ Verify JWT 는 켠 채로 배포합니다(단톡방 사람은 모두 익명 로그인 토큰이 있음).
//   dt_notify_targets() 가 「보낸 사람 본인의 글인지 · 방금(2분 안) 쓴 글인지」를 검사하고,
//   알림 끈 사람 · 보낸 사람을 차단한 사람은 뺍니다. 같은 방 알림은 휴대폰에서 한 줄로 겹칩니다(tag).
//   비밀값: FCM_SERVICE_ACCOUNT (이미 있음 — 가림 · 단골창구 알림과 같은 것)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let cachedToken: string | null = null;
let cachedUntil = 0;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8', raw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
}

async function getGoogleToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedUntil) return cachedToken;

  const enc = new TextEncoder();
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned =
    b64url(enc.encode(JSON.stringify(header))) + '.' +
    b64url(enc.encode(JSON.stringify(claim)));

  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = unsigned + '.' + b64url(new Uint8Array(sig));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const out = await res.json();
  if (!out.access_token) {
    /* 🔴 2026-09-15 — 열쇠가 잘못됐을 때 여기서 걸립니다.
       구글이 준 이유를 그대로 남깁니다. */
    console.error('[push] 🔴 구글 출입증 실패:', JSON.stringify(out));
    throw new Error('구글 출입증을 못 받았습니다: ' + JSON.stringify(out));
  }
  console.log('[push] 구글 출입증 받았습니다');
  cachedToken = out.access_token;
  cachedUntil = now + 3300;   // 55분
  return cachedToken!;
}

/* ── 알림 한 대 쏘기 ───────────────────────────────────────────── */
async function sendOne(projectId: string, accessToken: string, token: string, payload: any) {
  const res = await fetch(
    'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: Object.assign({ token: token }, payload) }),
    },
  );
  const out = await res.json().catch(() => ({}));

  /* 🔴 2026-09-15 — 답을 반드시 남깁니다.
     기기 번호는 앞 12자만 남깁니다. 통째로 남기면 로그가 지저분하고,
     그 자체가 남의 폰을 가리키는 값이라 굳이 다 적을 필요가 없습니다. */
  const head = String(token).slice(0, 12) + '…';
  if (res.ok) {
    console.log('[push] ✓ 보냈습니다 (' + head + ')');
  } else {
    console.error('[push] 🔴 거절당했습니다 (' + head + ') 코드 ' + res.status +
      ' — ' + JSON.stringify(out).slice(0, 400));
  }
  return { ok: res.ok, status: res.status, out: out };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const msg = Number(body.msg);
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!Number.isInteger(msg) || msg <= 0 || !jwt) return json({ error: 'bad_request' }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE);
    const u = await admin.auth.getUser(jwt);
    if (u.error || !u.data?.user) return json({ error: 'login' }, 401);
    const tg = await admin.rpc('dt_notify_targets', { p_msg: msg, p_user: u.data.user.id });
    if (tg.error) { console.error('[dantok] 🔴 targets', JSON.stringify(tg.error)); return json({ error: 'targets' }, 500); }
    const rows = (tg.data || []).filter((r: any) => r.token);
    if (!rows.length) return json({ ok: true, sent: 0 });
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!raw) throw new Error('FCM_SERVICE_ACCOUNT 가 없습니다');
    const sa = JSON.parse(raw);
    const at = await getGoogleToken(sa);
    let sent = 0;
    const dead: string[] = [];
    // 300명 방도 있으니 20대씩 나눠 한꺼번에 보냅니다
    for (let i = 0; i < rows.length; i += 20) {
      const part = rows.slice(i, i + 20);
      const outs = await Promise.all(part.map((r: any) => {
        const title = '💬 ' + r.room_name;
        const text = (r.nick || '') + ': ' + String(r.preview || '').replace(/\s+/g, ' ');
        return sendOne(sa.project_id, at, r.token, {
          notification: { title, body: text },
          data: { kind: 'dantok', room: String(r.room_id), url: 'room.html?r=' + r.room_id, title, body: text },
          android: { priority: 'HIGH', notification: { channel_id: 'dantok_msg', sound: 'default', tag: 'dt-' + r.room_id } },
          apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': 'dt-' + r.room_id },
                  payload: { aps: { sound: 'default', 'thread-id': 'dt-' + r.room_id } } },
        });
      }));
      outs.forEach((o: any, k: number) => {
        if (o.ok) sent++;
        else if (o.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(JSON.stringify(o.out))) dead.push(part[k].token);
      });
    }
    // 앱을 지운 휴대폰의 알림 주소는 지웁니다
    if (dead.length) await admin.from('dt_push').delete().in('token', dead);
    return json({ ok: true, sent, dropped: dead.length });
  } catch (err) {
    console.error('[dantok-notify] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
