// =====================================================================
// 💬 고객센터 답장 알림 — support-notify Edge Function (두 서버 공통 · 2026-11-15)
//   종합관리자 「💬 고객문의」에서 답장을 보내면 그 화면이 부릅니다.
//     POST /functions/v1/support-notify   { ticket: '<문의 번호>', preview: '답장 앞부분' }
//   관리자 로그인 토큰 그대로 → admin_support_push_targets() 가 관리자인지 검사하고
//   그 문의를 쓴 분의 기기 번호만 돌려줍니다. 알림을 누르면 앱의 support.html?t=… 이 열립니다.
//
//   비밀값(Secrets): 이미 들어 있는 것을 씁니다
//     부름 서버 FIREBASE_SERVICE_ACCOUNT · 가림 서버 FCM_SERVICE_ACCOUNT  (둘 중 있는 것)
//   ⚠ Verify JWT 는 켜 둔 채로 두세요(관리자만 부를 수 있게).
//   ⚠ 이 함수가 없거나 실패해도 답장은 그대로 저장되고, 고객이 고객센터를 열면 보입니다.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
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
    const auth = req.headers.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'not_logged_in' }, 401);
    const body = await req.json().catch(() => ({}));
    const ticket = String(body.ticket || '');
    if (!/^[0-9a-f-]{36}$/i.test(ticket)) return json({ error: 'bad_request' }, 400);
    const preview = String(body.preview || '').replace(/\s+/g, ' ').slice(0, 90);
    const app = String(body.app || '');

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: auth } } });
    const tk = await sb.rpc('admin_support_push_targets', { p_ticket: ticket });
    if (tk.error) return json({ error: /not_admin/.test(tk.error.message || '') ? 'not_admin' : 'targets', detail: tk.error.message }, 403);
    const rows = (tk.data || []).filter((r: any) => r.push_token);
    if (!rows.length) return json({ ok: true, sent: 0, note: 'no_devices' });

    const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT(또는 FCM_SERVICE_ACCOUNT) 가 없습니다');
    const sa = JSON.parse(raw);
    const accessToken = await getGoogleToken(sa);

    let sent = 0;
    for (const r of rows) {
      const en = r.lang === 'en';
      const title = en ? '💬 Support replied' : '💬 고객센터 답변이 왔습니다';
      const text = preview || (en ? 'Tap to read the reply.' : '눌러서 답변을 확인하세요.');
      const data: Record<string, string> = { kind: 'support', ticket, app, url: 'support.html?t=' + ticket + (app === 'nureum' ? '&app=nureum' : ''), title, body: text };
      const o = await sendOne(sa.project_id, accessToken, r.push_token, {
        notification: { title, body: text },
        data,
        android: { priority: 'HIGH', notification: { channel_id: r.channel || 'messages', sound: 'default', tag: 'support-' + ticket } },
        apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { sound: 'default', 'thread-id': 'support' } } },
      });
      if (o.ok) sent++;
    }
    console.log('[support] 답장 알림 ' + sent + '/' + rows.length);
    return json({ ok: true, sent, tried: rows.length });
  } catch (err) {
    console.error('[support-notify] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
