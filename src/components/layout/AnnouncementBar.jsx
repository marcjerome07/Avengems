// Edit this list to change what scrolls across the top of the store.
const MESSAGES = [
  '12.12 Sale on December 12. Mark your calendar!',
  'Free shipping on orders over ₱2,000',
  'A little color. A little meaning. A piece of you.',
  'Pay with GCash, Card or Cash on Delivery',
];

function Group({ hidden = false }) {
  return (
    <ul className="announcement__group" aria-hidden={hidden || undefined}>
      {MESSAGES.map((message) => (
        <li key={message} className="announcement__item">
          {message}
        </li>
      ))}
    </ul>
  );
}

export default function AnnouncementBar() {
  return (
    <div className="announcement" role="region" aria-label="Store announcements">
      {/* The second copy makes the loop seamless; screen readers only read the first. */}
      <div className="announcement__track">
        <Group />
        <Group hidden />
      </div>
    </div>
  );
}
