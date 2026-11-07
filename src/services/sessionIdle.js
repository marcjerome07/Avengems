import { recordSessionActivity, checkIdleSession } from './sessionService';

const CACHE_KEY = 'avg_session_idle_v1';
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove'];
const BATCH_MS = 15000;
/** Browser cache synchronizes timing only; the server session record authorizes requests. */
export function startSessionIdle({ session, events = window, page = document, storage,
  activity = recordSessionActivity, inspect = checkIdleSession,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let current, timer, trailing, lastSend = -Infinity, lastInput = 0, dirty = false, busy = false, checking = false, stopped = false;
  if (storage === undefined) { try { storage = events.localStorage; } catch { /* Storage is optional. */ } }
  function cached() {
    try { return JSON.parse(storage.getItem(CACHE_KEY)); } catch { return null; }
  }
  function save(entry) { try { storage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch { /* Server remains authoritative. */ } }
  function arm() {
    cancel(timer);
    if (current) timer = schedule(check, Math.max(0, current.localDeadline - now()));
  }
  function absorb(meta) {
    if (stopped || !meta || !Number.isSafeInteger(meta.idleExpiresAt) || !Number.isSafeInteger(meta.serverNow)) return;
    const state = session.getSnapshot();
    if (state.status !== 'authenticated' || state.user?.session?.key !== meta.key) return;
    if (!current || current.key !== meta.key) {
      const old = cached();
      current = old?.key === meta.key && Number.isSafeInteger(old.localDeadline) && old.serverDeadline === meta.idleExpiresAt
        ? old : { key: meta.key, serverDeadline: -Infinity, localDeadline: 0 };
    }
    // Identical polling/refresh metadata must never rebase/extend the local timer.
    if (meta.idleExpiresAt > current.serverDeadline) {
      current = { key: meta.key, serverDeadline: meta.idleExpiresAt,
        localDeadline: now() + Math.max(0, Math.min(meta.idleExpiresAt, meta.absoluteExpiresAt) - meta.serverNow) };
      save(current);
    }
    arm();
  }
  function observe() {
    const state = session.getSnapshot();
    if (state.status === 'authenticated') absorb(state.user?.session);
    else {
      if (state.status === 'anonymous' && !state.idleExpired && current?.localDeadline <= now()) { session.expireIdle(); return; }
      cancel(timer); cancel(trailing); current = undefined; dirty = false;
    }
  }
  async function check() {
    if (checking || stopped || !current) return;
    const scope = current.key;
    checking = true;
    try {
      const meta = await inspect();
      if (stopped || current?.key !== scope) return;
      if (meta.key !== scope) { await session.restore(); return; }
      absorb(meta);
      // An authoritative idle check can correct client clock/suspension skew;
      // it never advances the server's idle deadline or reports user activity.
      if (current && meta.idleExpiresAt === current.serverDeadline && meta.idleExpiresAt > meta.serverNow) {
        current = { ...current, localDeadline: now() + Math.min(meta.idleExpiresAt, meta.absoluteExpiresAt) - meta.serverNow };
        save(current); arm();
      } else if (current && current.localDeadline <= now()) session.expireIdle();
    } catch (error) {
      if (stopped || current?.key !== scope) return;
      if (error.status === 401 || error.code === 'SESSION_IDLE_EXPIRED') session.expireIdle();
      else if (current.localDeadline <= now()) session.expireIdle(true);
      // Transient failures before the deadline do not discard authentication.
    } finally { checking = false; }
  }
  async function flush() {
    cancel(trailing); trailing = undefined;
    if (stopped || busy || !dirty || !current) return;
    if (now() - lastInput > 30000) { dirty = false; return; }
    const scope = current.key;
    dirty = false; busy = true; lastSend = now();
    try { absorb(await activity(Math.max(0, now() - lastInput))); }
    catch (error) {
      if (!stopped && current?.key === scope && error.code === 'SESSION_IDLE_EXPIRED') session.expireIdle();
      else if (!stopped && current?.key === scope && error.status === 401) {
        // Revalidate rather than trusting a stale activity response from another session.
        await session.restore();
      }
    } finally {
      busy = false;
      if (dirty && !stopped) trailing = schedule(flush, BATCH_MS);
    }
  }
  function input(event) {
    if (!event.isTrusted || page.visibilityState === 'hidden' || !current || session.getSnapshot().status !== 'authenticated') return;
    dirty = true; lastInput = now();
    if (!busy && now() - lastSend >= BATCH_MS) void flush();
    else if (!trailing) trailing = schedule(() => { trailing = undefined; void flush(); }, Math.max(0, BATCH_MS - (now() - lastSend)));
  }
  function sync(event) {
    if (event.key !== CACHE_KEY) return;
    const entry = cached();
    if (!current || !entry || entry.key !== current.key) { void session.restore(); return; }
    if (Number.isSafeInteger(entry.serverDeadline) && entry.serverDeadline > current.serverDeadline) {
      // Storage is a hint, never authority to extend a deadline.
      void inspect().then(absorb).catch(() => {});
    }
  }
  function visible() { if (page.visibilityState !== 'hidden' && current && current.localDeadline <= now()) void check(); }
  for (const name of INPUTS) page.addEventListener(name, input, { passive: true });
  events.addEventListener('storage', sync);
  events.addEventListener('focus', visible);
  page.addEventListener('visibilitychange', visible);
  const unsubscribe = session.subscribe(observe); observe();
  return () => {
    stopped = true; unsubscribe(); cancel(timer); cancel(trailing);
    for (const name of INPUTS) page.removeEventListener(name, input);
    events.removeEventListener('storage', sync); events.removeEventListener('focus', visible);
    page.removeEventListener('visibilitychange', visible);
  };
}
