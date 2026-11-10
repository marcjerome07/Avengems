import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts'] },
  server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const service = await vite.ssrLoadModule('/src/services/customerNotificationService.js');
const { authSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const user = { id: 'customer-1', name: 'Maria', email: 'maria@example.test', role: 'customer', verified: true };

function transport(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = responses.shift(); assert.ok(response, `Unexpected ${url}`); assert.equal(url, response.url);
    assert.equal(options.credentials, 'include'); calls.push({ url, options });
    return Response.json(response.body, { status: response.status ?? 200 });
  });
  t.after(() => assert.equal(responses.length, 0));
  return calls;
}

test('notification service uses the private customer API with CSRF on writes', async (t) => {
  transport(t, [{ url: '/api/me', body: user }]);
  await authSession.restore();
  const list = { items: [{ id: 'n1', orderId: 'AVG-1', title: 't', body: 'b', read: false, createdAt: '2026-11-10T00:00:00Z' }], unreadCount: 1 };
  const calls = transport(t, [
    { url: '/api/me/notifications', body: list },
    { url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } },
    { url: '/api/me/notifications/n1/read', body: { notification: { ...list.items[0], read: true }, unreadCount: 0 } },
    { url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } },
    { url: '/api/me/notifications/read-all', body: { updated: 0, unreadCount: 0 } },
  ]);
  assert.deepEqual(await service.getNotifications(user.id), list);
  assert.equal((await service.markNotificationRead('n1', user.id)).unreadCount, 0);
  assert.equal((await service.markAllNotificationsRead(user.id)).unreadCount, 0);
  assert.equal(calls[0].options.method, 'GET');
  for (const index of [2, 4]) {
    assert.equal(calls[index].options.method, 'POST');
    assert.equal(calls[index].options.headers['X-CSRF-Token'], 'fabricated-csrf');
    assert.equal(calls[index].options.body, '{}');
  }
});

test('relative time reads naturally', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(service.relativeTime('2026-11-10T11:59:40Z', now), 'just now');
  assert.equal(service.relativeTime('2026-11-10T11:55:00Z', now), '5 minutes ago');
  assert.equal(service.relativeTime('2026-11-10T09:00:00Z', now), '3 hours ago');
  assert.equal(service.relativeTime('2026-11-09T12:00:00Z', now), 'yesterday');
  assert.equal(service.relativeTime('2026-10-20T12:00:00Z', now), '3 weeks ago');
  assert.equal(service.relativeTime('not a date', now), '');
});

test('the bell renders for a signed-in customer and nothing when signed out', async () => {
  const { createElement: h } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const { AuthContext } = await vite.ssrLoadModule('/src/context/useAuth.js');
  const { default: Bell } = await vite.ssrLoadModule('/src/components/layout/NotificationBell.jsx');
  const render = (value) => renderToString(h(MemoryRouter, null, h(AuthContext.Provider, { value }, h(Bell))));
  const html = render({ user });
  assert.match(html, /aria-label="Notifications"/);
  assert.match(html, /aria-haspopup="true"/);
  assert.equal(render({ user: null }), '');
});
