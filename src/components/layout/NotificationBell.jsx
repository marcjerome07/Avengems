import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import useNotifications from '../../hooks/useNotifications';
import { relativeTime } from '../../services/customerNotificationService';

/** Header bell for signed-in customers. Data lives in useNotifications. */
export default function NotificationBell() {
  const { user } = useAuth();
  const ownerId = user?.id;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, loaded, failed, refresh, markRead, markAllRead } = useNotifications(ownerId);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    setOpen((value) => !value);
    if (!open) refresh();
  }

  function openNotification(item) {
    setOpen(false);
    if (!item.read) markRead(item.id);
    if (item.orderId) navigate(`/account/orders/${encodeURIComponent(item.orderId)}`);
  }

  if (!ownerId) return null;
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
        {unreadCount > 0 && (
          <span className="nav-icon__badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div id="notif-dropdown" className="notif-menu__panel" role="region" aria-label="Notifications">
          <div className="notif-menu__head">
            <p className="notif-menu__title">Notifications</p>
            <button type="button" className="notif-menu__all" onClick={markAllRead} disabled={!unreadCount}>
              Mark all as read
            </button>
          </div>
          {failed && !items.length ? (
            <p className="notif-menu__empty">
              Notifications couldn&apos;t be loaded.{' '}
              <button type="button" className="notif-menu__retry" onClick={refresh}>
                Retry
              </button>
            </p>
          ) : !loaded ? (
            <p className="notif-menu__empty" role="status">
              Loading…
            </p>
          ) : !items.length ? (
            <div className="notif-menu__empty notif-menu__empty--caught-up">
              <BellOff size={22} strokeWidth={1.3} aria-hidden="true" />
              <p className="notif-menu__empty-title">You&apos;re all caught up.</p>
              <p>Order updates will appear here.</p>
            </div>
          ) : (
            <ul role="list" className="notif-menu__list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`notif-item ${item.read ? '' : 'is-unread'}`} onClick={() => openNotification(item)}>
                    <span className="notif-item__dot" aria-hidden="true" />
                    <span className="notif-item__text">
                      <span className="notif-item__title">
                        {item.title}
                        {!item.read && <span className="visually-hidden"> (unread)</span>}
                      </span>
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
          <Link to="/account/orders" className="notif-menu__footer" onClick={() => setOpen(false)}>
            View all orders
          </Link>
        </div>
      )}
    </div>
  );
}
