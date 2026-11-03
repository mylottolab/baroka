// =====================================================
// Aliascall — 서비스워커 (웹푸시 수신 전용)
// 2026-08-19 신설: "60초 무응답시 긴급 알림" 기능을 위해 도입.
// 전화번호를 아예 안 쓰는 Aliascall 정책에 맞춰, SMS 대신 브라우저 표준 웹푸시로 구현함.
// 이 파일은 반드시 사이트 루트(aliascall.com/sw.js)에 있어야 함 — 서브폴더에 두면
// 그 폴더 하위 경로만 제어권을 갖게 되어 다른 페이지의 푸시를 못 받을 수 있음.
// =====================================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 서버(aliascall-send-wakeup-push Edge Function)에서 보낸 푸시 payload를 받아 알림으로 표시
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '바로카', body: event.data ? event.data.text() : '새 알림이 있습니다.' };
  }

  const title = String(data.title || '바로카').replace(/Aliascall|에일리어스콜/g, '바로카');
  const options = {
    body: String(data.body || '').replace(/Aliascall|에일리어스콜/g, '바로카') || data.body || '',
    icon: data.icon || '/baroka_icon_192.png',
    badge: data.badge || '/baroka_icon_192.png',
    tag: data.tag || 'baroka-wakeup', // 같은 tag면 알림이 쌓이지 않고 최신 것으로 교체됨
    renotify: true, // tag가 같아도 다시 소리/진동 울리도록 (긴급 알림이라 중요)
    requireInteraction: true, // 사용자가 직접 닫거나 탭할 때까지 화면에 유지 (놓치지 않도록)
    data: { url: data.url || '/aliascall_incoming_calls.html' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림을 탭했을 때: 이미 열린 탭이 있으면 그쪽으로 포커스, 없으면 새로 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/aliascall_incoming_calls.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('aliascall_incoming_calls.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
