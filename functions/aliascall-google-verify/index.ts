// 바로카 앱 결제를 더한 판 (2026-11-03) — 이 줄부터 파일 끝까지 통째로 붙여 넣으세요
// =====================================================================
// Aliascall — aliascall-google-verify
// 2026-09-28 신설 (부름 alias-plan-google-verify 를 옮긴 것)
// 
// 무엇을 하나
// 안드로이드 앱에서 Google Play 로 결제가 끝나면, 앱이 영수증(구매 토큰)을
// 이 함수로 보냅니다. 이 함수가 **구글에 직접 물어보고** 진짜일 때만
// 이용권을 늘리고 회선을 만듭니다.
// 
// 🔴 왜 서버가 물어봐야 하나
// 앱이 "결제했어요" 라는 말을 그대로 믿으면, 가짜 신호로 공짜 이용권을
// 받을 수 있습니다. 앱은 손님 폰에 있어서 뜯어볼 수 있습니다.
// 
// 🔴 무엇을 샀는지 · 몇 개월인지는 **구글이 확인해 준 상품 번호**로만 정합니다.
// 화면이 보내는 것 가운데 믿는 것은 값 차이가 없는 두 가지뿐입니다.
// secure   암호화 회선으로 만들지 (33차 — 값 차이 없음)
// purpose  우리끼리(personal) / 업무용(work)
// 
// 상품 (2026-09-27 확정)
// ac_plan_emergency_12m    긴급 구독 12개월                          2,200원 (2026-09-28 변경)
// ac_plan_emergency_pro_12m Pro 긴급 12개월 (+ 번호판 인식 무제한)   5,500원 (2026-10-09 신설)
// ac_plan_basic_3m/6m/12m  긴급 구독 + 2인 회선 5GB   (실제 4·7·13개월)
// ac_plan_premium_3m/6m/12m 긴급 구독 + 4인 회선 20GB (실제 4·7·13개월)
// 
// 회선 만들기는 aliascall-hotline-paypal-capture-order 와 **똑같이** 합니다.
// hotlines 한 줄 + hotline_members 에 개설자 한 줄
// 초대 토큰 · 인원 수 · 상태는 DB 가 채웁니다(기본값 · 트리거)
// 
// 순서
// ① 로그인한 사람인지
// ② 이미 처리한 영수증인지 (payments.external_payment_id)
// ③ 구글에 묻기 — 취소·환불이면 "영수증만 치우라"(consume: true)
// ④ 결제 기록을 남기고(pending) → 회선 만들기 → 구독 늘리기 → completed
// ⑤ 구글에 "잘 받았다"(acknowledge) — 🔴 빼면 사흘 뒤 자동 환불
// 
// 🔴 2026-09-28 — 기존 회선 연장 (extendHotlineId)
// 회선 관리의 [연장하기] 로 오면, 새 회선을 만들지 않고 그 회선의
// 끝나는 날과 사용량을 늘립니다.
// · 그 회선이 **이 손님 것**이어야 합니다
// · 인원이 같거나(2인 → 일반, 4인 → 프리미엄),
// · 🔴 2026-09-28 — 2인 회선에 프리미엄을 사면 **4인으로 올립니다**
// (등급만 바꿈 — 대화 · 초대 링크 · 열쇠 그대로, 암호화 여부도 그대로)
// · 4인 → 2인 내리기는 하지 않습니다 (이미 들어온 사람을 내보내야 해서)
// · 끝나는 날 = 지금과 원래 끝나는 날 중 늦은 쪽 + 개월수
// · 사용량 한도 = 원래 한도 + 이번 상품의 GB
// ⚠ 연장할 수 없으면(남의 회선 · 인원 다름 · 프로 회선) **새 회선을 만듭니다.**
// 돈은 이미 받았으니 무엇이든 드려야 합니다.
// ⚠ 회선은 payments.hotline_id 로 두 번 만들지 않습니다. 중간에 실패해서
// 앱이 다시 보내와도 같은 방을 돌려줍니다.
// ⚠ Verify JWT 를 **켜 둡니다.** 손님이 로그인한 채로 부릅니다.
// ⚠ 필요한 비밀값 — GOOGLE_PLAY_SERVICE_ACCOUNT
// 부름과 **같은** 서비스 계정 JSON 입니다
// (burum-play-verify@burum-509604.iam.gserviceaccount.com).
// Play Console 권한은 계정 전체라 에일리어스콜에도 그대로 됩니다.
// =====================================================================


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PACKAGE = 'com.weaveapp.aliascall';
/* 🔴 2026-11-03 — 바로카 앱(com.weaveapp.baroka)도 이 함수로 확인합니다. 상품 번호가 baroka_ 로 시작하면 바로카 앱 것 */
const BAROKA_PACKAGE = 'com.weaveapp.baroka';
function pkgOf(productId: string) { return String(productId || '').startsWith('baroka_') ? BAROKA_PACKAGE : PACKAGE; }
/* 🔴 2026-10-11 — 애플 결제를 기록할 때 쓰는 이름(payments.method) */
const APPLE_METHOD = 'app_store';

/* months  = 손님이 실제로 받는 개월수 (덤 포함 4 · 7 · 13) — 끝나는 날 계산에 씁니다
   nominal = 상품 이름의 개월수 (3 · 6 · 12) — hotlines.duration_months 에 적습니다
   🔴 2026-09-28 — hotlines.duration_months 에는 DB 가 정한 숫자만 들어갑니다
     (hotlines_duration_months_check). 4 · 7 · 13 을 넣었다가 회선이 안 만들어졌습니다. */
type Sku = { kind: 'emergency' | 'line' | 'pro' | 'listing' | 'usage' | 'number' | 'baroka'; baroka?: 'reg' | 'change' | 'g20' | 'g60'; months: number; nominal: number; price: number; tier?: string;
             persons?: 2 | 4; capGb?: number; ocrPro?: boolean };

/* 🔴 화면 · Play Console 과 **같아야** 합니다. 지운 번호는 다시 못 씁니다. */
const SKUS: Record<string, Sku> = {
  ac_plan_emergency_12m: { kind: 'emergency', months: 12, nominal: 12, price: 2200 },
  /* 🔴 2026-10-09 — Pro 긴급 = 긴급 12개월 + 번호판 글자 인식 무제한 12개월 */
  ac_plan_emergency_pro_12m: { kind: 'emergency', months: 12, nominal: 12, price: 5500, ocrPro: true },
  ac_plan_basic_3m:    { kind: 'line', months: 4,  nominal: 3,  price: 9900,  persons: 2, capGb: 5 },
  ac_plan_basic_6m:    { kind: 'line', months: 7,  nominal: 6,  price: 17000, persons: 2, capGb: 5 },
  ac_plan_basic_12m:   { kind: 'line', months: 13, nominal: 12, price: 29000, persons: 2, capGb: 5 },
  ac_plan_premium_3m:  { kind: 'line', months: 4,  nominal: 3,  price: 16000, persons: 4, capGb: 20 },
  ac_plan_premium_6m:  { kind: 'line', months: 7,  nominal: 6,  price: 28000, persons: 4, capGb: 20 },
  ac_plan_premium_12m: { kind: 'line', months: 13, nominal: 12, price: 48000, persons: 4, capGb: 20 },
  /* 🔴 2026-10-01 — 프로(업무용) · 게재(광고형). 값과 기간은 웹과 같습니다(덤 없음).
     방 수 · 사용량은 hotline_pricing_plans 에서 읽습니다(웹과 같은 표). */
  ac_pro_starter_1m:     { kind: 'pro', tier: 'pro_starter',    months: 1,  nominal: 1,  price: 9900 },
  ac_pro_starter_6m:     { kind: 'pro', tier: 'pro_starter',    months: 6,  nominal: 6,  price: 53500 },
  ac_pro_starter_12m:    { kind: 'pro', tier: 'pro_starter',    months: 12, nominal: 12, price: 98600 },
  ac_pro_business_1m:    { kind: 'pro', tier: 'pro_business',   months: 1,  nominal: 1,  price: 19900 },
  ac_pro_business_6m:    { kind: 'pro', tier: 'pro_business',   months: 6,  nominal: 6,  price: 107500 },
  ac_pro_business_12m:   { kind: 'pro', tier: 'pro_business',   months: 12, nominal: 12, price: 198200 },
  ac_pro_enterprise_1m:  { kind: 'pro', tier: 'pro_enterprise', months: 1,  nominal: 1,  price: 39900 },
  ac_pro_enterprise_6m:  { kind: 'pro', tier: 'pro_enterprise', months: 6,  nominal: 6,  price: 215500 },
  ac_pro_enterprise_12m: { kind: 'pro', tier: 'pro_enterprise', months: 12, nominal: 12, price: 397400 },
  ac_listing_1m:         { kind: 'listing', months: 1,  nominal: 1,  price: 5500 },
  ac_listing_6m:         { kind: 'listing', months: 6,  nominal: 6,  price: 29700 },
  ac_listing_12m:        { kind: 'listing', months: 12, nominal: 12, price: 54800 },
  /* 🔴 2026-10-01 — 추가 사용량 1GB · 3개월 · 수량은 구글 결제 창에서(최대 10) */
  ac_usage_1gb_3m:       { kind: 'usage', months: 3, nominal: 3, price: 2000 },
  /* 🔴 2026-11-01 — 회선번호(4~8자리). 한 번 사면 끝(소모성). 번호는 화면이 먼저 잡아 둔 것(ac_num_hold)을 붙입니다 */
  ac_num_4_basic: { kind: 'number', months: 0, nominal: 0, price: 110000 },
  ac_num_4_good:  { kind: 'number', months: 0, nominal: 0, price: 220000 },
  ac_num_5_basic: { kind: 'number', months: 0, nominal: 0, price: 55000 },
  ac_num_5_good:  { kind: 'number', months: 0, nominal: 0, price: 110000 },
  ac_num_6_basic: { kind: 'number', months: 0, nominal: 0, price: 33000 },
  ac_num_6_good:  { kind: 'number', months: 0, nominal: 0, price: 66000 },
  ac_num_7_basic: { kind: 'number', months: 0, nominal: 0, price: 11000 },
  ac_num_7_good:  { kind: 'number', months: 0, nominal: 0, price: 22000 },
  ac_num_8_good:  { kind: 'number', months: 0, nominal: 0, price: 11000 },
  ac_num_keep:     { kind: 'number', months: 0, nominal: 0, price: 1100 },    // 1년 더 잡아 두기
  ac_num_transfer: { kind: 'number', months: 0, nominal: 0, price: 5500 },
  /* 🔴 2026-11-03 — 바로카 앱 상품(소모성). 결제 1번 = 권 1장(baroka_credits) */
  baroka_reg:    { kind: 'baroka', baroka: 'reg',    months: 0, nominal: 0, price: 2500 },
  baroka_change: { kind: 'baroka', baroka: 'change', months: 0, nominal: 0, price: 2500 },
  baroka_g20:    { kind: 'baroka', baroka: 'g20',    months: 0, nominal: 0, price: 1100 },
  baroka_g60:    { kind: 'baroka', baroka: 'g60',    months: 0, nominal: 0, price: 2200 },    // 명의 이전 수수료(받는 분)
};

/* 2인은 상대를 바꿀 수 있는 에브리바디, 4인은 프리미엄 4인 (33차 — 교체는 기능으로 포함) */
function tierFor(s: Sku, secure: boolean) {
  const base = s.persons === 4 ? 'premium_4' : 'hotline_everybody';
  return secure ? base + '_secure' : base;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/* ── 구글 출입증 (부름과 같은 방식) ──────────────────────────────── */
let cachedToken: string | null = null;
let cachedUntil = 0;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedUntil) return cachedToken;
  const raw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT');
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT 비밀값이 없습니다');
  const sa = JSON.parse(raw);
  const enc = new TextEncoder();
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  };
  const unsigned = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) + '.' +
                   b64url(enc.encode(JSON.stringify(claim)));
  const body = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = unsigned + '.' + b64url(new Uint8Array(sig));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const out = await res.json();
  if (!out.access_token) throw new Error('구글 출입증 실패: ' + JSON.stringify(out));
  cachedToken = out.access_token; cachedUntil = now + 3300;
  return cachedToken!;
}

/* =====================================================================
   🔴 2026-10-11 아이폰 — 애플 결제 확인
   아이폰 앱은 영수증을 'apple:<거래번호>' 모양으로 보냅니다(안드로이드와 같은 길).
   서버가 **애플에 직접**(App Store Server API) 그 거래를 물어보고 진짜일 때만 드립니다.
     · 앱 번호(bundleId) · 상품 번호(productId)가 맞아야 합니다
     · 산 사람(appAccountToken)이 지금 로그인한 사람과 같아야 합니다(남의 거래번호로 받아가기 방지)
     · 환불된 거래(revocationDate)면 정리만 합니다
   비밀값: APPLE_IAP_KEY_ID · APPLE_IAP_ISSUER_ID · APPLE_IAP_KEY_P8 (App Store Connect → 통합 → 앱 내 구입 키)
   ===================================================================== */
function isApple(purchaseToken: string) { return String(purchaseToken || '').startsWith('apple:'); }

const appleJwtCache: Record<string, string> = {};
const appleJwtAt: Record<string, number> = {};
async function appleJwt(bid: string = PACKAGE): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (appleJwtCache[bid] && now - (appleJwtAt[bid] || 0) < 15 * 60) return appleJwtCache[bid];
  const p8 = Deno.env.get('APPLE_IAP_KEY_P8') || '';
  const kid = (Deno.env.get('APPLE_IAP_KEY_ID') || '').replace(/[^A-Za-z0-9]/g, '');
  const iss = (Deno.env.get('APPLE_IAP_ISSUER_ID') || '').replace(/[^A-Za-z0-9-]/g, '');
  if (!p8 || !kid || !iss) throw new Error('APPLE_IAP_KEY_P8 · APPLE_IAP_KEY_ID · APPLE_IAP_ISSUER_ID 비밀값이 없습니다');
  const b64 = p8.replace(/-----[A-Z ]+-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', raw.buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const unsigned = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: kid, typ: 'JWT' }))) + '.' +
    b64url(enc.encode(JSON.stringify({ iss: iss, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: bid })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  appleJwtCache[bid] = unsigned + '.' + b64url(new Uint8Array(sig));
  appleJwtAt[bid] = now;
  return appleJwtCache[bid];
}

function jwsPayload(jws: string): any {
  const part = String(jws || '').split('.')[1] || '';
  const b = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))));
}

/* askGoogle 과 같은 모양({ res, info, url, token })으로 돌려줍니다 */
async function askApple(productId: string, purchaseToken: string, userId: string) {
  const id = purchaseToken.slice(6).replace(/[^0-9]/g, '');
  const jwt = await appleJwt(pkgOf(productId));
  let res: Response | null = null;
  let env = 'Production';
  // 정식 → 시험(TestFlight · 샌드박스) 순서로 묻습니다
  for (const host of ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com']) {
    res = await fetch(host + '/inApps/v1/transactions/' + id, { headers: { Authorization: 'Bearer ' + jwt } });
    if (res.status !== 404) break;
    env = 'Sandbox';
  }
  const fail = (status: number, msg: string) =>
    ({ res: { ok: false, status } as any, info: { error: msg }, url: '', token: '' });
  if (!res || !res.ok) {
    const t = res ? (await res.text()).slice(0, 300) : '';
    console.error('[ac-apple-verify] 🔴 애플이 답하지 않았습니다', res && res.status, t);
    return fail(res ? res.status : 500, '애플 확인 실패 ' + (res ? res.status : '') + ' ' + t);
  }
  const body = await res.json();
  const tx = jwsPayload(body.signedTransactionInfo);
  if (tx.bundleId !== pkgOf(productId)) return fail(400, '다른 앱의 결제입니다');
  /* 🔴 2026-11-02 — 애플 상품 번호 끝의 _nr · _nr2 … 는 앱이 떼고 보냅니다. 여기서도 떼고 견줍니다 */
  if (String(tx.productId || '').replace(/_nr[0-9]*$/, '') !== productId) return fail(400, '상품 번호가 다릅니다');
  if (!tx.appAccountToken || String(tx.appAccountToken).toLowerCase() !== String(userId).toLowerCase()) {
    return fail(403, '다른 계정으로 산 결제입니다');
  }
  console.log('[ac-apple-verify] 애플 확인(' + env + '):', tx.productId, tx.transactionId);
  return {
    res: { ok: true, status: 200 } as any,
    info: { purchaseState: tx.revocationDate ? 1 : 0, quantity: tx.quantity || 1, acknowledgementState: 1, apple: tx },
    url: '', token: '',
  };
}

function reply(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function bad(msg: string, status = 400) {
  console.error('[ac-google-verify]', msg);
  return reply({ ok: false, error: msg }, status);
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base); d.setMonth(d.getMonth() + months); return d;
}

function personsOfTier(t: string): number {
  if (/^(hotline_1to1|hotline_everybody)/.test(t)) return 2;
  if (/^(economy_4|premium_4)/.test(t)) return 4;
  return 0;   // 프로 등
}

/* ── 🔴 기존 회선 연장 — 되면 그 회선을, 안 되면 null 을 돌려줍니다 ── */
async function extendHotline(pay: any, hotlineId: string, sku: Sku) {
  const { data: h } = await supabase.from('hotlines').select('*').eq('id', hotlineId).maybeSingle();
  if (!h) return null;
  if (h.owner_user_id !== pay.user_id) { console.warn('[ac-google-verify] 남의 회선 연장 시도', hotlineId); return null; }
  if (h.subscription_id) return null;                               // 프로 구독에 딸린 방
  const had = personsOfTier(h.tier);
  const upgrade = had === 2 && sku.persons === 4;
  if (had !== sku.persons && !upgrade) return null;                 // 내리기 · 모르는 등급

  const now = new Date();
  const base = h.expires_at && new Date(h.expires_at) > now ? new Date(h.expires_at) : now;
  const patch: any = {
    expires_at: addMonths(base, sku.months).toISOString(),
    usage_cap_gb: Number(h.usage_cap_gb || 0) + Number(sku.capGb || 0),
    status: 'active',
    archived_at: null,
  };
  if (upgrade) {
    /* 암호화 여부는 그대로 두고 4인 등급으로 — 트리거가 인원을 다시 셀 수 있게 인원도 함께 */
    patch.tier = /_secure$/.test(h.tier) ? 'premium_4_secure' : 'premium_4';
    patch.max_participants = 4;
  }
  const { data: up, error } = await supabase.from('hotlines').update(patch)
    .eq('id', h.id).select('*').single();
  if (error) throw new Error('회선을 연장하지 못했습니다: ' + error.message);

  /* 되돌릴 때 쓰려고 "연장" 인지 "4인 올리기" 인지, 올리기 전 등급을 적어 둡니다 */
  await supabase.from('payments').update({
    hotline_id: h.id, google_action: upgrade ? 'upgrade' : 'extend', hotline_prev_tier: upgrade ? h.tier : null,
  }).eq('id', pay.id);
  if (upgrade) console.log('[ac-google-verify] 2인 → 4인으로 올렸습니다:', h.id);
  return { ...up, _upgraded: upgrade };
}

/* ── 회선 만들기 — aliascall-hotline-paypal-capture-order 와 같은 방식 (멱등) ── */
/* 🔴 2026-10-01 — 프로 구독 만들기 또는 연장 (웹 aliascall-hotline-paypal-capture-order 와 같은 규칙)
   ⚠ 같은 등급의 살아 있는 구독이 있으면 새로 만들지 않고 연장합니다.
     새로 만들면 이미 만들어 둔 방 수십 개가 옛 구독에 묶인 채 고아가 됩니다. */
async function createOrExtendPro(pay: any, sku: Sku) {
  if (pay.hotline_subscription_id) {
    const { data: ex } = await supabase.from('hotline_subscriptions').select('*').eq('id', pay.hotline_subscription_id).maybeSingle();
    if (ex) return ex;
  }
  const { data: plan } = await supabase.from('hotline_pricing_plans').select('usage_cap_gb, max_rooms')
    .eq('tier', sku.tier).eq('duration_months', sku.months).maybeSingle();
  const cap = plan?.usage_cap_gb ?? null, rooms = plan?.max_rooms ?? 50;
  const { data: cur } = await supabase.from('hotline_subscriptions').select('*')
    .eq('owner_user_id', pay.user_id).eq('tier', sku.tier).eq('status', 'active')
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  let sub: any = null, action = 'pro_new';
  if (cur) {
    const base = new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
    const { data, error } = await supabase.from('hotline_subscriptions').update({
      expires_at: addMonths(base, sku.months).toISOString(), status: 'active',
      usage_cap_gb: cap ?? cur.usage_cap_gb, max_rooms: rooms ?? cur.max_rooms,
      price_paid_krw: sku.price, duration_months: sku.months,
    }).eq('id', cur.id).select('*').single();
    if (error) { console.error('[ac-google-verify] 프로 연장 실패:', JSON.stringify(error)); return null; }
    sub = data; action = 'pro_extend';
  } else {
    const now = new Date();
    const { data, error } = await supabase.from('hotline_subscriptions').insert({
      owner_user_id: pay.user_id, tier: sku.tier, duration_months: sku.months, price_paid_krw: sku.price,
      max_rooms: rooms, usage_cap_gb: cap, started_at: now.toISOString(), expires_at: addMonths(now, sku.months).toISOString(),
    }).select('*').single();
    if (error) { console.error('[ac-google-verify] 프로 생성 실패:', JSON.stringify(error)); return null; }
    sub = data;
  }
  await supabase.from('payments').update({ hotline_subscription_id: sub.id, google_action: action }).eq('id', pay.id);
  return sub;
}

/* 🔴 2026-10-01 — 공개 업체 목록 게재(광고형 덧상품)
   게재는 따로 끝나는 날이 없고 프로 구독이 끝날 때까지입니다(웹과 같음).
   ⚠ 공개는 여기서 켜지 않습니다 — 확인(can_go_public)을 통과해야 켜집니다.
   살아 있는 프로가 없으면 null — 결제를 받지 않고 구글이 자동 환불하게 둡니다. */
async function enableListing(pay: any, sku: Sku) {
  if (pay.hotline_subscription_id) {
    const { data: ex } = await supabase.from('hotline_subscriptions').select('*').eq('id', pay.hotline_subscription_id).maybeSingle();
    if (ex) return ex;
  }
  const { data: sub } = await supabase.from('hotline_subscriptions').select('*')
    .eq('owner_user_id', pay.user_id).eq('status', 'active').gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return null;
  /* 🔴 2026-10-01 고침 — 공개는 켜지 않고 게재료만 적습니다.
     공개는 사업자등록증 · 자격증 확인과 관리자 최종 확인을 통과한 뒤, 손님이 업체 공개 등록
     화면에서 [공개 켜기] 를 누를 때 can_go_public 이 모두 확인하고 켭니다. */
  const { data, error } = await supabase.from('hotline_subscriptions').update({
    public_paid_krw: (sub.public_paid_krw || 0) + sku.price,
  }).eq('id', sub.id).select('*').single();
  if (error) { console.error('[ac-google-verify] 게재 켜기 실패:', JSON.stringify(error)); return null; }
  await supabase.from('payments').update({ hotline_subscription_id: sub.id, google_action: 'listing' }).eq('id', pay.id);
  return data;
}

async function createHotline(pay: any, sku: Sku, lineName: string | null) {
  if (pay.hotline_id) {
    const { data: existing } = await supabase.from('hotlines').select('*')
      .eq('id', pay.hotline_id).maybeSingle();
    if (existing) return existing;
  }
  const startedAt = new Date();
  const { data: hotline, error } = await supabase.from('hotlines').insert({
    owner_user_id: pay.user_id,
    tier: pay.hotline_tier,
    /* ⚠ 기간 칸은 상품 이름의 개월수, 끝나는 날은 덤을 더한 개월수.
       결제 기록(pay)이 아니라 상품표(sku)에서 읽습니다 — 옛 기록에 4 · 7 · 13 이
       남아 있어도 다시 보냈을 때 제대로 만들어지게 하려는 것입니다. */
    duration_months: sku.nominal,
    price_paid_krw: pay.hotline_price_krw,
    usage_cap_gb: pay.hotline_usage_cap_gb,
    purpose: pay.hotline_purpose || 'personal',
    /* 🔴 2026-09-28 — 손님이 붙인 이름("아내와", "김 과장"). 값과 무관해 그대로 씁니다. */
    title: lineName || null,
    started_at: startedAt.toISOString(),
    expires_at: addMonths(startedAt, sku.months).toISOString(),
  }).select('*').single();
  if (error) throw new Error('회선을 만들지 못했습니다: ' + error.message);

  await supabase.from('hotline_members').insert({
    hotline_id: hotline.id, member_anon_id: 'owner-' + pay.user_id,
    nickname: '개설자', role: 'owner',
  });
  await supabase.from('payments').update({ hotline_id: hotline.id, google_action: 'new' }).eq('id', pay.id);
  return hotline;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    /* ① 누구인가 */
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return bad('로그인이 필요합니다', 401);
    const { data: u, error: ue } = await supabase.auth.getUser(jwt);
    if (ue || !u?.user) return bad('로그인이 필요합니다', 401);
    const userId = u.user.id;

    const { productId, purchaseToken, orderId, secure, purpose, extendHotlineId, lineName, usageKind, usageTargetId } = await req.json();
    const name = typeof lineName === 'string' ? lineName.trim().slice(0, 30) : '';
    if (!productId || !purchaseToken) return bad('영수증이 없습니다');
    const sku = SKUS[productId];
    if (!sku) return bad('모르는 상품입니다: ' + productId);

    /* ② 이미 처리한 영수증인가 */
    let { data: pay } = await supabase.from('payments').select('*')
      .eq('external_payment_id', purchaseToken).maybeSingle();
    if (pay && pay.user_id !== userId) return bad('다른 계정의 영수증입니다', 403);
    if (pay && pay.status === 'completed') {
      let hotline = null;
      if (pay.hotline_id) {
        const { data: h } = await supabase.from('hotlines').select('id, invite_token')
          .eq('id', pay.hotline_id).maybeSingle();
        hotline = h;
      }
      return reply({ ok: true, already: true, kind: sku.kind,
                     hotlineId: hotline?.id ?? null, inviteToken: hotline?.invite_token ?? null });
    }

    /* ③ 구글에 묻기 — 🔴 2026-10-11 아이폰이면('apple:…') 애플에 묻기 */
    const apple = isApple(purchaseToken);
    let token = '', url = '';
    let res: any, info: any;
    if (apple) {
      ({ res, info } = await askApple(productId, purchaseToken, userId));
    } else {
      token = await googleToken();
      url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
        + pkgOf(productId) + '/purchases/products/' + encodeURIComponent(productId)
        + '/tokens/' + encodeURIComponent(purchaseToken);
      res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      info = await res.json();
    }

    /* 🔴 취소·환불된 영수증 — 아무것도 주지 않고 치우게만 합니다(부름 2026-09-27) */
    if (res.status === 410 || (res.ok && info.purchaseState === 1)) {
      console.log('[ac-google-verify] 취소·환불된 영수증 — 정리만 합니다:', productId);
      /* 🔴 2026-09-28 — 중간에 멈췄던 결제가 그사이 환불된 경우
         회선은 이미 만들어졌는데 구독 늘리기에서 멈췄다가 구글이 자동 환불하면,
         회선만 공짜로 남습니다. 끝나지 않은(pending) 결제에 딸린 회선은 닫고,
         결제 기록은 "환불" 로 적습니다. 완료된 결제는 건드리지 않습니다. */
      if (pay && pay.status !== 'completed') {
        if (pay.hotline_id) {
          const nowIso = new Date().toISOString();
          await supabase.from('hotlines').update({ expires_at: nowIso, archived_at: nowIso })
            .eq('id', pay.hotline_id);
          console.log('[ac-google-verify] 환불된 결제의 회선을 닫았습니다:', pay.hotline_id);
        }
        await supabase.from('payments').update({ status: 'refunded' }).eq('id', pay.id);
      }
      return reply({ ok: false, consume: true, canceled: true, error: '취소되었거나 환불된 결제입니다' });
    }
    if (!res.ok) return bad((apple ? '애플' : '구글') + '이 영수증을 확인해 주지 않았습니다: ' + JSON.stringify(info).slice(0, 300));
    if (info.purchaseState !== 0) return bad('아직 결제가 끝나지 않았습니다 (상태 ' + info.purchaseState + ')');

    /* ④ 결제 기록(pending) → 회선 → 구독 → completed */
    if (!pay) {
      const row: any = {
        user_id: userId, method: apple ? APPLE_METHOD : 'google_play', external_payment_id: purchaseToken,
        amount_minor_units: sku.price, currency_code: 'KRW', status: 'pending',
        purpose: sku.kind === 'emergency' ? 'subscription' : 'hotline',
        /* 🔴 2026-09-29 — 환불되면 되돌릴 수 있게 무엇을 샀는지 적어 둡니다 (revoke_google_payment) */
        google_product_id: productId,
        google_action: sku.kind === 'emergency' ? 'emergency' : (sku.kind === 'baroka' ? 'baroka_' + sku.baroka : null),
      };
      if (sku.kind === 'usage') {
        row.amount_minor_units = sku.price * Math.max(1, Number(info.quantity || 1));
        row.google_action = 'usage';
      }
      if (sku.kind === 'pro') {
        row.hotline_tier = sku.tier;
        row.hotline_duration_months = sku.months;
        row.hotline_price_krw = sku.price;
      }
      if (sku.kind === 'line') {
        row.hotline_tier = tierFor(sku, !!secure);
        row.hotline_duration_months = sku.nominal;
        row.hotline_price_krw = sku.price;
        row.hotline_usage_cap_gb = sku.capGb;
        row.hotline_purpose = purpose === 'work' ? 'work' : 'personal';
      }
      const ins = await supabase.from('payments').insert(row).select('*').single();
      if (ins.error) return bad('결제 기록을 남기지 못했습니다: ' + ins.error.message, 500);
      pay = ins.data;
    }

    /* 🔴 2026-11-03 — 바로카: 권 1장만 드리고 끝(긴급 구독 · 체험 덤 없음). 못 드리면 acknowledge 안 함 → 구글 자동 환불 */
    if (sku.kind === 'baroka') {
      const { data: g, error: ge } = await supabase.rpc('baroka_grant_paid', { p_user: userId, p_kind: sku.baroka, p_payment: pay.id, p_source: apple ? 'apple' : 'google' });
      if (ge || !g || !g.ok) {
        console.error('[ac-google-verify] 🔴 바로카 권을 드리지 못했습니다:', ge?.message || g?.error);
        return bad('바로카 권을 드리지 못했습니다. 잠시 뒤 앱을 다시 열어주세요.', 500);
      }
      await supabase.from('payments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', pay.id);
      if (!apple && !info.acknowledgementState) {
        const ack = await fetch(url + ':acknowledge', { method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (!ack.ok) console.error('[ac-google-verify] 🔴 acknowledge 실패(바로카):', (await ack.text()).slice(0, 300));
      }
      console.log('[ac-google-verify] ✓ 바로카', productId, userId);
      return reply({ ok: true, kind: 'baroka', baroka: sku.baroka });
    }

    let hotline: any = null;
    let extended = false;
    if (sku.kind === 'line') {
      /* ⚠ 이미 처리한 결제면(payments.hotline_id) 다시 늘리지 않고 그 회선을 돌려줍니다 */
      if (!pay.hotline_id && extendHotlineId) {
        hotline = await extendHotline(pay, String(extendHotlineId), sku);
        extended = !!hotline;
      }
      if (!hotline) hotline = await createHotline(pay, sku, name || null);
    }

    /* 🔴 2026-10-01 — 프로 · 게재는 웹과 같게 긴급 구독을 늘리지 않습니다 */
    let sub: any = null;
    if (sku.kind === 'pro') {
      sub = await createOrExtendPro(pay, sku);
      if (!sub) return bad('프로 구독을 만들지 못했습니다. 잠시 뒤 앱을 다시 열어주세요.', 500);
    }
    if (sku.kind === 'usage') {
      /* 🔴 손님이 고른 회선(또는 프로 구독)에 붙입니다. 내 것인지는 DB 가 확인합니다.
         고른 곳이 없거나 남의 것이면 받지 않고(acknowledge 안 함) 구글이 자동 환불하게 둡니다. */
      const qty = Math.min(10, Math.max(1, Number(info.quantity || 1)));
      const kind = usageKind === 'pro' ? 'pro' : 'line';
      const { error: ge } = usageTargetId
        ? await supabase.rpc('grant_usage_pack', { p_user: userId, p_kind: kind, p_target: String(usageTargetId), p_gb: qty, p_payment: pay.id })
        : { error: { message: 'no_target' } };
      if (ge) {
        console.error('[ac-google-verify] 추가 사용량을 붙이지 못했습니다:', ge.message);
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return reply({ ok: false, consume: false, noTarget: true, error: apple
          ? '추가 사용량을 붙일 회선을 찾지 못했습니다. 고객센터로 문의해 주세요.'
          : '추가 사용량을 붙일 회선을 찾지 못했습니다. 결제는 곧 자동으로 취소됩니다.' });
      }
      await supabase.from('payments').update(kind === 'pro' ? { hotline_subscription_id: usageTargetId } : { hotline_id: usageTargetId }).eq('id', pay.id);
    }
    /* 🔴 2026-11-01 — 회선번호: 손님이 잡아 둔 번호를 회선에 붙입니다. 못 붙이면 acknowledge 하지 않음 → 구글 자동 환불 */
    let numberOut: any = null;
    if (sku.kind === 'number') {
      const { data: g, error: ge } = await supabase.rpc('ac_num_grant', { p_user: userId, p_sku: productId, p_payment: pay.id });
      if (ge || !g || !g.ok) {
        console.error('[ac-google-verify] 회선번호를 붙이지 못했습니다:', ge?.message || g?.error);
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return reply({ ok: false, consume: false, noHold: true, error: apple
          ? '고르신 번호를 붙이지 못했습니다(다른 분이 먼저 가져갔을 수 있어요). 고객센터로 문의해 주세요.'
          : '고르신 번호를 붙이지 못했습니다(다른 분이 먼저 가져갔을 수 있어요). 결제는 곧 자동으로 취소됩니다.' });
      }
      numberOut = g;
      if (g.hotline) await supabase.from('payments').update({ hotline_id: g.hotline }).eq('id', pay.id);
    }
    if (sku.kind === 'listing') {
      sub = await enableListing(pay, sku);
      if (!sub) {
        /* 살아 있는 프로가 없음 — acknowledge 하지 않습니다 → 구글이 사흘 안에 자동 환불 */
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return reply({ ok: false, consume: false, noPro: true, error: apple
          ? '공개 게재는 프로 구독이 있어야 합니다. 고객센터로 문의해 주세요.'
          : '공개 게재는 프로 구독이 있어야 합니다. 결제는 곧 자동으로 취소됩니다.' });
      }
    }

    /* 긴급 구독은 긴급 · 일반 · 프리미엄 상품에 들어 있습니다
       🔴 2026-09-28 — 예전 extend_subscription_for_user 는 12 · 24 · 36개월만 받고
         보너스 포인트까지 줍니다. 새 상품(4 · 7 · 13개월, 포인트 없음)용으로
         extend_emergency_for_user 를 따로 만들었습니다. 예전 것은 웹 결제가 아직 씁니다. */
    const { error: extErr } = (sku.kind === 'pro' || sku.kind === 'listing' || sku.kind === 'usage' || sku.kind === 'number')
      ? { error: null }
      : await supabase.rpc('extend_emergency_for_user', { p_user_id: userId, p_months: sku.months });
    if (extErr) {
      /* ⚠ 돈은 받았는데 기간이 안 늘어남 — acknowledge 하지 않고 돌려보냅니다.
         앱이 다시 보내오면 회선은 그대로(멱등), 구독만 다시 늘립니다. */
      console.error('[ac-google-verify] 🔴 구독 연장 실패:', userId, JSON.stringify(extErr));
      return bad('이용 기간을 늘리지 못했습니다. 잠시 뒤 앱을 다시 열어주세요.', 500);
    }
    /* 🔴 2026-10-09 — Pro 긴급: 번호판 글자 인식 무제한 기간 */
    if (sku.ocrPro) {
      const { error: oe } = await supabase.rpc('extend_ocr_pro', { p_user: userId, p_months: sku.months });
      if (oe) {
        console.error('[ac-google-verify] 🔴 번호판 무제한 늘리기 실패:', userId, oe.message);
        return bad('Pro 기능을 켜지 못했습니다. 잠시 뒤 앱을 다시 열어주세요.', 500);
      }
    }
    /* 🔴 2026-09-30 — 무료 체험 중 첫 구매면 긴급 기능 1개월 더 (한 번만 · DB 가 판단) */
    try {
      const { data: bonus } = await supabase.rpc('ac_trial_bonus', { p_user: userId });
      if (bonus) console.log('[ac-google-verify] 체험 중 첫 구매 — 긴급 기능 1개월 덤:', userId);
    } catch (_e) { /* 덤이 실패해도 결제는 그대로 */ }

    await supabase.from('payments').update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', pay.id);

    /* ⑤ 🔴 잘 받았다고 알립니다 */
    if (!apple && !info.acknowledgementState) {
      const ack = await fetch(url + ':acknowledge', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!ack.ok) console.error('[ac-google-verify] 🔴 acknowledge 실패 — 사흘 뒤 환불될 수 있습니다:',
        (await ack.text()).slice(0, 300));
    }

    console.log('[ac-google-verify] ✓', productId, userId, orderId || '');
    return reply({ ok: true, kind: sku.kind, months: sku.months, extended, subscriptionId: sub?.id ?? null, number: numberOut?.number ?? null,
                   upgraded: !!(hotline && hotline._upgraded),
                   hotlineId: hotline?.id ?? null, inviteToken: hotline?.invite_token ?? null });
  } catch (err) {
    return bad(String((err as Error).message ?? err), 500);
  }
});
