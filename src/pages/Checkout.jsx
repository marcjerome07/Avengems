import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Smartphone,
  Wallet,
  Banknote,
  CreditCard,
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
import { useCart } from '../context/useCart';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { placeOrder, orderRequest, PAYMENT_LABELS } from '../services/orderService';
import { getAddresses } from '../services/authService';
import { pendingCheckout, beginCheckout, finishCheckout, definitiveCheckoutFailure, confirmCheckoutAttempt } from '../services/checkoutAttempts';
import { authSession } from '../services/authSession';
import { formatPrice } from '../utils/formatPrice';
import {
  runValidators,
  validateName,
  validateEmail,
  validatePhone,
  validateRequired,
  validatePostalCode,
  validateCardNumber,
  validateExpiry,
  validateCvv,
  formatPhone,
  formatCardNumber,
  formatExpiry,
} from '../utils/validators';
import './Checkout.css';

const STEPS = ['Information', 'Shipping', 'Payment', 'Review'];

const PAYMENT_OPTIONS = [
  { value: 'gcash', label: 'GCash', icon: Smartphone, note: 'Pay with your GCash wallet' },
  { value: 'maya', label: 'Maya', icon: Wallet, note: 'Pay with your Maya wallet' },
  { value: 'cod', label: 'Cash on Delivery', icon: Banknote, note: 'Pay when your order arrives' },
  { value: 'card', label: 'Credit/Debit Card', icon: CreditCard, note: 'Visa, Mastercard, JCB' },
];

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
    cardName: (v, all) => (all.paymentMethod === 'card' ? validateName(v).replace('Full name', 'Cardholder name') : ''),
    cardNumber: (v, all) => (all.paymentMethod === 'card' ? validateCardNumber(v) : ''),
    expiry: (v, all) => (all.paymentMethod === 'card' ? validateExpiry(v) : ''),
    cvv: (v, all) => (all.paymentMethod === 'card' ? validateCvv(v) : ''),
  },
};

const EMPTY_CARD = { cardName: '', cardNumber: '', expiry: '', cvv: '' };

export default function Checkout() {
  const { items, totals, quotedItems, quoteLoading, quoteError, reloadQuote, completeCheckout } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const submitting = useRef(false);
  const [pending, setPending] = useState(() => {
    try { return pendingCheckout(user.id); } catch (error) { return { invalid: true, message: error.message }; }
  });
  const [placementError, setPlacementError] = useState(null);
  const [savedAddressId, setSavedAddressId] = useState(pending?.request?.shipping?.addressId ?? '');
  const ready = Boolean(totals) && !quoteLoading && !quoteError;
  const displayItems = quotedItems ?? items;

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
    ...EMPTY_CARD,
  });
  const [errors, setErrors] = useState({});
  const [addresses, setAddresses] = useState([]);
  const [addressError, setAddressError] = useState(null);
  const [addressVersion, setAddressVersion] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

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
    submitting.current = true;
    setPlacing(true);
    setPlacementError(null);
    try {
      // Card details are validated above and then discarded. Only the method name is sent.
      const attempt = pending ?? beginCheckout(user.id, orderRequest({
        items,
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
      setValues((value) => ({ ...value, ...EMPTY_CARD }));
      const order = await confirmCheckoutAttempt(attempt, { placeOrder, completeCart: completeCheckout,
        isCurrent: () => authSession.getSnapshot().status === 'authenticated' && authSession.getSnapshot().user?.id === attempt.owner });
      setPending(null);
      setValues((v) => ({ ...v, ...EMPTY_CARD }));
      navigate(`/order-confirmation/${order.id}`, { replace: true });
      showToast(`Order ${order.id} placed. Thank you!`, { type: 'success' });
    } catch (err) {
      if (definitiveCheckoutFailure(err)) { finishCheckout(user.id); setPending(null); }
      if (['INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'INVALID_CUSTOMIZATION'].includes(err.code)) reloadQuote();
      setPlacementError(err);
      showToast(err.message ?? 'We could not place your order. Please try again.', { type: 'error' });
    } finally { submitting.current = false; setPlacing(false); }
  }

  if (!items.length && !pending) {
    return (
      <PageContainer title="Checkout">
        <PageHeader title="Checkout" />
        <EmptyState icon={ShoppingBag} title="Your cart is empty" message="Add a piece or two before checking out.">
          <Button to="/shop">Shop the collection</Button>
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
              <div
                className="pay-options"
                role="radiogroup"
                aria-label="Payment method"
                aria-invalid={errors.paymentMethod ? 'true' : undefined}
              >
                {PAYMENT_OPTIONS.map(({ value, label, icon: Icon, note }) => (
                  <label key={value} className={`pay-option ${values.paymentMethod === value ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={value}
                      checked={values.paymentMethod === value}
                      onChange={() => setField('paymentMethod', value)}
                    />
                    <Icon size={22} strokeWidth={1.4} aria-hidden="true" />
                    <span className="pay-option__text">
                      <span className="pay-option__label">{label}</span>
                      <span className="pay-option__note">{note}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.paymentMethod && (
                <p className="field__error" role="alert">
                  {errors.paymentMethod}
                </p>
              )}

              {(values.paymentMethod === 'gcash' || values.paymentMethod === 'maya') && (
                <p className="checkout-note checkout-note--info">
                  <Info size={18} strokeWidth={1.5} aria-hidden="true" />
                  Demo payment with {paymentLabel}. No wallet redirect or real charge will occur.
                </p>
              )}

              {values.paymentMethod === 'card' && (
                <div className="form-grid form-grid--2 card-fields">
                  <Input label="Cardholder Name" autoComplete="cc-name" className="span-2" {...field('cardName')} />
                  <Input
                    label="Card Number"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    className="span-2"
                    {...field('cardNumber')}
                    onChange={(e) => setField('cardNumber', formatCardNumber(e.target.value))}
                  />
                  <Input
                    label="Expiration (MM/YY)"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    {...field('expiry')}
                    onChange={(e) => setField('expiry', formatExpiry(e.target.value))}
                  />
                  <Input
                    label="CVV"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={4}
                    {...field('cvv')}
                    onChange={(e) => setField('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
              )}

              <p className="checkout-note checkout-note--warn">
                <Lock size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <strong>Demo payment only.</strong> Use test details. No real payment is processed and card details are never sent or stored.
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
                    {values.paymentMethod === 'card' && values.cardNumber && ` ending in ${values.cardNumber.replace(/\D/g, '').slice(-4)}`}
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
