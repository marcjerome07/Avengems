import nodemailer from 'nodemailer';

const SMTP_SETTINGS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

/** "alice@gmail.com" -> "a***@gmail.com". Anything unrecognisable becomes "***". */
export function maskEmail(value) {
  const match = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(String(value ?? '').trim());
  return match ? `${match[1][0]}***@${match[2].toLowerCase()}` : '***';
}
/** Masks every email address inside a log line. */
export const redactEmails = (text) => String(text).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[A-Za-z]{2,}/g, maskEmail);

/**
 * The only module that sends application email (order notifications). Supabase Auth
 * emails (signup, OTP, recovery) are sent by Supabase and never pass through here.
 *
 * MAIL_ENABLED=true requires complete SMTP_* settings; otherwise startup fails. With
 * MAIL_ENABLED unset/false, messages are logged instead of sent: in full during
 * development, and as metadata with a masked recipient in production.
 */
export function createMailer({ env = process.env, createTransport = nodemailer.createTransport, logger = console,
  production = env.NODE_ENV === 'production' } = {}) {
  const port = Number(env.SMTP_PORT);
  const missing = SMTP_SETTINGS.filter((name) => !env[name]?.trim());
  if (env.SMTP_PORT && !(Number.isInteger(port) && port > 0 && port < 65536)) missing.push('SMTP_PORT (must be a port number)');
  const enabled = env.MAIL_ENABLED === 'true';
  if (enabled && missing.length) {
    // Names only, never values.
    throw new Error(`MAIL_ENABLED=true but these settings are missing or invalid: ${[...new Set(missing)].join(', ')}. Fix server/.env or set MAIL_ENABLED=false.`);
  }
  const from = { name: env.MAIL_FROM_NAME || 'AVENGEMS', address: env.SMTP_USER || 'no-reply@localhost' };
  const transport = enabled ? createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  }) : null;

  async function send({ to, subject, html, text, replyTo, meta = {} }) {
    if (!enabled) {
      if (production) {
        logger.log(`[mail:console] order=${meta.orderNumber ?? '-'} status=${meta.status ?? '-'} kind=${meta.kind ?? '-'} to=${maskEmail(to)} (MAIL_ENABLED is not true; not sent)`);
      } else {
        logger.log(`[mail:console] To: ${to} | Reply-To: ${replyTo ?? '-'} | Subject: ${subject}\n${text}\n[mail:console] end`);
      }
      return { channel: 'console' };
    }
    await transport.sendMail({ from, to, replyTo, subject, html, text });
    return { channel: 'smtp' };
  }
  return { enabled, from, send };
}

/** Short, secret-free description of a send failure for the notifications table. */
export function describeMailError(error) {
  const code = [error?.code, error?.responseCode].filter(Boolean).join(' ');
  const message = String(error?.message ?? 'Unknown error').replace(/\s+/g, ' ').trim();
  return `${code ? `${code}: ` : ''}${message}`.slice(0, 300);
}
