import { useState } from 'react';
import { XCircle } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { useToast } from '../../context/useToast';
import { cancelCustomerOrder } from '../../services/orderService';
import { orderReference } from '../../utils/orderReference';
import { saveCancellationReason } from '../../services/cancellationReasons';
import { config } from '../../data/config';

const REASONS = [
  { value: '', label: 'Choose a reason (optional)' },
  { value: 'Changed my mind', label: 'Changed my mind' },
  { value: 'Ordered by mistake', label: 'Ordered by mistake' },
  { value: 'Found a better price', label: 'Found a better price' },
  { value: 'Other', label: 'Other' },
];

/**
 * Shopee-style rule: a customer can cancel any order that is still Pending (not yet being
 * prepared). Once it is Processing, Shipped or Delivered the button is grayed out.
 * The server still has the final say; if it refuses, the dialog shows why.
 */
function canCustomerCancel(order) {
  return order.status === 'Pending';
}

/**
 * "Cancel order" button + confirmation dialog. Shown for every order except cancelled ones:
 * clickable while Pending, grayed out once the order is Processing, Shipped or Delivered.
 */
export default function CancelOrderAction({ order, ownerId, onCancelled, onRefresh, size = 'sm' }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  if (order.status === 'Cancelled') return null;
  const enabled = canCustomerCancel(order);
  const hintId = `cancel-hint-${order.id}`;
  const hint = 'Only pending orders can be cancelled.';

  function openDialog() {
    setReason('');
    setDetails('');
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!busy) setOpen(false);
  }

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    let updated;
    try {
      // TODO: backend — the customer cancel route accepts an empty body only, so the reason is
      // saved in this browser (services/cancellationReasons.js) instead of being sent.
      updated = await cancelCustomerOrder(order.id, ownerId);
    } catch (failure) {
      setError(failure);
      setBusy(false);
      return;
    }
    saveCancellationReason(ownerId, order.id, { reason, details: reason === 'Other' ? details : '' });
    setBusy(false);
    setOpen(false);
    showToast(`Order ${orderReference(order)} was cancelled. You'll find it under the Cancelled tab.`, { type: 'success' });
    await onCancelled?.(updated);
  }

  return (
    <>
      {/* The span carries the tooltip because a disabled button can't be hovered */}
      <span className="cancel-order" title={enabled ? undefined : hint}>
        <Button
          variant="danger-outline"
          size={size}
          icon={XCircle}
          onClick={openDialog}
          disabled={!enabled}
          aria-describedby={enabled ? undefined : hintId}
          aria-label={`Cancel order ${orderReference(order)}`}
        >
          Cancel order
        </Button>
        {!enabled && (
          <span id={hintId} className="visually-hidden">
            {hint}
          </span>
        )}
      </span>
      <Modal
        open={open}
        onClose={close}
        title="Cancel this order?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Keep order
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmCancel}>
              Cancel order
            </Button>
          </>
        }
      >
        <div className="cancel-dialog">
          <p className="muted">
            Order <strong>{orderReference(order)}</strong> will be cancelled and its items returned to stock. This can’t be undone.
          </p>
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} />
          {reason === 'Other' && (
            <div className="field">
              <label className="field__label" htmlFor={`cancel-details-${order.id}`}>
                Tell us more <span className="field__optional">(optional)</span>
              </label>
              <textarea
                id={`cancel-details-${order.id}`}
                className="field__input"
                rows={3}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          )}
          {error?.code === 'CUSTOMER_CANCELLATION_DISABLED' ? (
            // Switched off on the server: refreshing won't help, so point to the store instead.
            <div className="cancel-dialog__error" role="alert">
              <p>
                Online cancellation isn’t available right now. To cancel this order, email us at{' '}
                <a href={`mailto:${config.contactEmail}?subject=${encodeURIComponent(`Cancel order ${orderReference(order)}`)}`}>
                  {config.contactEmail}
                </a>{' '}
                with your order number.
              </p>
            </div>
          ) : error && (
            <div className="cancel-dialog__error" role="alert">
              <p>{error.message} Check the latest order status before trying again.</p>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); onRefresh(); }}>
                  Refresh order status
                </Button>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
