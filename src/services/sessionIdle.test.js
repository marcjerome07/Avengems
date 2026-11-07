import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const { startSessionIdle } = await vite.ssrLoadModule('/src/services/sessionIdle.js');
const { createAuthSession } = await vite.ssrLoadModule('/src/services/authSession.js');
const minute = 60000, idle = 20 * minute;
async function drain() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function clock() {
  let time = 0, next = 0; const tasks = new Map();
  return { now: () => time, schedule: (fn, ms) => { const id = ++next; tasks.set(id, { at: time + ms, fn }); return id; },
    cancel: (id) => tasks.delete(id), async advance(ms) {
      const end = time + ms; let count = 0;
      for (;;) {
        const task = [...tasks].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!task) break;
        assert.ok(++count < 1000, 'No busy expiry loop');
        time = task[1].at; tasks.delete(task[0]); task[1].fn(); await drain();
      }
      time = end; await drain();
    } };
}
function target() {
  const listeners = new Map();
  return { visibilityState: 'visible', addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    emit(name, event = {}) { for (const listener of listeners.get(name) ?? []) listener(event); } };
}
function environment(role = 'customer') {
  const time = clock(), rows = new Map(), windows = new Set(), stops = [];
  let deadline = idle, offline = false, activityCalls = 0, inspections = 0, logoutCalls = 0;
  const expired = () => Object.assign(new Error('Idle expired'), { status: 401, code: 'SESSION_IDLE_EXPIRED' });
  const metadata = () => ({ key: 'public-session-a', serverNow: time.now(), idleExpiresAt: deadline, absoluteExpiresAt: 12 * 60 * minute });
  function available() { if (offline) throw Object.assign(new Error('Offline'), { code: 'NETWORK_ERROR' }); if (time.now() >= deadline) throw expired(); }
  async function tab() {
    const events = target(), page = target(); windows.add(events);
    const storage = { getItem: (key) => rows.get(key) ?? null, setItem(key, value) {
      rows.set(key, value); for (const other of windows) if (other !== events) other.emit('storage', { key });
    } };
    const service = { getCurrentUser: async () => { available(); return { id: 'a', role, verified: true, name: 'Disposable', session: metadata() }; },
      logout: async () => { logoutCalls++; throw new Error('Logout network failure'); } };
    const session = createAuthSession(service); await session.restore();
    const stop = startSessionIdle({ session, events, page, storage, ...time,
      activity: async (age = 0) => { activityCalls++; available(); deadline = Math.min(Math.max(deadline, time.now() + idle - age), 12 * 60 * minute); return metadata(); },
      inspect: async () => { inspections++; available(); return metadata(); } });
    stops.push(stop); return { session, page, events, stop, storage };
  }
  return { time, tab, rows, stop: () => stops.forEach((stop) => stop()),
    offline: (value) => { offline = value; }, get deadline() { return deadline; },
    get activityCalls() { return activityCalls; }, get inspections() { return inspections; }, get logoutCalls() { return logoutCalls; } };
}

test('both roles remain authenticated at 19 minutes; polling/focus do not reset the 20-minute deadline', async () => {
  for (const role of ['customer', 'admin']) {
    const env = environment(role), tab = await env.tab();
    await env.time.advance(19 * minute); await tab.session.restore(); tab.events.emit('focus'); tab.page.emit('visibilitychange');
    assert.equal(tab.session.getSnapshot().status, 'authenticated'); assert.equal(env.deadline, idle); assert.equal(env.activityCalls, 0);
    await env.time.advance(minute);
    assert.equal(tab.session.getSnapshot().status, 'anonymous'); assert.equal(tab.session.getSnapshot().idleExpired, true);
    assert.equal(env.logoutCalls, 0, 'An old timer must not revoke another tab via general logout'); env.stop();
  }
});

test('real input extends the server-backed deadline, synthetic input and network responses do not', async () => {
  const env = environment(), tab = await env.tab();
  await env.time.advance(19 * minute); tab.page.emit('keydown', { isTrusted: false }); await drain(); assert.equal(env.activityCalls, 0);
  tab.page.emit('keydown', { isTrusted: true }); await drain(); assert.equal(env.activityCalls, 1); assert.equal(env.deadline, 39 * minute);
  await env.time.advance(19 * minute); await tab.session.restore(); assert.equal(tab.session.getSnapshot().status, 'authenticated');
  await env.time.advance(minute); assert.equal(tab.session.getSnapshot().idleExpired, true); env.stop();
});

test('reload and tabs preserve the shared deadline; visibility switching cannot bypass it', async () => {
  const env = environment('admin'), a = await env.tab(), b = await env.tab();
  await env.time.advance(19 * minute); a.page.emit('pointerdown', { isTrusted: true }); await drain();
  await env.time.advance(minute); assert.equal(b.session.getSnapshot().status, 'authenticated');
  a.stop(); const reloaded = await env.tab();
  await env.time.advance(18 * minute); b.page.visibilityState = 'hidden'; b.events.emit('focus');
  b.page.visibilityState = 'visible'; b.page.emit('visibilitychange');
  assert.equal(env.activityCalls, 1); assert.equal(env.deadline, 39 * minute);
  await env.time.advance(minute); assert.equal(b.session.getSnapshot().idleExpired, true); assert.equal(reloaded.session.getSnapshot().idleExpired, true); env.stop();
});

test('temporary network errors preserve the verified user before expiry; offline expiration is explicitly unconfirmed', async () => {
  const env = environment(), tab = await env.tab();
  await env.time.advance(minute); env.offline(true); await tab.session.restore();
  assert.equal(tab.session.getSnapshot().status, 'authenticated'); assert.equal(tab.session.getSnapshot().error.code, 'NETWORK_ERROR');
  env.offline(false); await tab.session.restore(); assert.equal(tab.session.getSnapshot().error, null);
  await env.time.advance(18 * minute); env.offline(true); await env.time.advance(minute);
  assert.equal(tab.session.getSnapshot().status, 'anonymous'); assert.equal(tab.session.getSnapshot().expiryUnconfirmed, true);
  assert.equal(env.logoutCalls, 0); env.stop();
});

test('forged cached deadlines cannot reset a reload or extend the server-confirmed timer', async () => {
  const env = environment(), tab = await env.tab();
  env.rows.set('avg_session_idle_v1', JSON.stringify({ key: 'public-session-a', serverDeadline: 999999999, localDeadline: 999999999 }));
  tab.events.emit('storage', { key: 'avg_session_idle_v1' }); await drain();
  tab.stop(); const reloaded = await env.tab(); await env.time.advance(idle);
  assert.equal(reloaded.session.getSnapshot().idleExpired, true); assert.equal(env.activityCalls, 0); env.stop();
});

test('only a pending real input may produce a trailing coalesced activity report; cleanup removes timers/listeners', async () => {
  const env = environment(), tab = await env.tab();
  tab.page.emit('pointerdown', { isTrusted: true }); await drain();
  await env.time.advance(1000); tab.page.emit('keydown', { isTrusted: true });
  await env.time.advance(14000); assert.equal(env.activityCalls, 2);
  assert.equal(env.deadline, idle + 1000, 'Delayed report uses the real input age, not background timer completion');
  await env.time.advance(minute); assert.equal(env.activityCalls, 2);
  tab.stop(); tab.page.emit('keydown', { isTrusted: true }); await env.time.advance(idle);
  assert.equal(env.activityCalls, 2); assert.equal(env.inspections, 0); env.stop();
});
