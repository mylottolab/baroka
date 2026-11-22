// =====================================================
// Aliascall — send-wakeup-push Edge Function
// 2026-08-19 신설. (🔴 2026-11-22 문자 연결 요청 → case-quick-reply 로 [답장] 알림) 발견자가 통화/문자 연결을 시도했는데 소유자가 응답하지 않으면
// aliascall_connect.html이 이 함수를 호출함. 소유자에게 "긴급 알림"을 보냄.
//
// ⚠ 발견자는 비로그인 상태이므로 Supabase 대시보드에서 "Enforce JWT Verification"을 꺼야 함.
// ⚠ 2026-08-23 안드로이드 앱(FCM) · 웹푸시 두 경로를 나란히 처리.
// ⚠ 2026-08-25 다국어.
//
// 🔴🔴 2026-10-01 (앱 버전 7) — 잠금화면 전화
//   ring: true    발견자가 음성 · 영상으로 걸자마자 부릅니다(15초 기다리지 않음).
//                 앱에는 notification 없는 "전화 신호"(kind: call)를 보내 CallMessagingService 가
//                 잠금화면 전체 화면 · 벨소리 · [받기] 를 띄웁니다. 브라우저 웹푸시도 함께.
//   cancel: true  발견자가 끊었거나 · 주인이 받았거나 · 거절했을 때 — "끝난 전화" 신호(kind: missed)로
//                 주인의 모든 폰에서 벨을 즉시 멈춥니다.
//   🔴 누구나 부를 수 있는 함수라, 실제로 막 시작된(2분 안) 그 등록물의 통화가 있을 때만 울립니다.
//      (세션 번호를 모르면 남의 폰을 울릴 수 없습니다)
// =====================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:djlee0827@gmail.com';
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── 앱(FCM) — aliascall-fcm-send 에 넘김. 실패해도 웹푸시 흐름을 막지 않음 ──
async function sendToApp(userId: string, payload: Record<string, unknown>): Promise<number> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/aliascall-fcm-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ user_id: userId, ...payload }),
    });
    if (!res.ok) { console.error('[send-wakeup-push] FCM 발송 실패:', res.status, await res.text()); return 0; }
    const j = await res.json();
    return j.sent ?? 0;
  } catch (e) {
    console.error('[send-wakeup-push] FCM 호출 오류(무시하고 진행):', e);
    return 0;
  }
}

/* 🔴 2026-11-22 — 문자(찾기 QR 채팅) 연결 요청은 case-quick-reply 가 보냅니다.
   새 앱은 위에 뜨는 알림 + [읽음] [답장], 아이폰은 길게 눌러 답장, 옛 앱은 예전 알림 그대로.
   case-quick-reply 가 없거나 실패하면 예전처럼 aliascall-fcm-send 로 보냅니다. */
async function sendCaseQr(userId: string, p: Record<string, string>): Promise<number> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/case-quick-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ notify: true, user_id: userId, ...p }),
    });
    if (res.ok) { const j = await res.json(); return j.sent ?? 0; }
    console.error('[send-wakeup-push] case-quick-reply 실패 → 예전 방식:', res.status);
  } catch (e) { console.error('[send-wakeup-push] case-quick-reply 오류 → 예전 방식:', e); }
  return await sendToApp(userId, {
    title: p.title, body: p.body, title_en: p.title_en, body_en: p.body_en,
    data: { case_id: p.case_id, url: p.url, registration_id: p.registration_id },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const { registrationId, mode, registrationTitle, caseId, ring, cancel, ended, sessionToken, callerName } = await req.json();
    /* 🔴 2026-10-04 — 발견자가 적은 호칭(선택). 20자 · 글자 · 숫자 · 공백 · 몇 가지 기호만 남깁니다 */
    const caller = String(callerName || '').replace(/[^\p{L}\p{N} ._\-·()]/gu, '').trim().slice(0, 20);
    if (!registrationId) return json({ error: 'registrationId가 필요합니다.' }, 400);

    const { data: reg, error: regErr } = await supabase
      .from('registrations').select('user_id').eq('id', registrationId).maybeSingle();
    if (regErr || !reg) return json({ error: '등록 정보를 찾을 수 없습니다.' }, 404);

    /* ── 🔴 전화 신호 · 벨 멈춤 — 실제로 있는 그 등록물의 통화일 때만 ── */
    if ((ring || cancel) && sessionToken) {
      /* ⚠ 칸 이름이 판마다 다를 수 있어 전부(*) 읽습니다 — 없는 칸을 콕 집어 읽으면 통째로 실패합니다 */
      const { data: s, error: sErr } = await supabase.from('webrtc_sessions')
        .select('*').eq('session_token', String(sessionToken)).maybeSingle();
      if (sErr) console.error('[send-wakeup-push] 통화 조회 실패:', sErr.message);
      if (!s || s.registration_id !== registrationId) {
        console.warn('[send-wakeup-push] 통화를 찾지 못했습니다:', String(sessionToken).slice(0, 8), !!s);
        return json({ error: '통화를 찾을 수 없습니다.' }, 404);
      }

      if (cancel) {
        /* 🔴 2026-10-09 — 발견자가 받기 전에 끊었으면(ended) 서버가 "끝남" 을 적습니다.
           발견자는 로그인이 없어 화면에서 직접 적는 것이 막힐 수 있습니다.
           주인 화면이 3초마다 이것을 보고 "연결 요청이 왔어요" 표시와 작은 벨을 내립니다.
           ⚠ 주인이 받았을 때(cancel 만)는 적지 않습니다 — 통화가 이어지는 중이니까요. */
        if (ended && !s.ended_at && !s.owner_joined_at) {
          const { error: ue } = await supabase.from('webrtc_sessions')
            .update({ ended_at: new Date().toISOString(), ended_reason: 'finder_left' })   // DB 낱말: answered_and_ended · timeout_no_answer · declined · finder_left
            .eq('session_token', String(sessionToken)).is('ended_at', null);
          if (ue) console.warn('[send-wakeup-push] 끝남 적기 실패:', ue.message);
        }
        const n = await sendToApp(reg.user_id, { data_only: true, data: { kind: 'missed', call_id: String(sessionToken) } });
        return json({ ok: true, cancelled: n });
      }
      /* 막 시작된(2분 안) 끝나지 않은 음성 · 영상 통화만 울립니다 */
      /* 막 시작된 통화인가 — created_at 이나 owner_notified_at 중 있는 것으로 봅니다(둘 다 없으면 통과) */
      const t0 = s.created_at || s.owner_notified_at || null;
      const fresh = !t0 || (Date.now() - Date.parse(t0)) < 120000;
      const type = s.call_type || mode;
      if (!fresh || s.ended_at || (type !== 'voice' && type !== 'video')) {
        console.log('[send-wakeup-push] 울리지 않음:', { fresh, ended: !!s.ended_at, type });
        return json({ ok: true, rang: 0, reason: 'not_ringing' });
      }
      console.log('[send-wakeup-push] 📞 전화 신호를 보냅니다:', String(sessionToken).slice(0, 8), type);
    }

    const modeLabel = mode === 'video' ? '영상통화' : mode === 'voice' ? '음성통화' : '문자';
    const modeLabelEn = mode === 'video' ? 'a video call' : mode === 'voice' ? 'a voice call' : 'a text message';
    const regName = registrationTitle || '등록물';
    const regNameEn = registrationTitle || 'your registered item';

    const title = ring ? ('📞 ' + regName + ' — ' + modeLabel) : '누군가 연결을 기다리고 있어요';
    const body = ring ? '발견한 분이 지금 전화를 걸고 있어요. 눌러서 받으세요.'
                      : regName + ' — ' + modeLabel + ' 요청이 와있어요. 지금 확인해주세요.';
    const titleEn = ring ? ('📞 ' + regNameEn + ' — ' + modeLabelEn) : 'Someone is waiting to reach you';
    const bodyEn = ring ? 'Someone who found it is calling you now. Tap to answer.'
                        : regNameEn + ' — there is a request for ' + modeLabelEn + '. Please check now.';

    const targetUrl = (sessionToken && (mode === 'voice' || mode === 'video'))
      ? ('/aliascall_incoming_calls.html?autoaccept=' + encodeURIComponent(String(sessionToken)))
      : (caseId ? ('/aliascall_incoming_calls.html?case=' + caseId) : '/aliascall_incoming_calls.html');

    /* ① 앱 — 전화면 data 전용 신호(잠금화면 전체 화면), 아니면 예전처럼 알림 한 줄
       🔴 2026-10-04 — 통화의 "15초 뒤 안전장치" 는 앱에 보내지 않습니다.
         안드로이드는 소리를 한 번에 하나만 내서, 이 알림의 "띵동" 이 울리는 순간
         계속 울리던 전화벨(FLAG_INSISTENT)을 끊어 버렸습니다(약 17초에서 멎음).
         전화 신호는 이미 곧바로(ring) 갔으므로 앱에는 다시 보낼 필요가 없습니다.
         브라우저(웹푸시)로 받는 분께는 그대로 보냅니다. */
    const callFallback = !ring && !!sessionToken && (mode === 'voice' || mode === 'video');
    const appSent = callFallback ? 0 : (ring && sessionToken)
      ? await sendToApp(reg.user_id, {
          data_only: true,
          data: {
            kind: 'call', call_id: String(sessionToken), call_type: mode === 'video' ? 'video' : 'voice',
            who: '📞 ' + (caller ? caller + ' · ' : '') + regName,
            who_en: '📞 ' + (caller ? caller + ' · ' : '') + regNameEn,
            ...(caseId ? { case_id: String(caseId) } : {}),
          },
        })
      : (caseId && !sessionToken)
      ? await sendCaseQr(reg.user_id, {   // 🔴 2026-11-22 문자 연결 요청 — 알림에서 바로 [답장]
          case_id: String(caseId), registration_id: String(registrationId), url: targetUrl,
          title, body, title_en: titleEn, body_en: bodyEn,
        })
      : await sendToApp(reg.user_id, {
          title, body, title_en: titleEn, body_en: bodyEn,
          data: { ...(caseId ? { case_id: String(caseId) } : {}), url: targetUrl, registration_id: String(registrationId) },
        });

    /* ② 브라우저(웹푸시) — 예전과 같음 */
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions').select('id, endpoint, p256dh, auth_key, lang').eq('user_id', reg.user_id);
    if (subsErr) {
      console.error('[send-wakeup-push] 구독 조회 실패:', subsErr.message);
      return json({ ok: true, sent: 0, appSent, warn: '웹푸시 구독 조회 실패' });
    }
    if (!subs || subs.length === 0) return json({ ok: true, sent: 0, appSent, reason: 'no_web_subscriptions' });

    let sentCount = 0;
    const staleEndpoints: string[] = [];
    await Promise.all(subs.map(async (sub) => {
      const useEn = sub.lang === 'en';
      const payload = JSON.stringify({
        title: useEn ? titleEn : title, body: useEn ? bodyEn : body, url: targetUrl,
        tag: ring && sessionToken ? 'aliascall-ring-' + sessionToken : 'aliascall-wakeup-' + registrationId,
      });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sentCount++;
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) staleEndpoints.push(sub.endpoint);
        else console.error('[send-wakeup-push] 발송 실패 (endpoint 일부):', sub.endpoint.slice(-20), e);
      }
    }));
    if (staleEndpoints.length > 0) await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);

    return json({ ok: true, sent: sentCount, appSent, cleaned: staleEndpoints.length, ring: !!ring });
  } catch (err) {
    console.error('[send-wakeup-push] 오류', err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
