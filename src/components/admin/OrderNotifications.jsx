import { useState } from 'react';
import { Mail, RotateCw } from 'lucide-react';
import Button from '../ui/Button';
import useServiceData from '../../hooks/useServiceData';
import { getOrderNotifications, resendOrderNotification } from '../../services/adminService';

const STATUS_LABEL = { Pending: 'Order placed', Processing: 'Processing', Shipped: 'Shipped', Delivered: 'Delivered', Cancelled: 'Cancelled' };
const when = (value) => (value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Email history for one order, plus the admin-only resend action. */
export default function OrderNotifications({ orderId, onMessage }) {
  const { data: items, error, reload: load } = useServiceData(() => getOrderNotifications(orderId), [orderId]);
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const sent = await resendOrderNotification(orderId);
      onMessage?.(sent.channel === 'console' ? 'Email logged to the server console (mail is disabled).' : `Email resent to ${sent.recipient}.`, 'success');
    } catch (err) { onMessage?.(err.message, 'error'); }
    finally { setSending(false); load(); }
  }

  return (
    <section className="order-mail" aria-labelledby={`mail-${orderId}`}>
      <div className="order-mail__head">
        <h3 id={`mail-${orderId}`} className="order-mail__title"><Mail size={16} strokeWidth={1.5} aria-hidden="true" /> Customer emails</h3>
        <Button size="sm" variant="outline" icon={RotateCw} loading={sending} disabled={sending || Boolean(error)} onClick={resend}>
          Resend email
        </Button>
      </div>
      <p className="order-mail__hint">Resend sends the email for the order&apos;s current status to the customer.</p>
      {error ? (
        <p className="field__error" role="alert">{error.message} <button type="button" className="text-link" onClick={load}>Retry</button></p>
      ) : !items ? (
        <p role="status" className="order-mail__hint">Loading email history…</p>
      ) : !items.length ? (
        <p className="order-mail__hint">No emails recorded for this order yet.</p>
      ) : (
        <ul className="order-mail__list">
          {items.map((n) => (
            <li key={n.id} className="order-mail__row">
              <span className="order-mail__what">
                <strong>{STATUS_LABEL[n.status] ?? n.status}</strong>
                <span>{n.kind === 'store' ? 'Store alert · ' : ''}{n.recipient}</span>
              </span>
              <span className={`order-mail__state ${n.state === 'sent' ? 'is-sent' : ['failed', 'unconfirmed'].includes(n.state) ? 'is-failed' : ''}`}>
                {n.state === 'sent' ? `Sent ${when(n.sentAt)}${n.channel === 'console' ? ' (console only)' : ''}`
                  : n.state === 'failed' ? 'Failed'
                    : n.state === 'unconfirmed' ? 'Not confirmed: may have been sent. Check with the customer before resending.'
                      : n.state === 'sending' ? 'Sending…' : 'Queued'}
                {n.attempts > 1 && ` · ${n.attempts} attempts`}
                {n.error && <span className="order-mail__error">{n.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
