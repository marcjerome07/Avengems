import { Smartphone, Wallet, Banknote, CreditCard } from 'lucide-react';
const options = [
  { value: 'gcash', label: 'GCash', icon: Smartphone, note: 'Pay on Xendit’s secure page' },
  { value: 'maya', label: 'Maya', icon: Wallet, note: 'Pay on Xendit’s secure page' },
  { value: 'cod', label: 'Cash on Delivery', icon: Banknote, note: 'Pay when your order arrives' },
  { value: 'card', label: 'Credit/Debit Card', icon: CreditCard, note: 'Pay on Xendit’s secure page' },
];
export default function PaymentMethods({ methods = ['cod'], selected = '', onChange }) {
  return <div className="pay-options" role="radiogroup" aria-label="Payment method">
    {options.map(({ value, label, icon: Icon, note }) => <label key={value} className={`pay-option ${selected === value ? 'is-selected' : ''}`}>
      <input type="radio" disabled={!methods.includes(value)} name="paymentMethod" value={value} checked={selected === value} onChange={() => onChange(value)} />
      <Icon size={22} strokeWidth={1.4} aria-hidden="true" />
      <span className="pay-option__text"><span className="pay-option__label">{label}</span>
        <span className="pay-option__note">{methods.includes(value) ? note : 'Not available right now'}</span></span>
    </label>)}
  </div>;
}
