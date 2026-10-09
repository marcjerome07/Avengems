import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import './InfoPage.css';

const CONTACT_EMAIL = 'avengems2026@gmail.com';

// Placeholder copy for the school-project prototype.
const PAGES = {
  shipping: {
    title: 'Shipping',
    subtitle: 'How and when your pieces arrive.',
    sections: [
      ['Rates', 'Flat ₱120 nationwide. Orders of ₱2,000 and above ship free.'],
      [
        'Delivery times',
        'Metro Manila: 2–4 business days. Provincial areas: 4–7 business days. Customized pieces need 3–5 extra business days.',
      ],
      ['Packaging', 'Every piece ships in an Avengems pouch; packages of two or more come in a keepsake box.'],
      ['Tracking', 'Once your order ships, its status updates in My Account → Orders.'],
    ],
  },
  contact: {
    title: 'Contact',
    subtitle: 'We usually reply within 1–2 business days.',
    sections: [
      ['Email', `Write to us at ${CONTACT_EMAIL} for order questions, sizing help, or custom requests.`],
      ['Order help', 'Include your order number (e.g. AVG-2026-12345) so we can find it quickly.'],
    ],
    email: true,
  },
  terms: {
    title: 'Terms of Use',
    subtitle: 'Prototype terms for a school project.',
    sections: [
      [
        'About this site',
        'Avengems is a student prototype. Products, prices, and orders shown here are for demonstration only and are not real offers.',
      ],
      ['Orders', 'No real orders are fulfilled and no payments are processed on this site.'],
      ['Content', 'Product visuals are illustrations. The six-stone concept is an original jewelry theme.'],
    ],
  },
  privacy: {
    title: 'Privacy',
    subtitle: 'What this prototype stores, and where.',
    sections: [
      [
        'Your browser only',
        "Your cart, wishlist, session, demo accounts you create, and demo orders are saved in your browser's local storage. Nothing is sent to a server.",
      ],
      ['Passwords', 'Passwords are never stored in plain text, even in this prototype.'],
      ['Payment details', 'Card details are validated on the page and then discarded. They are never stored or sent anywhere.'],
      ['Clearing your data', "Clear your browser's site data to remove everything this prototype saved."],
    ],
  },
};

export default function InfoPage({ page }) {
  const content = PAGES[page] ?? PAGES.terms;
  return (
    <PageContainer title={content.title} narrow className="info-page">
      <PageHeader eyebrow="Avengems" title={content.title} subtitle={content.subtitle} />
      <div className="info-page__body">
        {content.sections.map(([heading, text]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <div className="info-page__actions">
        {content.email && (
          <Button href={`mailto:${CONTACT_EMAIL}`} icon={Mail}>
            Email us
          </Button>
        )}
        <Link to="/shop" className="text-link">
          Continue shopping
        </Link>
      </div>
    </PageContainer>
  );
}
