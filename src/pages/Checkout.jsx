import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Info,
  Lock,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import Stepper from '../components/ui/Stepper';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { QuoteTotals, MiniItems } from '../components/cart/OrderSummary';
import PaymentMethods from '../components/cart/PaymentMethods';
import { useCart } from '../context/useCart';
import useCartQuote from '../hooks/useCartQuote';
import { selectedCartItems } from '../services/cartService';
import { useAuth } from '../context/useAuth';
import { useConfirm } from '../context/useConfirm';
import { useToast } from '../context/useToast';
import { placeOrder, orderRequest, PAYMENT_LABELS } from '../services/orderService';
import { getAddresses } from '../services/authService';
import { pendingCheckout, beginCheckout, finishCheckout, definitiveCheckoutFailure, confirmCheckoutAttempt } from '../services/checkoutAttempts';
import { authSession } from '../services/authSession';
import { paymentMethods, startPayment } from '../services/paymentService';
import { formatPrice } from '../utils/formatPrice';
import {
  runValidators,
  validateName,
  validateEmail,
  validatePhone,
  validateRequired,
  validatePostalCode,
  formatPhone,
} from '../utils/validators';
import './Checkout.css';

const STEPS = ['Information', 'Shipping', 'Payment', 'Review'];

const SCHEMAS = {
  0: {
    fullName: validateName,
    email: validateEmail,
    phone: (v) => validatePhone(v),
  },
  1: {
    address: (v) => validateRequired(v, 'Address'),
    city: (v) => validateRequired(v, 'City'),
    province: (v) => validateRequired(v, 'Province'),
    postalCode: validatePostalCode,
  },
  2: {
    paymentMethod: (v) => (v ? '' : 'Please choose a payment method.'),
  },
};

export default function Checkout() {
  const cart = useCart();
  const { items, completeCheckout } = cart;
  const selectedItems = selectedCartItems(items);
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const submitting = useRef(false);
  const [pending, setPending] = useState(() => {
    try { return pendingCheckout(user.id); } catch (error) { return { invalid: true, message: error.message }; }
  });
  // A retry belongs to its saved request, even if the shopper later changes the
  // cart selection. Never quote/display a different basket for that retry.
  const pendingQuote = useCartQuote(pending?.request?.items ?? []);
  const { totals, quotedItems, quoteLoading, quoteError, reloadQuote } = pending ? {
    totals: pendingQuote.quote?.totals ?? null, quotedItems: pendingQuote.quote?.items ?? null,
    quoteLoading: pendingQuote.loading, quoteError: pendingQuote.error, reloadQuote: pendingQuote.reload,
  } : cart;
  const [placementError, setPlacementError] = useState(null);
  const [savedAddressId, setSavedAddressId] = useState(pending?.request?.shipping?.addressId ?? '');
  const ready = Boolean(totals) && !quoteLoading && !quoteError && (Boolean(pending) || selectedItems.length > 0);
  const displayItems = quotedItems ?? (pending?.request?.items ? pending.request.items.map((line) => {
    const saved = items.find((item) => item.productId === line.productId && (item.color ?? null) === line.color && (item.size ?? null) === line.size);
    return { ...saved, ...line, name: saved?.name ?? line.productId,
      lineId: saved?.lineId ?? JSON.stringify([line.productId, line.color, line.size]) };
  }) : selectedItems);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    fullName: pending?.request?.customer?.name ?? user?.name ?? '',
    email: pending?.request?.customer?.email ?? user?.email ?? '',
    phone: pending?.request?.customer?.phone ?? user?.phone ?? '',
    address: pending?.request?.shipping?.address ?? '',
    city: pending?.request?.shipping?.city ?? '',
    province: pending?.request?.shipping?.province ?? '',
    postalCode: pending?.request?.shipping?.postalCode ?? '',
    paymentMethod: pending?.request?.paymentMethod ?? '',
  });
  const [errors, setErrors] = useState({});
  const [addresses, setAddresses] = useState([]);
  const [addressError, setAddressError] = useState(null);
  const [addressVersion, setAddressVersion] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [methods, setMethods] = useState(['cod']);
  useEffect(() => {
    let active = true;
    paymentMethods().then((result) => { if (active && Array.isArray(result.methods)) setMethods(result.methods); }).catch(() => {});
    return () => { active = false; };
  }, [user.id]);

  // Pre-fill shipping from the default saved address.
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    getAddresses(user.id)
      .then((list) => {
        if (!active) return;
        setAddressError(null);
        setAddresses(list);
        const def = list.find((a) => a.isDefault);
        if (def) {
          setValues((v) => ({
            ...v,
            phone: v.phone || def.phone,
            address: v.address || def.address,
            city: v.city || def.city,
            province: v.province || def.province,
            postalCode: v.postalCode || def.postalCode,
          }));
        }
      })
      .catch((error) => { if (active) setAddressError(error); });
    return () => {
      active = false;
    };
  }, [user?.id, addressVersion]);

  function setField(name, value) {
    if (['address', 'city', 'province', 'postalCode'].includes(name)) setSavedAddressId('');
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  }

  function field(name) {
    return {
      name,
      value: values[name],
      error: errors[name],
      onChange: (e) => setField(name, e.target.value),
    };
  }

  function validateStep(s) {
    const result = runValidators(values, SCHEMAS[s] ?? {});
    if (s === 2 && !methods.includes(values.paymentMethod)) result.paymentMethod = 'Choose an available payment method.';
    setErrors(result);
    if (Object.keys(result).length) {
      // Move focus to the first invalid field for keyboard and screen reader users.
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return false;
    }
    return true;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  function goTo(s) {
    setErrors({});
    setStep(s);
  }

  function applyAddress(id) {
    setSavedAddressId(id);
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    setValues((v) => ({ ...v, address: a.address, city: a.city, province: a.province, postalCode: a.postalCode }));
    setErrors({});
  }

  async function handlePlaceOrder() {
    if (submitting.current || pending?.invalid) return;
    if (!pending && !ready) return;
    // Re-check every step before submitting.
    for (let s = 0; !pending && s < 3; s += 1) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    // Only a new order asks; retrying a pending order re-sends one the user already confirmed.
    if (!pending) {
      const ok = await confirm({
        title: 'Place this order?',
        message: `Your total is ${formatPrice(totals.total)}, paid by ${PAYMENT_LABELS[values.paymentMethod]}.`,
        confirmLabel: 'Place order',
        cancelLabel: 'Go back',
      });
      if (!ok) return;
    }
    submitting.current = true;
    setPlacing(true);
    setPlacementError(null);
    try {
      // Online payment details are collected only on Xendit hosted checkout.
      const attempt = pending ?? beginCheckout(user.id, orderRequest({
        items: selectedItems,
        customer: { name: values.fullName.trim(), email: values.email.trim(), phone: values.phone.trim() },
        shipping: savedAddressId ? { addressId: savedAddressId } : {
          address: values.address.trim(),
          city: values.city.trim(),
          province: values.province.trim(),
          postalCode: values.postalCode.trim(),
        },
        paymentMethod: values.paymentMethod,
      }));
      if (attempt.owner !== user.id) throw new Error('Sign in to the original account before retrying this order.');
      setPending(attempt);
      const order = await confirmCheckoutAttempt(attempt, { placeOrder, completeCart: completeCheckout,
        isCurrent: () => authSession.getSnapshot().status === 'authenticated' && authSession.getSnapshot().user?.id === attempt.owner });
      setPending(null);
      navigate(`/order-confirmation/${order.id}`, { replace: true });
      if (order.paymentMethod !== 'cod') {
        try {
          const result = await startPayment(order.id, attempt.owner);
          if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
          else showToast('Order saved. Check its payment status before trying again.', { type: 'info' });
        } catch (error) { showToast(error.message, { type: 'error' }); }
      } else showToast('Order placed. Thank you!', { type: 'success' });
    } catch (err) {
      if (definitiveCheckoutFailure(err)) { finishCheckout(user.id); setPending(null); }
      if (['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'INVALID_CUSTOMIZATION'].includes(err.code)) reloadQuote();
      setPlacementError(err);
      showToast(err.message ?? 'We could not place your order. Please try again.', { type: 'error' });
    } finally { submitting.current = false; setPlacing(false); }
  }

  if (!selectedItems.length && !pending) {
    return (
      <PageContainer title="Checkout">
        <PageHeader title="Checkout" />
        <EmptyState icon={ShoppingBag} title={items.length ? 'No items selected' : 'Your cart is empty'}
          message={items.length ? 'Select at least one cart item before checking out.' : 'Add a piece or two before checking out.'}>
          <Button to={items.length ? '/cart' : '/shop'}>{items.length ? 'Select cart items' : 'Shop the collection'}</Button>
        </EmptyState>
      </PageContainer>
    );
  }

  const paymentLabel = PAYMENT_LABELS[values.paymentMethod];

  return (
    <PageContainer title="Checkout">
      <PageHeader title="Checkout" />

      {pending && <div role="alert"><p>{pending.invalid ? pending.message : 'A checkout is awaiting confirmation. Retry the same order before starting another. Its saved contents will be used.'}</p>
        {!pending.invalid && <Button loading={placing} onClick={handlePlaceOrder}>Retry pending order</Button>}</div>}
      {placementError && <p role="alert">{placementError.message}</p>}

      <div className="checkout-stepper">
        <Stepper steps={STEPS} current={step} onStepClick={goTo} />
      </div>

      {/* Mobile: collapsible order summary */}
      <div className="checkout-mobile-summary">
        <button
          type="button"
          className="checkout-mobile-summary__toggle"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((o) => !o)}
        >
          <span>
            <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" /> {summaryOpen ? 'Hide' : 'Show'} order summary
            <ChevronDown size={16} className={summaryOpen ? 'is-open' : ''} aria-hidden="true" />
          </span>
          <strong>{ready ? formatPrice(totals.total) : '—'}</strong>
        </button>
        {summaryOpen && (
          <div className="checkout-mobile-summary__body">
            <MiniItems items={displayItems} priced={ready} />
            <QuoteTotals totals={totals} loading={quoteLoading} error={quoteError} onRetry={reloadQuote} />
          </div>
        )}
      </div>

      <div className="checkout-layout">
        <form
          className="checkout-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 3) next();
            else handlePlaceOrder();
          }}
        >
          <fieldset disabled={placing || Boolean(pending)} style={{ display: 'contents' }}>
          {step === 0 && (
            <section className="checkout-step" aria-labelledby="step-title">
              <h2 id="step-title" className="checkout-step__title">
                Contact information
              </h2>
              <div className="form-grid form-grid--2">
                <Input label="Full Name" autoComplete="name" className="span-2" {...field('fullName')} />
                <Input label="Email" type="email" autoComplete="email" {...field('email')} />
                <Input
                  label="Phone Number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="09XX XXX XXXX"
                  hint="PH mobile number, e.g. 0917 123 4567"
                  {...field('phone')}
                  onChange={(e) => setField('phone', formatPhone(e.target.value))}
                />
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="checkout-step" aria-labelledby="step-title">
              <h2 id="step-title" className="checkout-step__title">
                Shipping address
              </h2>
              {addressError && <div role="alert"><p>Saved addresses could not be loaded. Enter a shipping address or retry.</p><Button onClick={() => setAddressVersion((value) => value + 1)}>Retry addresses</Button></div>}
              {addresses.length > 0 && (
                <Select
                  label="Use a saved address"
                  className="checkout-saved"
                  defaultValue=""
                  onChange={(e) => applyAddress(e.target.value)}
                  options={[
                    { value: '', label: 'Choose a saved address…' },
                    ...addresses.map((a) => ({ value: a.id, label: `${a.label}: ${a.address}, ${a.city}` })),
                  ]}
                />
              )}
              <div className="form-grid form-grid--2">
                <Input
                  label="Address"
                  autoComplete="street-address"
                  placeholder="House no., street, barangay"
                  className="span-2"
                  {...field('address')}
                />
                <Input label="City" autoComplete="address-level2" {...field('city')} />
                <Input label="Province" autoComplete="address-level1" {...field('province')} />
                <Input
                  label="Postal Code"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={4}
                  placeholder="e.g. 1600"
                  {...field('postalCode')}
                  onChange={(e) => setField('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="checkout-step" aria-labelledby="step-title">
              <h2 id="step-title" className="checkout-step__title">
                Payment method
              </h2>
              <PaymentMethods methods={methods} selected={values.paymentMethod} onChange={(value) => setField('paymentMethod', value)} />
              {errors.paymentMethod && (
                <p className="field__error" role="alert">
                  {errors.paymentMethod}
                </p>
              )}

              {['gcash', 'maya', 'card'].includes(values.paymentMethod) && (
                <p className="checkout-note checkout-note--info">
                  <Info size={18} strokeWidth={1.5} aria-hidden="true" />
                  After you place your order, you’ll pay with {paymentLabel} on Xendit’s secure page, then come back here.
                </p>
              )}

              <p className="checkout-note checkout-note--warn">
                <Lock size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <strong>Test mode:</strong> no real money is charged. GCash and card details are entered only on Xendit’s page, never on our site.
                </span>
              </p>
            </section>
          )}

          {step === 3 && (
            <section className="checkout-step" aria-labelledby="step-title">
              <h2 id="step-title" className="checkout-step__title">
                Review your order
              </h2>
              <div className="review-block">
                <div className="review-block__head">
                  <h3>Items</h3>
                  <Link to="/cart" className="text-link">
                    <Pencil size={14} /> Edit cart
                  </Link>
                </div>
                <MiniItems items={displayItems} priced={ready} />
              </div>
              <div className="review-grid">
                <div className="review-block">
                  <div className="review-block__head">
                    <h3>Information</h3>
                    <button type="button" className="text-link" onClick={() => goTo(0)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                  <p>{values.fullName}</p>
                  <p>{values.email}</p>
                  <p>{values.phone}</p>
                </div>
                <div className="review-block">
                  <div className="review-block__head">
                    <h3>Shipping</h3>
                    <button type="button" className="text-link" onClick={() => goTo(1)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                  <p>{values.address}</p>
                  <p>
                    {values.city}, {values.province} {values.postalCode}
                  </p>
                </div>
                <div className="review-block">
                  <div className="review-block__head">
                    <h3>Payment</h3>
                    <button type="button" className="text-link" onClick={() => goTo(2)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                  <p>
                    {paymentLabel}

                  </p>
                </div>
              </div>
              <div className="review-block">
                <QuoteTotals totals={totals} loading={quoteLoading} error={quoteError} onRetry={reloadQuote} />
              </div>
            </section>
          )}

          </fieldset>
          <div className="checkout-actions">
            {step > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={back} disabled={placing}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" icon={ArrowLeft} to="/cart">
                Cart
              </Button>
            )}
            {step < 3 ? (
              <Button type="submit" iconRight={ArrowRight}>
                Continue to {STEPS[step + 1]}
              </Button>
            ) : (
              <Button type="submit" disabled={pending?.invalid || (!pending && !ready)} loading={placing} icon={Lock}>
                {placing ? 'Placing order…' : pending ? 'Retry pending order' : `Place Order · ${ready ? formatPrice(totals.total) : '—'}`}
              </Button>
            )}
          </div>
        </form>

        <aside className="summary-card checkout-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title" className="summary-card__title">
            Order summary
          </h2>
          <MiniItems items={displayItems} priced={ready} />
          <QuoteTotals totals={totals} loading={quoteLoading} error={quoteError} onRetry={reloadQuote} showFreeShippingHint />
        </aside>
      </div>
    </PageContainer>
  );
}
