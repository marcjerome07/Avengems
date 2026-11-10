import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { getNotifications, markAllNotificationsRead, markNotificationRead, relativeTime } from '../../services/customerNotificationService';

/**
 * Header bell for signed-in customers. Loads on page load, on navigation and when opened;
 * it never polls or makes background requests.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const ownerId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ items: [], unreadCount: 0, loaded: false, failed: false });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const request = useRef(0);

  // Only the newest request may update the bell; older responses are ignored.
  const fetchLatest = useCallback(() => {
    const current = ++request.current;
    return Promise.resolve()
      .then(() => getNotifications(ownerId))
      .then(
        (result) => { if (current === request.current) setState({ items: result.items ?? [], unreadCount: result.unreadCount ?? 0, loaded: true, failed: false }); },
        () => { if (current === request.current) setState((s) => ({ ...s, loaded: true, failed: true })); },
      );
  }, [ownerId]);
  const load = useCallback(() => { if (ownerId) fetchLatest(); }, [ownerId, fetchLatest]);

  // Page load and every navigation.
  useEffect(() => {
    if (ownerId) fetchLatest();
  }, [ownerId, fetchLatest, location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    setOpen((value) => !value);
    if (!open) load();
  }

  function openNotification(item) {
    setOpen(false);
    if (!item.read) {
      request.current++; // a response already in flight must not undo this
      setState((s) => ({ ...s, unreadCount: Math.max(0, s.unreadCount - 1),
        items: s.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)) }));
      markNotificationRead(item.id, ownerId).catch(() => load());
    }
    navigate(`/account/orders/${encodeURIComponent(item.orderId)}`);
  }

  async function markAll() {
    request.current++;
    setState((s) => ({ ...s, unreadCount: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    try { await markAllNotificationsRead(ownerId); } catch { load(); }
  }

  if (!ownerId) return null;
  const { items, unreadCount, loaded, failed } = state;
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div className="notif-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`nav-icon ${open ? 'is-active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notif-dropdown"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={toggle}
      >
        <Bell size={21} strokeWidth={1.4} />
        {unreadCount > 0 && <span className="nav-icon__badge" aria-hidden="true">{badge}</span>}
      </button>
      {open && (
        <div id="notif-dropdown" className="notif-menu__panel" role="region" aria-label="Notifications">
          <div className="notif-menu__head">
            <p className="notif-menu__title">Notifications</p>
            <button type="button" className="notif-menu__all" onClick={markAll} disabled={!unreadCount}>Mark all as read</button>
          </div>
          {failed && !items.length ? (
            <p className="notif-menu__empty">
              Notifications couldn&apos;t be loaded.{' '}
              <button type="button" className="notif-menu__retry" onClick={load}>Retry</button>
            </p>
          ) : !loaded ? (
            <p className="notif-menu__empty" role="status">Loading…</p>
          ) : !items.length ? (
            <p className="notif-menu__empty">No notifications yet. Order updates will appear here.</p>
          ) : (
            <ul role="list" className="notif-menu__list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`notif-item ${item.read ? '' : 'is-unread'}`} onClick={() => openNotification(item)}>
                    <span className="notif-item__dot" aria-hidden="true" />
                    <span className="notif-item__text">
                      <span className="notif-item__title">{item.title}{!item.read && <span className="visually-hidden"> (unread)</span>}</span>
                      <span className="notif-item__body">{item.body}</span>
                      <time className="notif-item__time" dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('en-PH')}>
                        {relativeTime(item.createdAt)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/account/orders" className="notif-menu__footer" onClick={() => setOpen(false)}>View all orders</Link>
        </div>
      )}
    </div>
  );
}
