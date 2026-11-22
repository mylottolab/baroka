// =====================================================================
// 📞 가림콜 — hotline-notify Edge Function (가림 서버 · 2026-11-22)
//   회선(핫라인) 대화 — 개인 회선 · 전문관리(상담) 회선 모두
//
//   ① 새 메시지 알림   POST { messageId }
//      방 화면이 글 · 사진을 보낸 직후 부릅니다. 받을 폰 목록은 DB(hotline_notify_targets)가 정하고,
//      한 메시지에 한 번만 돌려주므로(3분 안 · 두 번째부터 빈 목록) 아무나 여러 번 불러도 알림이 더 가지 않습니다.
//      받는 사람: 개설자(push_tokens) + 승인된 참가자(hotline_member_push) — 보낸 사람 빼고.
//
//   ② 알림에서 바로 답장 POST { t, action: 'reply' | 'read', text }
//      알림에 실린 1회용 열쇠(회선 · 받는 사람 · 7일)의 서명을 확인한 뒤 저장 → 방에 방송 → 다른 사람들에게 알림.
//
//   ⚠ Verify JWT 를 **끕니다**(참가자는 로그인이 없고, 알림 답장은 로그인 토큰 없이 부름).
//   ⚠ 새 비밀값 없음 — FCM_SERVICE_ACCOUNT(이미 있음) · 서명 열쇠는 서버 비밀값(SUPABASE_SERVICE_ROLE_KEY).
//   ⚠ 보안(암호) 회선은 내용을 서버가 읽을 수 없으므로 「🔒 새 메시지」만, 답장 칸 없음.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const QR_URL = SUPABASE_URL + '/functions/v1/hotline-notify';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── 구글 출입증 (dangol-notify 와 같음) ───────────────────────────── */
let cachedToken: string | null = null;
let cachedUntil = 0;
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
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
  if (!out.access_token) { console.error('[hl-push] 🔴 구글 출입증 실패:', JSON.stringify(out)); throw new Error('google_token'); }
  cachedToken = out.access_token; cachedUntil = now + 3300;
  return cachedToken!;
}

/* ── 1회용 답장 열쇠 ─────────────────────────────────────────────── */
async function hmac(text: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text))));
}
async function qrToken(hotline: string, who: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(hotline + '|' + who + '|' + String(Math.floor(Date.now() / 1000) + 7 * 86400)));
  return body + '.' + await hmac('hlqr1|' + body);
}
function b64urlDec(x: string) { x = x.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return new TextDecoder().decode(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))); }
function same(a: string, b: string) { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return d === 0; }

/* ── 방 화면에 바로 보이게(방송) ─────────────────────────────────── */
async function broadcast(topic: string, event: string, payload: unknown) {
  try {
    const r = await fetch(SUPABASE_URL + '/realtime/v1/api/broadcast', {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
    if (!r.ok) console.error('[hl-push] 방송 실패 ' + r.status);
  } catch (e) { console.error('[hl-push] 방송 실패', String(e)); }
}

/* ── 알림 문구 ───────────────────────────────────────────────────── */
function preview(r: any, en: boolean): string {
  const ty = String(r.message_type || 'text');
  if (String(r.tier || '').endsWith('_secure')) return en ? '🔒 New message' : '🔒 새 메시지';
  if (ty === 'photo') return en ? '📷 Photo' : '📷 사진';
  if (ty === 'video') return en ? '🎬 Video' : '🎬 동영상';
  if (ty === 'voice') return en ? '🎤 Voice message' : '🎤 음성 메시지';
  if (ty === 'document') return en ? '📎 File' : '📎 파일';
  return String(r.content || '').replace(/\s+/g, ' ').slice(0, 120) || (en ? 'New message' : '새 메시지');
}

async function sendOne(sa: any, at: string, token: string, message: any): Promise<{ ok: boolean; dead: boolean }> {
  const res = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: Object.assign({ token }, message) }),
  });
  const head = String(token).slice(0, 12) + '…';
  if (res.ok) { console.log('[hl-push] ✓ 보냈습니다 (' + head + ')'); return { ok: true, dead: false }; }
  const text = await res.text();
  console.error('[hl-push] 🔴 거절 (' + head + ') ' + res.status + ' — ' + text.slice(0, 200));
  return { ok: false, dead: res.status === 404 || (res.status === 400 && text.includes('INVALID_ARGUMENT')) };
}

/* 한 메시지 → 받을 폰들에 알림 */
async function notifyMessage(admin: any, messageId: string): Promise<number> {
  const tg = await admin.rpc('hotline_notify_targets', { p_message: messageId });
  if (tg.error) { console.error('[hl-push] 🔴 대상 조회', JSON.stringify(tg.error)); return 0; }
  const rows = ((tg.data || []) as any[]).filter((x) => x.push_token);
  if (!rows.length) return 0;
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT') || Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) { console.error('[hl-push] 🔴 FCM_SERVICE_ACCOUNT 가 없습니다'); return 0; }
  const sa = JSON.parse(raw);
  const at = await getGoogleToken(sa);
  let sent = 0;
  const deadOwner: string[] = [], deadMember: string[] = [];
  for (const r of rows) {
    const en = String(r.lang || '').indexOf('en') === 0;
    const hl = String(r.hotline_id);
    const isOwner = String(r.who).indexOf('owner-') === 0;
    const secure = String(r.tier || '').endsWith('_secure');
    const room = String(r.title || (en ? 'Line' : '회선')).slice(0, 30);
    const title = '💬 ' + room;
    const body = (String(r.sender_nickname || '') ? String(r.sender_nickname) + ': ' : '') + preview(r, en);
    // 개설자는 ?hotline= · 참가자는 초대 열쇠 ?t= 로 엽니다(방 화면이 그렇게 들어오게 되어 있음)
    const url = isOwner || !r.invite_token ? 'aliascall_hotline_room.html?hotline=' + hl
                                           : 'aliascall_hotline_room.html?t=' + encodeURIComponent(String(r.invite_token));
    const key = 'hl-' + hl;
    const base: any = {
      notification: { title, body },
      data: { kind: 'hotline', hotline: hl, url, title, body },
      android: { priority: 'HIGH', notification: { channel_id: 'aliascall_urgent', sound: 'default', tag: key } },
      apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { alert: { title, body }, sound: 'default', 'thread-id': key } } },
    };
    let msg = base;
    if (!secure) {
      const qr = await qrToken(hl, String(r.who));
      if (String(r.caps || '').indexOf('qr1') >= 0) {
        // 새 안드로이드 앱 — data 만. 앱이 위에 뜨는 알림 + [읽음] [답장] 을 만듭니다.
        msg = { data: { kind: 'message', link_id: key, url, title, body, qr, qr_url: QR_URL }, android: { priority: 'HIGH' } };
      } else {
        // 아이폰 — 알림을 길게 누르면 [답장] · [읽음] (category QR). 옛 안드로이드는 보통 알림 그대로.
        msg = JSON.parse(JSON.stringify(base));
        msg.data.qr = qr; msg.data.qr_url = QR_URL; msg.apns.payload.aps.category = 'QR';
      }
    }
    const o = await sendOne(sa, at, String(r.push_token), msg);
    if (o.ok) sent++;
    else if (o.dead) (isOwner ? deadOwner : deadMember).push(String(r.push_token));
  }
  if (deadMember.length) await admin.from('hotline_member_push').delete().in('token', deadMember);
  if (deadOwner.length) await admin.from('push_tokens').delete().in('token', deadOwner);
  console.log('[hl-push] 끝: ' + sent + '/' + rows.length + ' (메시지 ' + messageId.slice(0, 8) + ')');
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE);

    /* ② 알림에서 바로 답장 · 읽음 */
    if (b.t) {
      const action = b.action === 'read' ? 'read' : 'reply';
      const [bd, sig] = String(b.t).split('.');
      if (!bd || !sig || !same(await hmac('hlqr1|' + bd), sig)) return json({ error: 'bad_token' }, 403);
      const [hotline, who, exp] = b64urlDec(bd).split('|');
      if (!hotline || !who || !(Number(exp) > Date.now() / 1000)) return json({ error: 'expired' }, 410);

      if (action === 'read') {
        const r = await admin.rpc('hotline_read_as', { p_hotline: hotline, p_sender: who });
        if (r.data && r.data.ok) await broadcast('hotline-' + hotline, 'read-receipt', { anonId: who, readAt: r.data.readAt });
        return json({ ok: true });
      }
      const text = String(b.text || '').trim();
      if (!text) return json({ error: 'empty' }, 400);
      const r = await admin.rpc('hotline_send_as', { p_hotline: hotline, p_sender: who, p_body: text });
      if (r.error || !r.data || !r.data.ok) {
        console.error('[hl-qr] 🔴', JSON.stringify(r.error || r.data));
        return json({ error: (r.data && r.data.error) || 'save_failed' }, 400);
      }
      const m = r.data.message;
      await broadcast('hotline-' + hotline, 'new-message', m);
      // 답장한 사람은 방금 읽은 것이니 읽음도 함께
      const rd = await admin.rpc('hotline_read_as', { p_hotline: hotline, p_sender: who });
      if (rd.data && rd.data.ok) await broadcast('hotline-' + hotline, 'read-receipt', { anonId: who, readAt: rd.data.readAt });
      try { await notifyMessage(admin, String(m.id)); } catch (e) { console.error('[hl-qr] 알림 실패(답장은 저장됨)', String(e)); }
      console.log('[hl-qr] ✓ 답장 회선=' + hotline.slice(0, 8));
      return json({ ok: true });
    }

    /* ① 새 메시지 알림 */
    const messageId = String(b.messageId || '');
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return json({ error: 'bad_request' }, 400);
    const sent = await notifyMessage(admin, messageId);
    return json({ ok: true, sent });
  } catch (err) {
    console.error('[hotline-notify] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
