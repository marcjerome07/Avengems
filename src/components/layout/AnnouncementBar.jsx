import { ANNOUNCEMENTS as MESSAGES } from '../../data/announcements';

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
