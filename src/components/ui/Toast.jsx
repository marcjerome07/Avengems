import { Link } from 'react-router-dom';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import './Toast.css';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

export default function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] ?? Info;
        return (
          <div key={toast.id} className={`toast toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <Icon className="toast__icon" size={20} strokeWidth={1.6} aria-hidden="true" />
            <p className="toast__message">{toast.message}</p>
            {toast.action && (
              <Link to={toast.action.to} className="toast__action" onClick={() => onDismiss(toast.id)}>
                {toast.action.label}
              </Link>
            )}
            <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
              <X size={16} strokeWidth={1.6} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
