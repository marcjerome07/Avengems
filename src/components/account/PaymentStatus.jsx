import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../ui/Button';
import { getPayment, startPayment, checkPayment, cancelPayment, paymentLabel, paymentMethods } from '../../services/paymentService';

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
  return <section className="panel" aria-label="Payment status">
    <p role="status">Payment: {paymentLabel({ ...order, payment })}</p>
    <p>Xendit Test Mode. Returning from checkout does not confirm payment.</p>
    {payment?.lastAttemptStatus === 'FAILED' && status === 'pending' && <p>The last attempt failed. You can retry in the same hosted checkout.</p>}
    {['creating','unknown','review'].includes(status) && <p>Keep this order. Do not create a replacement payment; contact support if verification remains pending.</p>}
    {error && <p role="alert">{error}</p>}
    {['created','pending'].includes(status) && <Button loading={busy} disabled={!canStart} onClick={() => act(startPayment)}>Continue to Xendit</Button>}
    <Button variant="outline" disabled={busy} onClick={() => act(checkPayment)}>Check payment</Button>
    {['created','pending'].includes(status) && <Button variant="ghost" disabled={busy} onClick={() => act(cancelPayment)}>Cancel test payment</Button>}
  </section>;
}
