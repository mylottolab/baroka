// =====================================================================
// 💬 단톡방 — dantok-quick-reply Edge Function (가림 서버 · 2026-11-22)
//   알림에서 바로 [답장] · [읽음]. 휴대폰이 알림에 실려 온 1회용 열쇠(t)와 글을 보냅니다.
//     POST /functions/v1/dantok-quick-reply   { t, action: 'reply' | 'read', text }
//   ⚠ Verify JWT 를 **끕니다**(휴대폰이 로그인 토큰 없이 부름). 대신 열쇠 서명(서버 비밀값)을 확인합니다.
//   답장은 dt_send_as()(25_dantok_quick_reply.sql)로 저장 → 방 화면에 'new' 방송 → 같은 방 사람들에게 알림.
//   비밀값 새로 없음: FCM_SERVICE_ACCOUNT (이미 있음)
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


/* ── 🔴 2026-11-22 알림에서 바로 [답장] · [읽음] ─────────────────────────
   받는 사람마다 1회용 답장 열쇠(사람 · 방 · 7일)를 서명해 알림에 싣습니다(서명 열쇠 = 서버 비밀값, 새 비밀값 없음).
   · 새 안드로이드 앱(dt_push.platform 에 qr1) → data 만 → 앱이 위에 뜨는 알림 + [읽음] [답장]
   · 아이폰 → category 'QR' (새 앱이면 [답장] 칸, 옛 앱은 무시) · 옛 안드로이드 → 예전 그대로
   답장은 dantok-quick-reply 가 받습니다. */
function b64urlS(s: string) { return b64url(new TextEncoder().encode(s)); }
async function qrToken(user: string, room: string): Promise<string> {
  const body = b64urlS(user + '|' + room + '|' + String(Math.floor(Date.now() / 1000) + 7 * 86400));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return body + '.' + b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('dtqr1|' + body))));
}
async function pushInfo(admin: any, tokens: string[]): Promise<Record<string, any>> {
  const m: Record<string, any> = {};
  try { const r = await admin.from('dt_push').select('user_id, token, platform').in('token', tokens); for (const x of r.data || []) m[x.token] = x; } catch (_e) {}
  return m;
}
async function dtPayload(r: any, info: any): Promise<any> {
  const title = '💬 ' + r.room_name;
  const text = (r.nick || '') + ': ' + String(r.preview || '').replace(/\s+/g, ' ');
  const url = 'room.html?r=' + r.room_id;
  const base: any = {
    notification: { title, body: text },
    data: { kind: 'dantok', room: String(r.room_id), url: url, title, body: text },
    android: { priority: 'HIGH', notification: { channel_id: 'dantok_msg', sound: 'default', tag: 'dt-' + r.room_id } },
    apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': 'dt-' + r.room_id },
            payload: { aps: { sound: 'default', 'thread-id': 'dt-' + r.room_id } } },
  };
  if (!info || !info.user_id) return base;
  const qr = await qrToken(String(info.user_id), String(r.room_id));
  const qrUrl = SUPABASE_URL + '/functions/v1/dantok-quick-reply';
  if (String(info.platform || '').indexOf('qr1') >= 0) {
    return { data: { kind: 'message', link_id: String(r.room_id), url: url, title, body: text, qr, qr_url: qrUrl }, android: { priority: 'HIGH' } };
  }
  base.data.qr = qr; base.data.qr_url = qrUrl; base.apns.payload.aps.category = 'QR';
  return base;
}

function b64urlDec(x: string) { x = x.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return atob(x); }
function same(a: string, b: string) { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return d === 0; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const t = String(b.t || ''), action = b.action === 'read' ? 'read' : 'reply';
    const [bd, sig] = t.split('.');
    if (!bd || !sig) return json({ error: 'bad_token' }, 403);
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const want = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('dtqr1|' + bd))));
    if (!same(want, sig)) return json({ error: 'bad_token' }, 403);
    const [user, room, exp] = b64urlDec(bd).split('|');
    if (!user || !room || !(Number(exp) > Date.now() / 1000)) return json({ error: 'expired' }, 410);
    const admin = createClient(SUPABASE_URL, SERVICE);

    if (action === 'read') {
      await admin.rpc('dt_read_as', { p_user: user, p_room: room });
      return json({ ok: true });
    }
    const text = String(b.text || '').trim();
    if (!text) return json({ error: 'empty' }, 400);
    const r = await admin.rpc('dt_send_as', { p_user: user, p_room: room, p_body: text });
    if (r.error || !r.data || !r.data.ok) { console.error('[dt-qr] 🔴', JSON.stringify(r.error || r.data)); return json({ error: (r.data && r.data.error) || 'save_failed' }, 400); }
    const msg = r.data.id;

    // 방 화면을 보고 있는 사람에게 바로 보이게 — 화면이 쓰는 것과 같은 방송(dt-<방> · new)
    try {
      await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', { method: 'POST',
        headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: 'dt-' + room, event: 'new', payload: {} }] }) });
    } catch (_e) {}

    // 같은 방 사람들에게 알림(dantok-notify 와 같은 방식)
    try {
      const tg = await admin.rpc('dt_notify_targets', { p_msg: msg, p_user: user });
      const rows = ((tg.data || []) as any[]).filter((x) => x.token);
      const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (rows.length && raw) {
        const sa = JSON.parse(raw);
        const at = await getGoogleToken(sa);
        const INFO = await pushInfo(admin, rows.map((x) => x.token));
        for (let i = 0; i < rows.length; i += 20) {
          await Promise.all(rows.slice(i, i + 20).map(async (x) => sendOne(sa.project_id, at, x.token, await dtPayload(x, INFO[x.token]))));
        }
      }
    } catch (e) { console.error('[dt-qr] 알림 실패(글은 저장됨)', String(e)); }
    console.log('[dt-qr] ✓ 답장 room=' + room.slice(0, 8));
    return json({ ok: true, id: msg });
  } catch (err) {
    console.error('[dantok-quick-reply] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
