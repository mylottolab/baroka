// =====================================================================
// 🏪 단골창구 — dangol-media Edge Function (가림 서버 · 2026-11-17)
//   실용형 · 프리미엄형 가게의 사진 · 짧은 동영상을 올리고 보는 곳입니다(22_dangol_plans.sql).
//   보관함 'dangol_chat' 은 비공개라, 이 함수가 「그 대화의 손님 · 사장님이 맞는지」 확인한 뒤에만
//   올릴 주소(서명된 업로드 주소)와 볼 주소(1시간짜리)를 줍니다.
//
//     POST /functions/v1/dangol-media
//       { act: 'up',   kind: 'photo'|'video', ext: 'jpg'|'mp4'|…, code, token, thread }   ← 손님 (앱키로)
//       { act: 'up',   kind, ext, thread }                                                  ← 사장님 (로그인 토큰으로)
//       { act: 'view', thread, token }   또는 사장님 { act: 'view', thread }
//   손님은 로그인이 없으므로 Verify JWT 를 꺼도 되고 켜도 됩니다(앱키도 JWT 라 통과).
//   비밀값 추가 없음 (SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 는 기본으로 있음)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'dangol_chat';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const EXT: Record<string, string[]> = { photo: ['jpg', 'jpeg', 'png', 'webp'], video: ['mp4', 'mov', 'webm'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE);

    /* 사장님인지(로그인 토큰) — 앱키로 부르면 손님 */
    let owner: string | null = null;
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (jwt && !body.token) {
      const u = await admin.auth.getUser(jwt);
      if (!u.error && u.data?.user) owner = u.data.user.id;
    }
    const token = owner ? null : String(body.token || '');
    if (!owner && (token!.length < 24 || token!.length > 100)) return json({ error: 'token' }, 400);
    const thread = body.thread ? String(body.thread) : null;
    if (thread && !UUID.test(thread)) return json({ error: 'bad_request' }, 400);

    if (body.act === 'up') {
      const kind = String(body.kind || '');
      const ext = String(body.ext || '').toLowerCase().replace('jpeg', 'jpg');
      if (!EXT[kind] || !EXT[kind].includes(ext)) return json({ error: 'bad_kind' }, 400);
      if (owner && !thread) return json({ error: 'bad_request' }, 400);
      const name = (owner ? 'o/' : 'g/') + new Date().toISOString().slice(0, 7) + '/' + crypto.randomUUID() + '.' + ext;
      const t = await admin.rpc('dg_media_ticket', { p_code: owner ? null : String(body.code || ''), p_token: token, p_thread: thread,
                                                   p_owner: owner, p_kind: kind, p_path: name });
      if (t.error) { console.error('[dangol-media] 🔴 ticket', JSON.stringify(t.error)); return json({ error: 'server' }, 500); }
      if (!t.data?.ok) return json({ ok: false, error: t.data?.error || 'denied' });
      const up = await admin.storage.from(BUCKET).createSignedUploadUrl(t.data.path);
      if (up.error) { console.error('[dangol-media] 🔴 upload url', up.error.message); return json({ error: 'server' }, 500); }
      return json({ ok: true, path: t.data.path, token: up.data.token, url: up.data.signedUrl });
    }

    if (body.act === 'view') {
      if (!thread) return json({ error: 'bad_request' }, 400);
      const l = await admin.rpc('dg_media_list', { p_thread: thread, p_token: token, p_owner: owner });
      if (l.error) { console.error('[dangol-media] 🔴 list', JSON.stringify(l.error)); return json({ error: 'server' }, 500); }
      const paths = (l.data || []).map((r: any) => r.path).filter(Boolean);
      if (!paths.length) return json({ ok: true, urls: {} });
      const s = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (s.error) { console.error('[dangol-media] 🔴 sign', s.error.message); return json({ error: 'server' }, 500); }
      const urls: Record<string, string> = {};
      for (const x of s.data || []) if (x.path && x.signedUrl) urls[x.path] = x.signedUrl;
      return json({ ok: true, urls });
    }
    return json({ error: 'bad_act' }, 400);
  } catch (err) {
    console.error('[dangol-media] 🔴', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
