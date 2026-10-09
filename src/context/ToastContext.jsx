import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastViewport from '../components/ui/Toast';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 3800;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const lastShown = useRef({ message: '', at: 0 });

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  /**
   * showToast('Added to your collection.', { type: 'success' | 'error' | 'info', action: { label, to } })
   */
  const showToast = useCallback(
    (message, { type = 'success', duration = DEFAULT_DURATION, action } = {}) => {
      // Ignore exact duplicates fired within 600ms (e.g. double effects in StrictMode).
      const now = Date.now();
      if (lastShown.current.message === message && now - lastShown.current.at < 600) return;
      lastShown.current = { message, at: now };

      const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-3), { id, message, type, action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
