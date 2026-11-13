import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../ui/Button';
import { getPayment, startPayment, checkPayment, cancelPayment, paymentLabel, paymentMethods } from '../../services/paymentService';
import { config } from '../../data/config';

// One plain-language line under the status, per payment state.
const STATUS_HELP = {
  created: 'Pay on Xendit’s secure page. This page updates by itself once your payment is confirmed.',
  pending: 'Pay on Xendit’s secure page. This page updates by itself once your payment is confirmed.',
  creating: 'We’re setting up your payment with Xendit.',
  unknown: 'We’re confirming your payment with Xendit.',
  review: 'Our team is checking this payment.',
  paid: 'Thank you! Your payment was received.',
  failed: 'This payment didn’t go through.',
  expired: 'This payment expired before it was completed, so the order was cancelled. You can place a new order anytime.',
  cancelled: 'This payment was cancelled, so the order was cancelled too.',
  refunded: 'This payment was refunded.',
};

export function PaymentStatus({ order }) {
  return <span>{paymentLabel(order)}</span>;
}

export default function PaymentActions({ order, ownerId, onChanged }) {
  const [params] = useSearchParams();
  const returned = params.has('payment_return');
  const [payment, setPayment] = useState(order.payment);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [capability, setCapability] = useState(null);
  const capabilityKey = `${ownerId}:${order.id}:${order.paymentMethod}`;
  const canStart = capability?.key === capabilityKey && capability.allowed;
  const lock = useRef(false);
  const managed = Boolean(order.payment);
  useEffect(() => {
    if (!managed) return undefined;
    let active = true;
    void paymentMethods().then((result) => {
      if (active) setCapability({ key: capabilityKey, allowed: result.online === true && result.methods?.includes(order.paymentMethod) });
    }).catch(() => {});
    const load = () => getPayment(order.id, ownerId).then((result) => {
      if (active) setPayment(result.payment);
    }).catch((err) => { if (active) setError(err.message); });
    // Redirects are not proof. One protected check reads trusted provider state.
    void (returned ? checkPayment(order.id, ownerId).then((result) => {
      if (active) setPayment(result.payment);
    }).catch((err) => { if (active) setError(err.message); }) : load());
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [order.id, order.paymentMethod, managed, ownerId, returned, capabilityKey]);
  async function act(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await operation(order.id, ownerId);
      setPayment(result.payment);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else onChanged?.();
    } catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!order.payment) return <p>Payment: <PaymentStatus order={order} /></p>;
  const status = payment?.status;
  const awaiting = ['created', 'pending'].includes(status);
  const settled = ['paid', 'expired', 'cancelled', 'refunded'].includes(status);
  return <section className="panel" aria-label="Payment status">
    <p role="status">Payment: {paymentLabel({ ...order, payment })}</p>
    <p>{STATUS_HELP[status] ?? STATUS_HELP.pending}</p>
    {payment?.lastAttemptStatus === 'FAILED' && status === 'pending' && <p>Your last attempt didn’t go through. You can try again on the same payment page.</p>}
    {['creating', 'unknown', 'review'].includes(status) && <p>Please don’t pay again. If this doesn’t update soon, email us at{' '}
      <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a> with your order number.</p>}
    {error && <p role="alert">{error}</p>}
    {awaiting && <Button loading={busy} disabled={!canStart} onClick={() => act(startPayment)}>Continue payment</Button>}
    {!settled && <Button variant="outline" disabled={busy} onClick={() => act(checkPayment)}>Refresh payment status</Button>}
    {awaiting && <Button variant="ghost" disabled={busy} onClick={() => act(cancelPayment)}>Cancel payment</Button>}
    <p className="muted">Test mode: no real money is charged.</p>
  </section>;
}
