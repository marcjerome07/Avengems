import { useRef, useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { cancelCustomerOrder } from '../../services/orderService';

export default function CancelOrderAction({ order, ownerId, onCancelled, onRefresh }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  if (!['Pending', 'Processing'].includes(order.status)) return null;
  const permitted = order.canCancel === true;
  async function confirm() {
    if (pending.current || !permitted) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const updated = await cancelCustomerOrder(order.id, ownerId);
      setConfirming(false); await onCancelled(updated);
    } catch (failure) { setConfirming(false); setError(failure); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="panel" aria-label="Cancel order">
    <Button variant="danger" disabled={!permitted || busy} onClick={() => setConfirming(true)}>Cancel Order</Button>
    {!permitted && <p className="muted">Online cancellation is unavailable for this order.</p>}
    {error && <div role="alert"><p>{error.message} Check the latest order status before trying again.</p>
      <Button variant="outline" onClick={onRefresh}>Refresh order status</Button></div>}
    <Modal open={confirming && permitted} title="Cancel this order?" onClose={() => { if (!busy) setConfirming(false); }}
      footer={<><Button disabled={busy} onClick={() => setConfirming(false)}>Keep order</Button>
        <Button variant="danger" loading={busy} onClick={confirm}>Confirm cancellation</Button></>}>
      <p>This action cancels the order and restores its inventory together. Shipped orders cannot be cancelled.</p>
    </Modal>
  </section>;
}
