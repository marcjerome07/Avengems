import { useEffect, useState } from 'react';
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
import { TotalsList, MiniItems } from '../components/cart/OrderSummary';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { placeOrder, PAYMENT_LABELS } from '../services/orderService';
import { getAddresses } from '../services/authService';
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
  const { items, totals, clearCart } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    fullName: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    paymentMethod: '',
    ...EMPTY_CARD,
  });
  const [errors, setErrors] = useState({});
  const [addresses, setAddresses] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Pre-fill shipping from the default saved address.
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    getAddresses(user.id)
      .then((list) => {
        if (!active) return;
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
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  function setField(name, value) {
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
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    setValues((v) => ({ ...v, address: a.address, city: a.city, province: a.province, postalCode: a.postalCode }));
    setErrors({});
  }

  async function handlePlaceOrder() {
    // Re-check every step before submitting.
    for (let s = 0; s < 3; s += 1) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    setPlacing(true);
    try {
      // Card details are validated above and then discarded. Only the method name is sent.
      const order = await placeOrder({
        userId: user.id,
        items,
        customer: { name: values.fullName.trim(), email: values.email.trim(), phone: values.phone.trim() },
        shipping: {
          address: values.address.trim(),
          city: values.city.trim(),
          province: values.province.trim(),
          postalCode: values.postalCode.trim(),
        },
        paymentMethod: values.paymentMethod,
      });
      setValues((v) => ({ ...v, ...EMPTY_CARD }));
      navigate(`/order-confirmation/${order.id}`, { replace: true });
      clearCart();
      showToast(`Order ${order.id} placed. Thank you!`, { type: 'success' });
    } catch (err) {
      showToast(err.message ?? 'We could not place your order. Please try again.', { type: 'error' });
      setPlacing(false);
    }
  }

  if (!items.length) {
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
          <strong>{formatPrice(totals.total)}</strong>
        </button>
        {summaryOpen && (
          <div className="checkout-mobile-summary__body">
            <MiniItems items={items} />
            <TotalsList totals={totals} />
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
                  You&apos;ll be redirected to complete payment with {paymentLabel} after placing your order.
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
                  <strong>Prototype only.</strong> No real payment is processed and card details are not stored.
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
                <MiniItems items={items} />
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
                <TotalsList totals={totals} />
              </div>
            </section>
          )}

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
              <Button type="submit" loading={placing} icon={Lock}>
                {placing ? 'Placing order…' : `Place Order · ${formatPrice(totals.total)}`}
              </Button>
            )}
          </div>
        </form>

        <aside className="summary-card checkout-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title" className="summary-card__title">
            Order summary
          </h2>
          <MiniItems items={items} />
          <TotalsList totals={totals} showFreeShippingHint />
        </aside>
      </div>
    </PageContainer>
  );
}
