// =====================================================================
// 🏪 단골창구 — dangol-quick-reply Edge Function (가림 서버 · 2026-11-22)
//   사장님 휴대폰 「새 문의」 알림에서 바로 [답장] · [읽음].
//     POST /functions/v1/dangol-quick-reply   { t, action: 'reply' | 'read', text }
//   ⚠ Verify JWT 를 **끕니다**(휴대폰이 로그인 토큰 없이 부름). 대신 알림에 실린 열쇠의 서명(서버 비밀값)을 확인합니다.
//   답장은 dg_owner_reply_as()(26_garim_quick_reply.sql)로 저장 → 「답장 알림」을 켠 손님에게 알림(dangol-notify 와 같은 방식).
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
    const want = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('dgqr1|' + bd))));
    if (!same(want, sig)) return json({ error: 'bad_token' }, 403);
    const [owner, thread, exp] = b64urlDec(bd).split('|');
    if (!owner || !thread || !(Number(exp) > Date.now() / 1000)) return json({ error: 'expired' }, 410);
    const admin = createClient(SUPABASE_URL, SERVICE);
    if (action === 'read') { await admin.rpc('dg_owner_seen_as', { p_owner: owner, p_thread: thread }); return json({ ok: true }); }

    const text = String(b.text || '').trim();
    if (!text) return json({ error: 'empty' }, 400);
    const r = await admin.rpc('dg_owner_reply_as', { p_owner: owner, p_thread: thread, p_body: text });
    if (r.error || !r.data || !r.data.ok) { console.error('[dg-qr] 🔴', JSON.stringify(r.error || r.data)); return json({ error: (r.data && r.data.error) || 'save_failed' }, 400); }

    // 「답장 알림」을 켠 손님에게 알림 (dangol-notify 의 reply 와 같음)
    try {
      const tg = await admin.rpc('dg_notify_guest_targets', { p_thread: thread, p_owner: owner });
      const gs = ((tg.data || []) as any[]).filter((x) => x.push_token);
      const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (gs.length && raw) {
        const sa = JSON.parse(raw);
        const at = await getGoogleToken(sa);
        for (const x of gs) {
          const title = '🧑‍🍳 ' + x.desk_name + ' 사장님이 답장했어요';
          const tx = String(x.preview || '').replace(/\s+/g, ' ');
          await sendOne(sa.project_id, at, x.push_token, {
            notification: { title, body: tx },
            data: { kind: 'dangol_reply', thread, url: 'dangol.html?c=' + x.code, title, body: tx },
            android: { priority: 'HIGH', notification: { channel_id: 'aliascall_urgent', sound: 'default', tag: 'dangol-r-' + thread } },
            apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { sound: 'default', 'thread-id': 'dangol-r' } } },
          });
        }
      }
    } catch (e) { console.error('[dg-qr] 손님 알림 실패(답장은 저장됨)', String(e)); }
    console.log('[dg-qr] ✓ 답장 thread=' + thread.slice(0, 8));
    return json({ ok: true });
  } catch (err) {
    console.error('[dangol-quick-reply] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
