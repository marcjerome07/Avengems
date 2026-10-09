import { Link } from 'react-router-dom';
import { Mail, Sparkles, Fingerprint, Feather, HandHeart, BadgeCheck, ArrowRight } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import GemVisual from '../components/product/GemVisual';
import Skeleton from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import useServiceData from '../hooks/useServiceData';
import { getTeamMembers, formatMemberName, memberInitials } from '../services/teamService';
import { DIAMOND_STYLES, stoneTheme } from '../utils/stoneTheme';
import './About.css';

const CONTACT_EMAIL = 'avengems2026@gmail.com';

const PIECES = [
  { type: 'Ring', label: 'Rings', stone: 'power', text: 'Slim bands with a single stone, sized US 5 to 12.' },
  { type: 'Necklace', label: 'Necklaces', stone: 'space', text: 'Fine chains and faceted pendants, 40 to 50 cm.' },
  { type: 'Bracelet', label: 'Bracelets', stone: 'reality', text: 'Delicate, adjustable links made for stacking.' },
  { type: 'Earrings', label: 'Earrings', stone: 'time', text: 'Studs and drops that frame the face in color.' },
];

const VALUES = [
  { icon: Sparkles, title: 'Style', text: 'Clean, modern designs that feel considered, not costume.' },
  { icon: Fingerprint, title: 'Personal Expression', text: 'Six stones, each with a meaning you can make your own.' },
  { icon: Feather, title: 'Comfort', text: 'Lightweight, hypoallergenic pieces you forget you are wearing.' },
  { icon: HandHeart, title: 'Accessibility', text: 'Real gemstones and quality metals at prices that make sense.' },
  { icon: BadgeCheck, title: 'Quality', text: '925 sterling silver and surgical-grade steel, checked piece by piece.' },
];

const GROUP_ORDER = ['Team Leader', 'Scrum Master', 'Member'];

export default function About() {
  const { data: team } = useServiceData(getTeamMembers);
  const sortedTeam = (team ?? []).slice().sort((a, b) => GROUP_ORDER.indexOf(a.role) - GROUP_ORDER.indexOf(b.role));

  return (
    <PageContainer title="About Us" className="about">
      <section className="about-hero">
        <span className="eyebrow">About Avengems</span>
        <h1 className="about-hero__title">
          More Than Jewelry.
          <br />
          Wear Your Stone.
        </h1>
        <p className="about-hero__lead">
          Avengems is a gemstone jewelry collection inspired by the Six Infinity Stones, combining colorful designs, customization options,
          and everyday wear.
        </p>
        <span className="diamonds" aria-hidden="true">
          {DIAMOND_STYLES.map((style, i) => (
            <span key={i} style={style} />
          ))}
        </span>
      </section>

      <section className="about-story" aria-labelledby="story-title">
        <div className="about-story__media">
          <GemVisual type="Necklace" stone="mind" variant={1} label="Citrine pendant illustration" />
        </div>
        <div className="about-story__text">
          <span className="section-eyebrow">Our Story</span>
          <h2 id="story-title" className="section-title">
            Six colors. Six meanings. One piece of you.
          </h2>
          <p>
            Avengems began with a simple idea: jewelry should say a little something about the person wearing it. We took inspiration from
            the idea of six legendary stones (power, space, reality, soul, time, and mind) and translated each one into a gemstone color you
            can wear every day.
          </p>
          <p>
            The result is a collection that is elegant first and meaningful second. Pick the stone that matches your mood, your goals, or
            someone you love, then make it yours with an available size or stone-color option.
          </p>
        </div>
      </section>

      <section className="section--tight" aria-labelledby="collection-title">
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Our Collection</span>
            <h2 id="collection-title" className="section-title">
              Four ways to wear your stone.
            </h2>
          </div>
          <Link to="/shop" className="text-link text-link--ink">
            Shop all <ArrowRight size={16} />
          </Link>
        </div>
        <ul className="about-pieces" role="list">
          {PIECES.map((p) => (
            <li key={p.type}>
              <Link to={`/shop?type=${p.type}`} className="about-piece">
                <span className="about-piece__media">
                  <GemVisual type={p.type} stone={p.stone} label={`${p.label} illustration`} />
                </span>
                <h3 className="about-piece__title">{p.label}</h3>
                <p className="muted">{p.text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section--tight" aria-labelledby="values-title">
        <span className="section-eyebrow">Our Values</span>
        <h2 id="values-title" className="section-title" style={{ marginBottom: 32 }}>
          What we stand for.
        </h2>
        <ul className="about-values" role="list">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="about-value">
              <Icon size={26} strokeWidth={1.2} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="team" className="section--tight about-team" aria-labelledby="team-title">
        <span className="section-eyebrow">Meet the Team</span>
        <h2 id="team-title" className="section-title" style={{ marginBottom: 32 }}>
          The people behind Avengems.
        </h2>
        <ul className="about-team__grid" role="list">
          {team
            ? sortedTeam.map((m) => (
                <li key={m.id} className="about-member">
                  <span className="about-member__avatar" style={{ '--ring': stoneTheme(m.accent).base }} aria-hidden="true">
                    {memberInitials(m)}
                  </span>
                  <h3 className="about-member__name">{formatMemberName(m)}</h3>
                  <p className="about-member__role">{m.role}</p>
                </li>
              ))
            : Array.from({ length: 7 }, (_, i) => (
                <li key={i}>
                  <Skeleton height={180} />
                </li>
              ))}
        </ul>
      </section>

      <section id="contact" className="about-contact" aria-labelledby="contact-title">
        <h2 id="contact-title" className="section-title">
          Say hello.
        </h2>
        <p className="muted">Questions about a piece, an order, or a custom request? We&apos;d love to hear from you.</p>
        <Button href={`mailto:${CONTACT_EMAIL}`} icon={Mail} size="lg">
          {CONTACT_EMAIL}
        </Button>
      </section>
    </PageContainer>
  );
}
