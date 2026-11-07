import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'] },
  server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const service = await vite.ssrLoadModule('/src/services/authService.js');
const { AddressLoadState, default: Addresses } = await vite.ssrLoadModule('/src/pages/account/Addresses.jsx');
const { default: Profile } = await vite.ssrLoadModule('/src/pages/account/Profile.jsx');
const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
const { ToastProvider } = await vite.ssrLoadModule('/src/context/ToastContext.jsx');
const { createAuthSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const user = { id: 'verified-owner', name: 'Server Customer', email: 'customer@example.test', phone: '09171234567', role: 'customer', verified: true };
const address = { id: 'address-id', label: 'Home', fullName: 'Server Customer', isDefault: true };
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });
function transport(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const reply = replies.shift();
    assert.ok(reply, `Unexpected request ${url}`);
    assert.equal(url, reply.url);
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    calls.push({ url, options });
    if (reply.throw) throw new TypeError('offline');
    if (reply.invalidJson) return new Response('invalid');
    return Response.json(reply.body, { status: reply.status ?? 200 });
  });
  t.after(() => assert.equal(replies.length, 0));
  return calls;
}

test('profile update uses cookie API, CSRF, and no legacy user ID', async (t) => {
  const calls = transport(t, [csrf(), { url: '/api/me', body: user }]);
  assert.deepEqual(await service.updateProfile('mock-user-admin', { name: user.name, phone: user.phone }), user);
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: user.name, phone: user.phone });
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.doesNotMatch(JSON.stringify(calls), /mock-user-admin/);
});

test('address operations preserve array contracts while sending relative owner-free requests', async (t) => {
  const replies = [{ url: '/api/me/addresses', body: { items: [address] } },
    csrf(), { url: '/api/me/addresses', status: 201, body: { items: [address] } },
    csrf(), { url: '/api/me/addresses/address-id', body: { items: [address] } },
    csrf(), { url: '/api/me/addresses/address-id/default', body: { items: [address] } },
    csrf(), { url: '/api/me/addresses/address-id', body: { items: [] } }];
  const calls = transport(t, replies);
  assert.deepEqual(await service.getAddresses('mock-owner'), [address]);
  const { id, ...newAddress } = address;
  assert.deepEqual(await service.saveAddress('mock-owner', newAddress), [address]);
  assert.deepEqual(await service.saveAddress('mock-owner', address), [address]);
  assert.deepEqual(await service.setDefaultAddress('mock-owner', id), [address]);
  assert.deepEqual(await service.deleteAddress('mock-owner', id), []);
  assert.deepEqual(calls.filter((call) => call.options.method).map((call) => call.options.method), ['GET', 'POST', 'PATCH', 'PATCH', 'DELETE']);
  assert.equal(JSON.parse(calls[4].options.body).id, undefined);
  assert.doesNotMatch(JSON.stringify(calls), /mock-owner/);
});

test('reload and new login identity read the server again without cached mock addresses', async (t) => {
  transport(t, [{ url: '/api/me/addresses', body: { items: [address] } },
    { url: '/api/me/addresses', body: { items: [] } }]);
  assert.deepEqual(await service.getAddresses('old-owner'), [address]);
  assert.deepEqual(await service.getAddresses('new-owner'), []);
});

test('network/JSON failures remain retryable by user and never automatically replay writes', async (t) => {
  const calls = transport(t, [csrf(), { url: '/api/me/addresses', throw: true },
    { url: '/api/me/addresses', invalidJson: true }, { url: '/api/me/addresses', body: { items: [] } }]);
  await assert.rejects(service.saveAddress('ignored', { label: 'Home' }), { code: 'NETWORK_ERROR' });
  assert.equal(calls.length, 2);
  await assert.rejects(service.getAddresses(), { code: 'SERVER_ERROR' });
  assert.deepEqual(await service.getAddresses(), []);
});

test('validation, ownership, migration and database errors retain safe API messages', async (t) => {
  for (const [status, code] of [[400, 'VALIDATION_ERROR'], [404, 'NOT_FOUND'], [503, 'ADDRESS_MIGRATION_REQUIRED'], [503, 'DATABASE_UNAVAILABLE']]) {
    transport(t, [csrf(), { url: '/api/me/addresses/address-id', status, body: { code, message: 'Safe account error.' } }]);
    await assert.rejects(service.saveAddress('ignored', address), { code, status, message: 'Safe account error.' });
  }
});

test('CSRF rejection retries once; repeated rejection fails without an infinite loop', async (t) => {
  const reject = () => ({ url: '/api/me', status: 403, body: { code: 'CSRF_REJECTED' } });
  transport(t, [csrf(), reject(), csrf(), { url: '/api/me', body: user }]);
  assert.deepEqual(await service.updateProfile('ignored', { name: user.name }), user);
  transport(t, [csrf(), reject(), csrf(), reject()]);
  await assert.rejects(service.updateProfile('ignored', { name: user.name }), { code: 'CSRF_REJECTED' });
});

test('expired access refreshes cookie session before retrying the rejected operation', async (t) => {
  const calls = transport(t, [csrf(), { url: '/api/me', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/auth/refresh', body: { user } }, csrf(), { url: '/api/me', body: user }]);
  assert.deepEqual(await service.updateProfile('ignored', { name: user.name }), user);
  assert.equal(calls.length, 6);
});

test('failed refresh stops replay and missing CSRF token prevents writes', async (t) => {
  transport(t, [{ url: '/api/me/addresses', status: 401, body: { code: 'UNAUTHORIZED' } },
    csrf(), { url: '/api/auth/refresh', status: 401, body: { code: 'UNAUTHORIZED' } }]);
  await assert.rejects(service.getAddresses(), { code: 'UNAUTHORIZED' });
  transport(t, [{ url: '/api/auth/csrf', body: {} }]);
  await assert.rejects(service.updateProfile('ignored', { name: user.name }), { code: 'SERVER_ERROR' });
});

test('address loading and failure states expose loading feedback and an explicit retry control', () => {
  const loading = renderToString(h(AddressLoadState, { loading: true }, 'No saved addresses'));
  assert.match(loading, /Loading addresses/);
  assert.doesNotMatch(loading, /No saved addresses/);
  const error = renderToString(h(AddressLoadState, { error: new Error('Unable to load addresses.'), onRetry: () => {} }, 'No saved addresses'));
  assert.match(error, /role="alert"/);
  assert.match(error, /Unable to load addresses/);
  assert.match(error, /Retry loading addresses/);
  assert.doesNotMatch(error, /No saved addresses/);
  assert.match(renderToString(h(AddressLoadState, {}, 'No saved addresses')), /No saved addresses/);
});

test('account screens retain layout and read-only email with server-derived identity', async () => {
  const session = createAuthSession({ getCurrentUser: async () => user });
  await session.restore();
  const render = (Page) => renderToString(h(MemoryRouter, null, h(AuthProvider, { session }, h(ToastProvider, null, h(Page)))));
  const profileHtml = render(Profile);
  assert.match(profileHtml, /Server Customer/);
  assert.match(profileHtml, /customer@example.test/);
  assert.match(profileHtml, /Your sign-in email is read-only/);
  assert.match(profileHtml, /type="text"[^>]*disabled=""/);
  assert.match(render(Addresses), /Loading addresses/);
});
