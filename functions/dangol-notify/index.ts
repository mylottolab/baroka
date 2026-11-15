// =====================================================================
// 🏪 단골창구 — dangol-notify Edge Function (가림 서버 · 2026-11-15)
//   손님이 단골창구에 글을 보내면 손님 화면이 부릅니다 → 사장님 휴대폰에 「새 문의」 알림.
//     POST /functions/v1/dangol-notify   { thread: '<대화 번호>', token: '<손님 열쇠>' }
//   손님은 로그인이 없으므로 ⚠ Verify JWT 를 끄고 배포합니다.
//   대신 dg_notify_owner_targets() 가 「그 손님의 대화인지 · 방금(2분 안) 보낸 글인지 · 2분에 한 번만」을 검사해
//   마구 불러도 사장님께 알림이 쏟아지지 않습니다.
//   비밀값: FCM_SERVICE_ACCOUNT (이미 있음 — 가림 알림과 같은 것)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
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
    const thread = String(body.thread || ''), token = String(body.token || '');
    if (!/^[0-9a-f-]{36}$/i.test(thread) || token.length < 24 || token.length > 100) return json({ error: 'bad_request' }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE);
    const tk = await admin.rpc('dg_notify_owner_targets', { p_thread: thread, p_token: token });
    if (tk.error) { console.error('[dangol] 🔴', JSON.stringify(tk.error)); return json({ error: 'targets' }, 500); }
    const rows = (tk.data || []).filter((r: any) => r.push_token);
    if (!rows.length) return json({ ok: true, sent: 0 });
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!raw) throw new Error('FCM_SERVICE_ACCOUNT 가 없습니다');
    const sa = JSON.parse(raw);
    const accessToken = await getGoogleToken(sa);
    let sent = 0;
    for (const r of rows) {
      const title = '🏪 ' + r.desk_name + ' 단골창구 — 새 문의';
      const text = (r.guest || '손님') + ': ' + String(r.preview || '').replace(/\s+/g, ' ');
      const o = await sendOne(sa.project_id, accessToken, r.push_token, {
        notification: { title, body: text },
        data: { kind: 'dangol', thread, url: 'dangol_owner.html?t=' + thread, title, body: text },
        android: { priority: 'HIGH', notification: { channel_id: 'aliascall_urgent', sound: 'default', tag: 'dangol-' + thread } },
        apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { sound: 'default', 'thread-id': 'dangol' } } },
      });
      if (o.ok) sent++;
    }
    return json({ ok: true, sent });
  } catch (err) {
    console.error('[dangol-notify] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
