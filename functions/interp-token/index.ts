// =====================================================================
// 위브앱 — interp-token  (2026-11-28 신설 · AI 통역)
//   부름 서버 · 가림콜 서버에 같은 이름 · 같은 코드로 하나씩 둡니다.
//
//   하는 일
//     ① 로그인한 손님인지 확인 → ② 통역 시간이 남았는지 확인하고 통역 한 판(session)을 엽니다(interp_open)
//     ③ 오픈AI 실시간 통역(gpt-realtime-translate)의 "짧은 출입증" 둘을 받아 돌려줍니다
//          out — 내 목소리 → 상대 언어   (상대에게 보냄)
//          in  — 상대 목소리 → 내 언어   (내가 들음)
//   body: { call_ref, my_lang, peer_lang, app, dirs? }  dirs: 'both'(기본) | 'in' | 'out'
//   돌려줌: { ok, session_id, seconds_left, out?: { secret }, in?: { secret } }  /  { ok:false, error }
//
//   ⚠ 진짜 키(OPENAI_API_KEY)는 여기에만 있고 앱으로 나가지 않습니다. 앱은 1분 안에 쓰는 출입증만 받습니다.
//   ⚠ Verify JWT 켜 둡니다(로그인한 손님이 부릅니다).
//   비밀값: OPENAI_API_KEY
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'hi', 'id', 'vi'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function secretFor(lang: string, who: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('no_openai_key');
  const r = await fetch('https://api.openai.com/v1/realtime/translations/client_secrets', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': who },
    body: JSON.stringify({ session: { model: 'gpt-realtime-translate', audio: { output: { language: lang } } } }),
  });
  const j = await r.json().catch(() => ({}));
  const v = j?.value || j?.client_secret?.value;
  if (!r.ok || !v) throw new Error('openai ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !u?.user) return json({ ok: false, error: 'not_logged_in' }, 401);
    const uid = u.user.id;

    const b = await req.json().catch(() => ({}));
    const my = String(b.my_lang || 'ko').slice(0, 2), peer = String(b.peer_lang || 'en').slice(0, 2);
    const dirs = ['in', 'out'].includes(b.dirs) ? b.dirs : 'both';
    if (!LANGS.includes(my) || !LANGS.includes(peer) || my === peer) return json({ ok: false, error: 'bad_lang' });

    const { data: open, error: oe } = await admin.rpc('interp_open', {
      p_user: uid, p_call: String(b.call_ref || '').slice(0, 80), p_langs: my + '>' + peer + ':' + dirs, p_app: String(b.app || '').slice(0, 20),
    });
    if (oe) throw new Error('open ' + oe.message);
    if (!open?.ok) return json(open);

    const who = await sha256('weave:' + uid);
    const out: any = { ok: true, session_id: open.session_id, seconds_left: open.seconds_left };
    try {
      if (dirs !== 'in') out.out = { secret: await secretFor(peer, who), lang: peer };
      if (dirs !== 'out') out.in = { secret: await secretFor(my, who), lang: my };
    } catch (e) {
      await admin.rpc('_interp_charge', { p_session: open.session_id, p_close: true, p_reason: 'token_fail' }).catch(() => {});
      throw e;
    }
    return json(out);
  } catch (e) {
    console.error('[interp-token]', (e as Error).message);
    return json({ ok: false, error: /no_openai_key/.test(String((e as Error).message)) ? 'not_ready' : 'server' }, 500);
  }
});
