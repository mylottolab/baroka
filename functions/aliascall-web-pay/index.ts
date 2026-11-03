/* =====================================================================
   Aliascall — aliascall-web-pay
   2026-10-01 신설 — 웹(브라우저)에서 앱과 같은 이용권을 국내카드(이니시스) · PayPal 로 팝니다.

   🔴 상품 · 값 · 적용 규칙은 aliascall-google-verify 와 **똑같습니다.**
      (상품표 SKUS 와 적용 함수들을 그대로 옮겨 왔습니다. 한쪽을 고치면 다른 쪽도 고치세요.)
      회선 만들기 · 연장 · 2인→4인 올리기 · 긴급 구독(+덤) · 프로 · 게재 · 추가 사용량 · 체험 중 첫 구매 덤

   🔴 하나의 함수가 네 가지를 받습니다
      POST JSON { action:'inicis_prepare', sku, opts, buyername, ... }   국내카드 결제창 정보 (로그인 필요)
      POST form (이니시스가 돌려보냄)                                     승인 → 적용 → 이용권 화면으로
      POST JSON { action:'paypal_create', sku, opts }                    PayPal 주문 (로그인 필요)
      POST JSON { action:'paypal_capture', orderID }                     PayPal 승인 → 적용

   🔴 웹은 돈이 먼저 빠져나가 "받지 않기" 를 할 수 없습니다.
      그래서 게재(프로 필요) · 추가 사용량(내 회선인지) 은 **결제 전에** 확인하고 막습니다.

   ⚠ Verify JWT 를 **끕니다.** 이니시스가 결제 뒤 이 함수로 돌아올 때 로그인 열쇠가 없습니다.
     (결제 준비 · 주문은 함수 안에서 로그인을 직접 확인합니다)
   ⚠ 비밀값은 기존 것을 그대로 씁니다: INICIS_MID · INICIS_PRO_HASHKEY · PAYPAL_CLIENT_ID ·
     PAYPAL_CLIENT_SECRET · PAYPAL_MODE · SITE_BASE_URL
   ===================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MID = Deno.env.get('INICIS_MID') || '';
const HASH_KEY = Deno.env.get('INICIS_PRO_HASHKEY') || '';
const SITE = Deno.env.get('SITE_BASE_URL') || 'https://aliascall.com';
const BAROKA_SITE = Deno.env.get('BAROKA_SITE_URL') || 'https://baroka.kr';   // 🔴 2026-11-03 바로카
const FN_URL = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.supabase.co/functions/v1') + '/aliascall-web-pay';
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const PAYPAL_API = (Deno.env.get('PAYPAL_MODE') || 'sandbox') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

type Sku = { kind: 'emergency' | 'line' | 'pro' | 'listing' | 'usage' | 'number' | 'baroka'; baroka?: 'reg' | 'change'; months: number; nominal: number; price: number; tier?: string;
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
  ac_num_transfer: { kind: 'number', months: 0, nominal: 0, price: 5500 },    // 명의 이전 수수료(받는 분)
  /* 🔴 2026-11-03 — 바로카(baroka.kr): 차량 등록 1회 · 번호 변경 1회. 월 요금 없음. 결제 1번 = 권 1장 (baroka_credits) */
  baroka_reg:    { kind: 'baroka', baroka: 'reg',    months: 0, nominal: 0, price: 2500 },
  baroka_change: { kind: 'baroka', baroka: 'change', months: 0, nominal: 0, price: 2500 },
};

/* 2인은 상대를 바꿀 수 있는 에브리바디, 4인은 프리미엄 4인 (33차 — 교체는 기능으로 포함) */
function tierFor(s: Sku, secure: boolean) {
  const base = s.persons === 4 ? 'premium_4' : 'hotline_everybody';
  return secure ? base + '_secure' : base;
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


/* ── 영수증에 찍힐 상품 이름 (PG 영수증이 한국어라 번역하지 않음) ── */
const NAME: Record<string, string> = {
  baroka_reg: '바로카 차량 등록', baroka_change: '바로카 번호 변경',
  ac_plan_emergency_12m: '긴급 이용권 12개월',
  ac_plan_emergency_pro_12m: 'Pro 긴급 이용권 12개월',
  ac_plan_basic_3m: '일반 이용권 3개월', ac_plan_basic_6m: '일반 이용권 6개월', ac_plan_basic_12m: '일반 이용권 12개월',
  ac_plan_premium_3m: '프리미엄 이용권 3개월', ac_plan_premium_6m: '프리미엄 이용권 6개월', ac_plan_premium_12m: '프리미엄 이용권 12개월',
  ac_pro_starter_1m: '프로 스타터 1개월', ac_pro_starter_6m: '프로 스타터 6개월', ac_pro_starter_12m: '프로 스타터 12개월',
  ac_pro_business_1m: '프로 비즈니스 1개월', ac_pro_business_6m: '프로 비즈니스 6개월', ac_pro_business_12m: '프로 비즈니스 12개월',
  ac_pro_enterprise_1m: '프로 엔터프라이즈 1개월', ac_pro_enterprise_6m: '프로 엔터프라이즈 6개월', ac_pro_enterprise_12m: '프로 엔터프라이즈 12개월',
  ac_listing_1m: '공개 업체 목록 게재 1개월', ac_listing_6m: '공개 업체 목록 게재 6개월', ac_listing_12m: '공개 업체 목록 게재 12개월',
  ac_usage_1gb_3m: '추가 사용량 1GB',
  ac_num_4_basic: '회선번호 4자리', ac_num_4_good: '좋은 회선번호 4자리', ac_num_5_basic: '회선번호 5자리', ac_num_5_good: '좋은 회선번호 5자리',
  ac_num_6_basic: '회선번호 6자리', ac_num_6_good: '좋은 회선번호 6자리', ac_num_7_basic: '회선번호 7자리', ac_num_7_good: '좋은 회선번호 7자리',
  ac_num_8_good: '좋은 회선번호 8자리', ac_num_keep: '회선번호 1년 더 잡아 두기', ac_num_transfer: '회선번호 명의 이전',
};

async function userOf(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  return error || !data?.user ? null : data.user.id;
}

/* ── 결제 전 확인 · 결제 기록(pending) — 이니시스 · PayPal 공통 ── */
type Opts = { sku?: string; secure?: boolean; purpose?: string; extendHotlineId?: string; lineName?: string;
              usageKind?: string; usageTargetId?: string; qty?: number };

async function precheck(userId: string, sku: Sku, o: Opts): Promise<string | null> {
  const now = new Date().toISOString();
  if (sku.kind === 'listing') {
    const { data } = await supabase.from('hotline_subscriptions').select('id').eq('owner_user_id', userId)
      .eq('status', 'active').gt('expires_at', now).limit(1);
    if (!data || !data.length) return '공개 게재는 프로 구독이 있어야 살 수 있습니다.';
  }
  if (sku.kind === 'number') {   // 🔴 2026-11-01 — 결제 전에 번호를 잡아 뒀는지 (잡아 두기 · 명의 이전은 따로)
    if (o.sku === 'ac_num_keep') {
      const { data } = await supabase.from('ac_num_intents').select('number').eq('user_id', userId).eq('kind', 'keep').limit(1);
      if (!data || !data.length) return '잡아 둘 번호를 다시 골라 주세요.';
    } else if (o.sku === 'ac_num_transfer') {
      const { data } = await supabase.from('ac_num_transfers').select('id').eq('buyer', userId).eq('status', 'accepted').limit(1);
      if (!data || !data.length) return '수락한 명의 이전이 없습니다. 이전 신청을 다시 수락해 주세요.';
    } else {
      const { data } = await supabase.from('ac_num_holds').select('number').eq('user_id', userId).eq('sku', o.sku || '').limit(1);
      if (!data || !data.length) return '고르신 번호를 잡아 두지 못했습니다. 번호를 다시 골라 주세요.';
    }
  }
  if (sku.kind === 'usage') {
    if (!o.usageTargetId) return '추가 사용량을 붙일 회선을 골라주세요.';
    if (o.usageKind === 'pro') {
      const { data } = await supabase.from('hotline_subscriptions').select('id').eq('id', o.usageTargetId)
        .eq('owner_user_id', userId).eq('status', 'active').gt('expires_at', now).maybeSingle();
      if (!data) return '고르신 프로 구독을 찾을 수 없습니다.';
    } else {
      const { data } = await supabase.from('hotlines').select('id').eq('id', o.usageTargetId)
        .eq('owner_user_id', userId).is('subscription_id', null).gt('expires_at', now).maybeSingle();
      if (!data) return '고르신 회선을 찾을 수 없거나, 이미 끝난 회선입니다.';
    }
  }
  return null;
}

function rowFor(userId: string, sku: Sku, skuId: string, o: Opts, method: string, extId: string,
                amountMinor: number, currency: string) {
  const qty = sku.kind === 'usage' ? Math.min(10, Math.max(1, Number(o.qty || 1))) : 1;
  const row: any = {
    user_id: userId, method, external_payment_id: extId,
    amount_minor_units: amountMinor, currency_code: currency, status: 'pending',
    purpose: sku.kind === 'emergency' ? 'subscription' : 'hotline',
    google_product_id: skuId,               // 상품 번호 — 구글과 같은 칸을 씁니다(웹은 method 로 구분)
    google_action: sku.kind === 'emergency' ? 'emergency' : (sku.kind === 'usage' ? 'usage' : (sku.kind === 'baroka' ? 'baroka_' + sku.baroka : null)),
    order_opts: { ...o, qty },              // 결제 뒤 적용에 쓸 선택(회선 이름 · 연장할 회선 · 붙일 곳 …)
  };
  if (sku.kind === 'pro') { row.hotline_tier = sku.tier; row.hotline_duration_months = sku.months; row.hotline_price_krw = sku.price; }
  if (sku.kind === 'line') {
    row.hotline_tier = tierFor(sku, !!o.secure);
    row.hotline_duration_months = sku.nominal;
    row.hotline_price_krw = sku.price;
    row.hotline_usage_cap_gb = sku.capGb;
    row.hotline_purpose = o.purpose === 'work' ? 'work' : 'personal';
  }
  return { row, qty };
}

/* ── 적용 — aliascall-google-verify 와 같은 규칙 ── */
async function fulfill(pay: any) {
  const skuId = pay.google_product_id as string;
  const sku = SKUS[skuId];
  if (!sku) throw new Error('모르는 상품입니다: ' + skuId);
  const o: Opts = pay.order_opts || {};
  const userId = pay.user_id;

  /* 🔴 2026-11-03 — 바로카: 권 1장만 드리고 끝 (긴급 구독 · 체험 덤 없음) */
  if (sku.kind === 'baroka') {
    const { data: g, error: ge } = await supabase.rpc('baroka_grant_paid', { p_user: userId, p_kind: sku.baroka, p_payment: pay.id, p_source: pay.method });
    if (ge || !g || !g.ok) throw new Error('바로카 권을 드리지 못했습니다(' + (ge?.message || g?.error) + ')');
    await supabase.from('payments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', pay.id);
    return { ok: true, kind: 'baroka', baroka: sku.baroka };
  }
  let hotline: any = null, extended = false, sub: any = null;
  if (sku.kind === 'line') {
    if (!pay.hotline_id && o.extendHotlineId) { hotline = await extendHotline(pay, String(o.extendHotlineId), sku); extended = !!hotline; }
    if (!hotline) hotline = await createHotline(pay, sku, (o.lineName || '').slice(0, 30) || null);
  }
  if (sku.kind === 'pro') { sub = await createOrExtendPro(pay, sku); if (!sub) throw new Error('프로 구독을 만들지 못했습니다'); }
  if (sku.kind === 'listing') { sub = await enableListing(pay, sku); if (!sub) throw new Error('게재를 적용하지 못했습니다(프로 구독 없음)'); }
  if (sku.kind === 'usage') {
    const qty = Math.min(10, Math.max(1, Number(o.qty || 1)));
    const { error } = await supabase.rpc('grant_usage_pack', { p_user: userId, p_kind: o.usageKind === 'pro' ? 'pro' : 'line',
      p_target: String(o.usageTargetId), p_gb: qty, p_payment: pay.id });
    if (error) throw new Error('추가 사용량을 붙이지 못했습니다: ' + error.message);
    await supabase.from('payments').update(o.usageKind === 'pro' ? { hotline_subscription_id: o.usageTargetId } : { hotline_id: o.usageTargetId }).eq('id', pay.id);
  }
  let numberOut: any = null;
  if (sku.kind === 'number') {   // 🔴 2026-11-01 — 잡아 둔 번호를 회선에 붙임
    const { data: g, error: ge } = await supabase.rpc('ac_num_grant', { p_user: userId, p_sku: skuId, p_payment: pay.id });
    if (ge || !g || !g.ok) throw new Error('회선번호를 붙이지 못했습니다(' + (ge?.message || g?.error) + '). 고객센터에서 환불해 드립니다.');
    numberOut = g;
    if (g.hotline) await supabase.from('payments').update({ hotline_id: g.hotline }).eq('id', pay.id);
  }
  if (sku.kind === 'emergency' || sku.kind === 'line') {
    const { error } = await supabase.rpc('extend_emergency_for_user', { p_user_id: userId, p_months: sku.months });
    if (error) throw new Error('이용 기간을 늘리지 못했습니다: ' + error.message);
  }
  if (sku.ocrPro) {   // 🔴 2026-10-09 — Pro 긴급: 번호판 글자 인식 무제한
    const { error } = await supabase.rpc('extend_ocr_pro', { p_user: userId, p_months: sku.months });
    if (error) throw new Error('Pro 기능을 켜지 못했습니다: ' + error.message);
  }
  try { await supabase.rpc('ac_trial_bonus', { p_user: userId }); } catch (_e) { /* 덤이 실패해도 결제는 그대로 */ }
  await supabase.from('payments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', pay.id);
  return { ok: true, kind: sku.kind, months: sku.months, extended, number: numberOut?.number ?? null, upgraded: !!(hotline && hotline._upgraded),
           hotlineId: hotline?.id ?? null, inviteToken: hotline?.invite_token ?? null, subscriptionId: sub?.id ?? null };
}

/* 이미 끝난 결제를 다시 부르면 같은 결과를 돌려줍니다(두 번 적용하지 않음) */
async function summary(pay: any) {
  const sku = SKUS[pay.google_product_id];
  let inv = null;
  if (pay.hotline_id) { const { data } = await supabase.from('hotlines').select('invite_token').eq('id', pay.hotline_id).maybeSingle(); inv = data?.invite_token ?? null; }
  if (sku?.kind === 'baroka') return { ok: true, already: true, kind: 'baroka', baroka: sku.baroka };
  return { ok: true, already: true, kind: sku?.kind, months: sku?.months, hotlineId: pay.hotline_id ?? null,
           inviteToken: inv, subscriptionId: pay.hotline_subscription_id ?? null };
}

async function sha512b64(s: string) {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s));
  let bin = ''; new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin);
}
async function paypalToken() {
  const r = await fetch(PAYPAL_API + '/v1/oauth2/token', { method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(PAYPAL_CLIENT_ID + ':' + PAYPAL_CLIENT_SECRET), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials' });
  const d = await r.json(); if (!r.ok) throw new Error('PayPal 인증 실패'); return d.access_token as string;
}
async function krwPerUsd() {
  try { const { data } = await supabase.rpc('get_setting_number', { p_key: 'krw_per_usd', p_default: 1400 });
        const n = Number(data); return (n >= 500 && n <= 5000) ? n : 1400; } catch (_e) { return 1400; }
}
function back(params: Record<string, unknown>) {
  const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v != null) q.set(k, String(v)); });
  /* 🔴 2026-11-01 — 회선번호 결제는 번호 화면으로 돌아갑니다 */
  const page = (params.kind === 'number' || String(params.sku || '').startsWith('ac_num_')) ? '/aliascall_numbers.html?' : '/aliascall_plans.html?';
  /* 🔴 2026-11-03 — 바로카 결제는 baroka.kr 내 차 화면으로 돌아갑니다 */
  if (params.kind === 'baroka' || String(params.sku || '').startsWith('baroka_'))
    return new Response(null, { status: 302, headers: { Location: BAROKA_SITE + '/my.html?' + q.toString() } });
  return new Response(null, { status: 302, headers: { Location: SITE + page + q.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return bad('method not allowed', 405);
  const ctype = req.headers.get('content-type') || '';

  /* ── ② 이니시스가 결제 뒤 돌아오는 곳 (form) ── */
  if (!ctype.includes('application/json')) {
    try {
      const f = await req.formData();
      const st = String(f.get('P_STATUS') || ''), oid = String(f.get('P_OID') || '');
      if (st !== '00') return back({ webpaid: 0, sku: oid.startsWith('BRKA_') ? 'baroka_reg' : null, msg: String(f.get('P_RMESG') || '결제를 마치지 못했습니다') });
      const { data: pay } = await supabase.from('payments').select('*').eq('external_payment_id', oid).maybeSingle();
      if (!pay) return back({ webpaid: 0, msg: '주문 정보를 찾을 수 없습니다' });
      if (pay.status === 'completed') return back({ webpaid: 1, sku: pay.google_product_id, ...(await summary(pay)) });
      const idc = String(f.get('P_IDCNAME') || '');
      const body = ['P_MID=' + encodeURIComponent(String(f.get('P_MID') || '')), 'P_AUTH_TID=' + encodeURIComponent(String(f.get('P_AUTH_TID') || '')),
                    'P_AMT=' + encodeURIComponent(String(f.get('P_AMT') || '')), 'P_CHARSET=UTF-8'].join('&');
      /* 🔴 승인 금액은 우리가 적어 둔 값과 같아야 합니다(중간에서 바꾼 금액 막기) */
      if (Number(f.get('P_AMT')) !== Number(pay.amount_minor_units)) {
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return back({ webpaid: 0, sku: pay.google_product_id, msg: '결제 금액이 맞지 않습니다' });
      }
      const ar = await fetch('https://' + idc + 'paypro.inicis.com/payment/v1/rest/payAppl.ini', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body });
      const ap = Object.fromEntries(new URLSearchParams(await ar.text()));
      if (ap.P_STATUS !== '00') {
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return back({ webpaid: 0, sku: pay.google_product_id, msg: ap.P_RMESG || '승인을 받지 못했습니다' });
      }
      const out = await fulfill(pay);
      return back({ webpaid: 1, sku: pay.google_product_id, ...out });
    } catch (e) {
      console.error('[web-pay] 이니시스 돌아옴 처리 실패', e);
      return back({ webpaid: 0, msg: '결제는 되었을 수 있습니다. 잠시 뒤 마이페이지에서 확인해주세요.' });
    }
  }

  try {
    const body = await req.json();
    const action = body.action;

    /* ── ③ PayPal 승인 ── */
    if (action === 'paypal_capture') {
      const orderID = String(body.orderID || '');
      const { data: pay } = await supabase.from('payments').select('*').eq('external_payment_id', orderID).maybeSingle();
      if (!pay) return bad('주문 정보를 찾을 수 없습니다');
      if (pay.status === 'completed') return reply(await summary(pay));
      const tok = await paypalToken();
      const cr = await fetch(PAYPAL_API + '/v2/checkout/orders/' + orderID + '/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok } });
      const cd = await cr.json();
      const already = cr.status === 422 && cd?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED';
      if (!already && (!cr.ok || cd.status !== 'COMPLETED')) {
        await supabase.from('payments').update({ status: 'failed' }).eq('id', pay.id);
        return bad('결제 승인에 실패했습니다');
      }
      return reply(await fulfill(pay));
    }

    /* ── ① · ③ 준비 (로그인 필요) ── */
    const userId = await userOf(req);
    if (!userId) return bad('로그인이 필요합니다', 401);
    const skuId = String(body.sku || '');
    const sku = SKUS[skuId];
    if (!sku) return bad('모르는 상품입니다: ' + skuId);
    const o: Opts = body.opts || {};
    const why = await precheck(userId, sku, { ...o, sku: skuId });
    if (why) return bad(why);

    if (action === 'inicis_prepare') {
      if (!MID || !HASH_KEY) return bad('국내카드 결제 설정이 없습니다', 500);
      const qty = sku.kind === 'usage' ? Math.min(10, Math.max(1, Number(o.qty || 1))) : 1;
      const amount = sku.price * qty;
      const ts = Date.now().toString();
      const oid = (sku.kind === 'baroka' ? 'BRKA_WP_' : 'ALCL_WP_') + ts + '_' + Math.random().toString(36).slice(2, 6);
      const { row } = rowFor(userId, sku, skuId, o, 'inicis_card', oid, amount, 'KRW');
      const ins = await supabase.from('payments').insert(row);
      if (ins.error) return bad('결제 준비 중 오류: ' + ins.error.message, 500);
      return reply({
        mid: MID, oid, amt: String(amount), timestamp: ts,
        chkfake: await sha512b64(String(amount) + oid + ts + HASH_KEY),
        goodname: (sku.kind === 'baroka' ? '' : 'Aliascall ') + (NAME[skuId] || skuId) + (qty > 1 ? ' × ' + qty : ''),
        buyername: String(body.buyername || '회원'), buyertel: String(body.buyertel || ''), buyeremail: String(body.buyeremail || ''),
        nextUrl: FN_URL, notiUrl: FN_URL, closeUrl: sku.kind === 'baroka' ? BAROKA_SITE + '/my.html' : SITE + (sku.kind === 'number' ? '/aliascall_numbers.html' : '/aliascall_plans.html'),
      });
    }

    if (action === 'paypal_create') {
      const qty = sku.kind === 'usage' ? Math.min(10, Math.max(1, Number(o.qty || 1))) : 1;
      const usd = Math.round((sku.price * qty / await krwPerUsd()) * 100) / 100;
      const tok = await paypalToken();
      const r = await fetch(PAYPAL_API + '/v2/checkout/orders', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: usd.toFixed(2) },
          description: (sku.kind === 'baroka' ? '' : 'Aliascall ') + (NAME[skuId] || skuId) + (qty > 1 ? ' x ' + qty : ''), custom_id: skuId }] }) });
      const od = await r.json();
      if (!r.ok) return bad('PayPal 주문을 만들지 못했습니다', 500);
      const { row } = rowFor(userId, sku, skuId, o, 'paypal', od.id, Math.round(usd * 100), 'USD');
      const ins = await supabase.from('payments').insert(row);
      if (ins.error) return bad('결제 준비 중 오류: ' + ins.error.message, 500);
      return reply({ id: od.id });
    }
    return bad('모르는 요청입니다');
  } catch (e) {
    return bad(String((e as Error).message ?? e), 500);
  }
});
