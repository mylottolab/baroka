// =====================================================================
// 🔎 가림콜 — case-quick-reply Edge Function (가림 서버 · 2026-11-22)
//   찾기 QR(발견자 문자) — 주인 폰 「누군가 연결을 기다리고 있어요」 알림에서 바로 [답장] · [읽음]
//
//   ① 알림 보내기 (aliascall-send-wakeup-push 만 부름 · service_role 열쇠 확인)
//      POST { notify: true, user_id, case_id, registration_id, url, title, body, title_en, body_en }
//      주인 앱 폰마다: 새 안드로이드 앱(caps qr1) → 위에 뜨는 알림 + [읽음] [답장]
//                      아이폰 → category QR(길게 누르면 답장) · 옛 안드로이드 → 예전 알림 그대로
//      발견자가 남긴 마지막 문자가 있으면 알림 내용에 보여 줍니다(무엇에 답하는지 알 수 있게).
//
//   ② 알림에서 답장 (휴대폰이 부름) POST { t, action: 'reply' | 'read', text }
//      서명 확인 → case-message 의 주인 답장과 같게: 종료 확인 → case_messages(sender 'owner') 저장
//      → 사건 화면에 방송(case-<id> new-message) → 발견자 웹푸시(「소유자가 답장했어요」)
//
//   ⚠ Verify JWT 를 **끕니다**. 새 비밀값 없음(FCM_SERVICE_ACCOUNT · VAPID_* · 서비스 열쇠 — 이미 있음).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const QR_URL = SUPABASE_URL + '/functions/v1/case-quick-reply';
const supabase = createClient(SUPABASE_URL, SERVICE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── 공통 ─────────────────────────────────────────────────────────── */
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDec(x: string) { x = x.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return new TextDecoder().decode(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))); }
function same(a: string, b: string) { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return d === 0; }
async function hmac(text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text))));
}
async function qrToken(owner: string, caseId: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(owner + '|' + caseId + '|' + String(Math.floor(Date.now() / 1000) + 7 * 86400)));
  return body + '.' + await hmac('csqr1|' + body);
}

/* ── 구글 출입증 ─────────────────────────────────────────────────── */
let cachedToken: string | null = null;
let cachedUntil = 0;
async function getGoogleToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedUntil) return cachedToken;
  const enc = new TextEncoder();
  const claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
                  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) + '.' + b64url(enc.encode(JSON.stringify(claim)));
  const body = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', raw.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(new Uint8Array(sig)) }),
  });
  const out = await res.json();
  if (!out.access_token) { console.error('[case-qr] 🔴 구글 출입증 실패:', JSON.stringify(out)); throw new Error('google_token'); }
  cachedToken = out.access_token; cachedUntil = now + 3300;
  return cachedToken!;
}

/* ── ① 주인 폰들에 알림 ─────────────────────────────────────────── */
async function notifyOwner(b: any): Promise<number> {
  const userId = String(b.user_id || ''), caseId = String(b.case_id || '');
  const { data: rows } = await supabase.from('push_tokens').select('token, lang, caps').eq('user_id', userId);
  const list = (rows || []).filter((r: any) => r.token && !/^[0-9a-f]{64,200}$/i.test(String(r.token)));   // 아이폰 전화용 번호 빼기
  if (!list.length) return 0;
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT 가 없습니다');
  const sa = JSON.parse(raw);
  const at = await getGoogleToken(sa);

  // 발견자가 남긴 마지막 문자(무엇에 답하는지 보이게)
  let last = '';
  try {
    const { data: m } = await supabase.from('case_messages').select('message_type, content')
      .eq('case_id', caseId).eq('sender', 'finder').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (m) last = m.message_type === 'photo' ? '📷' : (m.message_type === 'text' ? String(m.content || '').replace(/\s+/g, ' ').slice(0, 100) : '');
  } catch (_e) { /* 없으면 원래 문구 */ }

  const qr = await qrToken(userId, caseId);
  const key = 'case-' + caseId;
  let sent = 0;
  const dead: string[] = [];
  for (const r of list) {
    const en = String(r.lang || '') === 'en';
    const title = String((en ? b.title_en : b.title) || b.title || '');
    const body = last ? ((en ? 'Finder: ' : '발견자: ') + last) : String((en ? b.body_en : b.body) || b.body || '');
    const data: Record<string, string> = { case_id: caseId, url: String(b.url || ''), registration_id: String(b.registration_id || '') };
    let message: any;
    if (String(r.caps || '').indexOf('qr1') >= 0) {
      message = { data: { kind: 'message', link_id: key, url: data.url.replace(/^\/+/, ''), title, body, qr, qr_url: QR_URL }, android: { priority: 'HIGH' } };
    } else {
      message = {
        notification: { title, body },
        data: { ...data, qr, qr_url: QR_URL },
        android: { priority: 'HIGH', notification: { channel_id: 'aliascall_urgent', default_sound: true, default_vibrate_timings: true } },
        apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { alert: { title, body }, sound: 'default', category: 'QR', 'thread-id': key } } },
      };
    }
    const res = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
      method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: Object.assign({ token: r.token }, message) }),
    });
    const head = String(r.token).slice(0, 12) + '…';
    if (res.ok) { sent++; console.log('[case-qr] ✓ 보냈습니다 (' + head + ')'); }
    else {
      const t = await res.text();
      console.error('[case-qr] 🔴 거절 (' + head + ') ' + res.status + ' — ' + t.slice(0, 200));
      if (res.status === 404 || (res.status === 400 && t.includes('INVALID_ARGUMENT'))) dead.push(String(r.token));
    }
  }
  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);
  return sent;
}

/* ── 발견자 웹푸시 (case-message 의 notifyFinder 와 같음) ───────────── */
async function notifyFinder(caseId: string, previewText: string) {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return;
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:djlee0827@gmail.com', pub, priv);
  const { data: subs } = await supabase.from('finder_push_subscriptions').select('endpoint, p256dh, auth_key').eq('case_id', caseId);
  if (!subs || subs.length === 0) return;
  const payload = JSON.stringify({
    title: '소유자가 답장했어요. 채팅을 원하시면 여기를 클릭해 주세요',
    body: previewText.length > 60 ? previewText.slice(0, 60) + '…' : previewText,
    url: '/aliascall_connect.html?case=' + caseId,
    tag: 'aliascall-case-' + caseId,
  });
  const stale: string[] = [];
  await Promise.all(subs.map(async (sub: any) => {
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload); }
    catch (e) { const sc = (e as { statusCode?: number }).statusCode; if (sc === 410 || sc === 404) stale.push(sub.endpoint); }
  }));
  if (stale.length > 0) await supabase.from('finder_push_subscriptions').delete().in('endpoint', stale);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const b = await req.json().catch(() => ({}));

    /* ① 알림 보내기 — 서버 안에서만(서비스 열쇠) */
    if (b.notify) {
      const auth = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
      if (!same(auth, SERVICE)) return json({ error: 'forbidden' }, 403);
      if (!b.user_id || !/^[0-9a-f-]{36}$/i.test(String(b.case_id || ''))) return json({ error: 'bad_request' }, 400);
      const sent = await notifyOwner(b);
      return json({ ok: true, sent });
    }

    /* ② 알림에서 답장 · 읽음 */
    const action = b.action === 'read' ? 'read' : 'reply';
    const [bd, sig] = String(b.t || '').split('.');
    if (!bd || !sig || !same(await hmac('csqr1|' + bd), sig)) return json({ error: 'bad_token' }, 403);
    const [owner, caseId, exp] = b64urlDec(bd).split('|');
    if (!owner || !caseId || !(Number(exp) > Date.now() / 1000)) return json({ error: 'expired' }, 410);
    if (action === 'read') return json({ ok: true });   // 알림만 닫습니다(사건 화면을 열면 읽음 처리는 예전대로)

    const text = String(b.text || '').trim().slice(0, 2000);
    if (!text) return json({ error: 'empty' }, 400);

    // 내 등록물의 사건인지 (case-message 와 같은 검사)
    const { data: c } = await supabase.from('cases').select('id, registration_id, registrations!inner(user_id)').eq('id', caseId).maybeSingle();
    if (!c || (c as any).registrations.user_id !== owner) return json({ error: 'not_mine' }, 403);
    const { data: closedNow } = await supabase.rpc('close_case_if_expired', { p_case_id: caseId });
    if (closedNow) return json({ error: 'closed' }, 410);
    const { data: chk } = await supabase.from('cases').select('status').eq('id', caseId).maybeSingle();
    if (chk?.status === 'closed') return json({ error: 'closed' }, 410);

    const { data: msg, error: msgErr } = await supabase.from('case_messages')
      .insert({ case_id: caseId, sender: 'owner', message_type: 'text', content: text }).select('id, created_at').single();
    if (msgErr || !msg) { console.error('[case-qr] 🔴 저장 실패', msgErr?.message); return json({ error: 'save_failed' }, 500); }
    await supabase.from('cases').update({ last_activity_at: new Date().toISOString() }).eq('id', caseId);

    // 사건 화면(주인 · 발견자)에 바로 보이게
    try {
      await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', {
        method: 'POST', headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: 'case-' + caseId, event: 'new-message',
          payload: { id: msg.id, sender: 'owner', message_type: 'text', content: text, created_at: msg.created_at } }] }),
      });
    } catch (e) { console.error('[case-qr] 방송 실패', String(e)); }

    try { await notifyFinder(caseId, text); } catch (e) { console.warn('[case-qr] 발견자 알림 실패', String(e)); }
    console.log('[case-qr] ✓ 답장 사건=' + caseId.slice(0, 8));
    return json({ ok: true, messageId: msg.id });
  } catch (err) {
    console.error('[case-quick-reply] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
