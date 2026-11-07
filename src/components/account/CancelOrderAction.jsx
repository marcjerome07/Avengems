import { useState } from 'react';
import Button from '../ui/Button';
import { useConfirm } from '../../context/useConfirm';
import { cancelCustomerOrder } from '../../services/orderService';

export default function CancelOrderAction({ order, ownerId, onCancelled, onRefresh }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!['Pending', 'Processing'].includes(order.status)) return null;
  const permitted = order.canCancel === true;
  function requestCancel() {
    if (!permitted) return;
    confirm({
      title: 'Cancel this order?',
      message: 'This action cancels the order and restores its inventory together. Shipped orders cannot be cancelled.',
      confirmLabel: 'Confirm cancellation',
      cancelLabel: 'Keep order',
      danger: true,
      onConfirm: async () => {
        setBusy(true); setError(null);
        let updated;
        try { updated = await cancelCustomerOrder(order.id, ownerId); }
        catch (failure) { setError(failure); return; }
        finally { setBusy(false); }
        await onCancelled(updated);
      },
    });
  }
  return <section className="panel" aria-label="Cancel order">
    <Button variant="danger" disabled={!permitted || busy} onClick={requestCancel}>Cancel Order</Button>
    {!permitted && <p className="muted">Online cancellation is unavailable for this order.</p>}
    {error && <div role="alert"><p>{error.message} Check the latest order status before trying again.</p>
      <Button variant="outline" onClick={onRefresh}>Refresh order status</Button></div>}
  </section>;
}
