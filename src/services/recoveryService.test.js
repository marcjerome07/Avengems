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
const auth = await vite.ssrLoadModule('/src/services/authService.js');
const otp = await vite.ssrLoadModule('/src/services/otpService.js');
const { default: OtpVerifier } = await vite.ssrLoadModule('/src/components/auth/OtpVerifier.jsx');
const { default: ForgotPassword } = await vite.ssrLoadModule('/src/pages/auth/ForgotPassword.jsx');
const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
const { createAuthSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const csrf = () => ({ url: '/api/auth/csrf', body: { csrfToken: 'fabricated-csrf' } });

function mockApi(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const reply = responses.shift();
    assert.ok(reply, `Unexpected request to ${url}`);
    assert.equal(url, reply.url);
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    calls.push({ url, options });
    if (reply.error) throw reply.error;
    return Response.json(reply.body, { status: reply.status ?? 200, headers: reply.headers });
  });
  return calls;
}

test('forgot-password requests provider email through CSRF without local users, storage or generated codes', async (t) => {
  let reads = 0;
  const previous = globalThis.window;
  const storage = { getItem: () => { reads += 1; return null; }, setItem: () => { reads += 1; } };
  globalThis.window = { localStorage: storage, sessionStorage: storage, crypto: { getRandomValues: () => assert.fail('No local OTP generation') } };
  t.after(() => { globalThis.window = previous; });
  const log = t.mock.method(console, 'info', () => {});
  const calls = mockApi(t, [csrf(), { url: '/api/auth/forgot-password', status: 202,
    body: { message: 'If an account exists, a code will be sent.', retryAfter: 60 } }]);
  const result = await auth.requestPasswordReset('customer@example.test');
  assert.equal(result.retryAfter, 60);
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'customer@example.test' });
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.equal(reads, 0);
  assert.equal(log.mock.calls.length, 0);
  assert.equal(otp.consumeToken, undefined);
  assert.equal(otp.getActiveOtp, undefined);
});

test('recovery OTP verification uses backend proof, and reset sends only the new password', async (t) => {
  const calls = mockApi(t, [csrf(), { url: '/api/auth/verify-recovery', body: { verified: true, expiresIn: 300 } },
    csrf(), { url: '/api/auth/reset-password', body: { ok: true, signInRequired: true, sessionRevocationConfirmed: true } }]);
  assert.deepEqual(await otp.verifyOtp('customer@example.test', 'reset', '123456'), { verified: true, expiresIn: 300 });
  assert.equal((await auth.resetPassword('FabricatedNew1!')).ok, true);
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'customer@example.test', code: '123456' });
  assert.deepEqual(JSON.parse(calls[3].options.body), { password: 'FabricatedNew1!' });
  assert.equal(calls[3].options.headers.Authorization, undefined);
});

test('invalid/expired codes, recovery authorization expiry, weak passwords and resend limits stay displayable', async (t) => {
  for (const [path, status, code, operation] of [
    ['verify-recovery', 400, 'INVALID_CODE', () => otp.verifyOtp('customer@example.test', 'reset', '123456')],
    ['reset-password', 401, 'INVALID_RECOVERY', () => auth.resetPassword('FabricatedNew1!')],
    ['reset-password', 400, 'WEAK_PASSWORD', () => auth.resetPassword('FabricatedNew1!')],
    ['forgot-password', 429, 'RATE_LIMITED', () => otp.sendOtp('customer@example.test', 'reset')],
  ]) {
    mockApi(t, [csrf(), { url: `/api/auth/${path}`, status, body: { code, message: 'Safe recovery error.' }, headers: { 'Retry-After': '60' } }]);
    await assert.rejects(operation(), { code, message: 'Safe recovery error.', retryAfter: 60 });
  }
});

test('network-uncertain password updates are not retried; explicit CSRF rejection can retry only once', async (t) => {
  let calls = mockApi(t, [csrf(), { url: '/api/auth/reset-password', error: new TypeError('offline') }]);
  await assert.rejects(auth.resetPassword('FabricatedNew1!'), { code: 'NETWORK_ERROR' });
  assert.equal(calls.length, 2);
  calls = mockApi(t, [csrf(), { url: '/api/auth/verify-recovery', status: 403, body: { code: 'CSRF_REJECTED' } },
    csrf(), { url: '/api/auth/verify-recovery', body: { verified: true, expiresIn: 300 } }]);
  assert.equal((await otp.verifyOtp('customer@example.test', 'reset', '123456')).verified, true);
  assert.equal(calls.length, 4);
});

test('resend delegates to forgot-password; recovery APIs cannot be reused for registration OTPs', async (t) => {
  mockApi(t, [csrf(), { url: '/api/auth/forgot-password', status: 202, body: { message: 'Check your email if registered.', retryAfter: 60 } }]);
  assert.equal((await otp.sendOtp('customer@example.test', 'reset')).retryAfter, 60);
  assert.throws(() => otp.sendOtp('customer@example.test', 'verify'), { code: 'INVALID_PURPOSE' });
});

test('recovery screens retain the existing shell without demo codes, fake expiry or local reset tokens', () => {
  const state = createAuthSession();
  const html = renderToString(h(MemoryRouter, null, h(AuthProvider, { session: state }, h(ForgotPassword))));
  assert.match(html, /Forgot your password/);
  assert.match(html, /Send OTP/);
  const verifier = renderToString(h(OtpVerifier, { email: 'customer@example.test', verify: async () => ({ verified: true }) }));
  assert.match(verifier, /Recovery code/);
  assert.doesNotMatch(verifier, /Demo mode|Expire this code|demoCode|tok_|Code expires in/);
});
