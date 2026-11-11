import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/customerNotificationService';

/**
 * All notification data for the signed-in customer: list, unread count, mark one / all read.
 * Refreshes on page load, on navigation, when the tab regains focus, and when `refresh()` is called.
 *
 * TODO: backend — swap the focus refresh for a realtime subscription on the `notifications`
 * table (filtered by user_id) once it is enabled, and call `refresh()` from its handler.
 */
export default function useNotifications(ownerId) {
  const location = useLocation();
  const [state, setState] = useState({ items: [], unreadCount: 0, loaded: false, failed: false });
  const request = useRef(0);
  // Ids marked read here but not yet confirmed by the server. A refresh that started
  // before the "mark read" request finished must not flip them back to unread.
  const pendingRead = useRef(new Set());

  // Only the newest request may update state; older responses are ignored.
  const refresh = useCallback(() => {
    if (!ownerId) return Promise.resolve();
    const current = ++request.current;
    return Promise.resolve()
      .then(() => getNotifications(ownerId))
      .then(
        (result) => {
          if (current !== request.current) return;
          let unreadCount = result.unreadCount ?? 0;
          const items = (result.items ?? []).map((n) => {
            if (!pendingRead.current.has(n.id)) return n;
            if (n.read) {
              pendingRead.current.delete(n.id); // the server has caught up
              return n;
            }
            unreadCount = Math.max(0, unreadCount - 1);
            return { ...n, read: true };
          });
          setState({ items, unreadCount, loaded: true, failed: false });
        },
        () => {
          if (current === request.current) setState((s) => ({ ...s, loaded: true, failed: true }));
        },
      );
  }, [ownerId]);

  // Page load and every navigation.
  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  // "Live enough": pick up new order updates when the shopper comes back to the tab.
  useEffect(() => {
    if (!ownerId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ownerId, refresh]);

  const markRead = useCallback(
    (id) => {
      request.current++; // a response already in flight must not undo this
      pendingRead.current.add(id);
      setState((s) => {
        const target = s.items.find((n) => n.id === id);
        if (!target || target.read) return s;
        return { ...s, unreadCount: Math.max(0, s.unreadCount - 1), items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) };
      });
      markNotificationRead(id, ownerId).catch(() => {
        pendingRead.current.delete(id);
        refresh();
      });
    },
    [ownerId, refresh],
  );

  const markAllRead = useCallback(async () => {
    request.current++;
    const unreadIds = state.items.filter((n) => !n.read).map((n) => n.id);
    for (const id of unreadIds) pendingRead.current.add(id);
    setState((s) => ({ ...s, unreadCount: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    try {
      await markAllNotificationsRead(ownerId);
    } catch {
      for (const id of unreadIds) pendingRead.current.delete(id);
      refresh();
    }
  }, [ownerId, refresh, state.items]);

  return { ...state, refresh, markRead, markAllRead };
}
