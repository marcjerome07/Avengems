import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, server: { middlewareMode: true, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const auth = await vite.ssrLoadModule('/src/services/authService.js');
const { readConfirmationLink } = await vite.ssrLoadModule('/src/utils/confirmationLink.js');

test('signup calls the CSRF-protected API without local user, password or OTP persistence', async (t) => {
  const calls = [];
  const storage = () => assert.fail('Registration must not use browser storage');
  t.mock.method(console, 'info', () => assert.fail('Registration must not log a code'));
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: storage, setItem: storage }, sessionStorage: { getItem: storage, setItem: storage } };
  t.after(() => { globalThis.window = previousWindow; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/csrf') ? Response.json({ csrfToken: 'fabricated-csrf' })
      : Response.json({ email: 'developer@example.test', message: 'Check confirmation instructions.' }, { status: 202 });
  });
  const result = await auth.register({ name: 'Developer', email: 'developer@example.test', password: 'Fabricated1!', role: 'admin' });
  assert.equal(result.email, 'developer@example.test');
  assert.deepEqual(calls.map((call) => call.url), ['/api/auth/csrf', '/api/auth/register']);
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'fabricated-csrf');
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: 'Developer', email: 'developer@example.test', password: 'Fabricated1!' });
});

test('code verification, callback proof and resend use backend registration routes only', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/csrf')) return Response.json({ csrfToken: 'fabricated-csrf' });
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ verified: true });
  });
  await auth.verifyEmail('developer@example.test', '123456');
  await auth.verifyEmailCallback({ tokenHash: 'fabricated-hash' });
  await auth.resendVerification('developer@example.test');
  assert.deepEqual(requests, [
    { url: '/api/auth/verify-email', body: { email: 'developer@example.test', code: '123456' } },
    { url: '/api/auth/verify-email', body: { tokenHash: 'fabricated-hash' } },
    { url: '/api/auth/resend-verification', body: { email: 'developer@example.test' } },
  ]);
});

test('provider delivery limits, invalid codes and network failures propagate without unsafe retries', async (t) => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/csrf')) return Response.json({ csrfToken: 'fabricated-csrf' });
    posts += 1;
    return Response.json({ code: 'EMAIL_RATE_LIMITED', message: 'Please wait.' }, { status: 429, headers: { 'Retry-After': '60' } });
  });
  await assert.rejects(auth.register({ name: 'Developer', email: 'developer@example.test', password: 'Fabricated1!' }),
    { code: 'EMAIL_RATE_LIMITED', retryAfter: 60 });
  assert.equal(posts, 1);
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  await assert.rejects(auth.verifyEmail('developer@example.test', '123456'), { code: 'NETWORK_ERROR' });
});

test('CSRF rejection retries once before provider processing, never loops', async (t) => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/csrf')) return Response.json({ csrfToken: 'fabricated-csrf' });
    posts += 1;
    return Response.json({ code: 'CSRF_REJECTED', message: 'Please retry.' }, { status: 403 });
  });
  await assert.rejects(auth.verifyEmail('developer@example.test', '123456'), { code: 'CSRF_REJECTED' });
  assert.equal(posts, 2);
});

test('confirmation links scrub tokens before use and accept only signup/email confirmations', () => {
  const cases = [
    ['?email=developer%40example.test', '#access_token=fabricated-access&refresh_token=fabricated-refresh&type=signup',
      { proof: { accessToken: 'fabricated-access', refreshToken: 'fabricated-refresh' } }],
    ['?token_hash=fabricated-hash&type=email', '', { proof: { tokenHash: 'fabricated-hash' } }],
  ];
  for (const [search, hash, expected] of cases) {
    let scrubbed;
    const result = readConfirmationLink({ pathname: '/verify-email', search, hash }, {
      state: null, replaceState: (state, title, url) => { scrubbed = url; },
    });
    assert.deepEqual(result, expected);
    assert.doesNotMatch(scrubbed, /token|fabricated|#/);
  }
  for (const hash of ['#error=access_denied&error_description=private', '#access_token=fabricated&refresh_token=fabricated&type=recovery']) {
    const result = readConfirmationLink({ pathname: '/verify-email', search: '', hash }, { replaceState() {} });
    assert.ok(result.error);
    assert.equal(result.proof, undefined);
    assert.doesNotMatch(result.error, /private|fabricated/);
  }
  let scrubbed;
  assert.ok(readConfirmationLink({ pathname: '/verify-email', search: '', hash: '#refresh_token=fabricated-orphan' },
    { replaceState: (state, title, url) => { scrubbed = url; } }).error);
  assert.equal(scrubbed, '/verify-email');
});

test('an ordinary verification visit neither consumes proofs nor changes the URL', () => {
  assert.equal(readConfirmationLink({ pathname: '/verify-email', search: '?email=developer%40example.test', hash: '' },
    { replaceState: () => assert.fail('No callback credentials to remove') }), null);
});
