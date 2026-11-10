/**
 * Order notification templates: one shared layout, inline CSS, HTML + plain text.
 * Every value that came from a customer, admin or the catalog goes through escapeHtml.
 */
export const CARRIERS = ['J&T Express', 'LBC', 'Ninja Van', 'Flash Express', 'Other'];
// Official tracking pages (reviewed 2026-11-10). Only J&T has a deep-link format seen on
// its own site (trajectoryQuery?waybillNo=…&flag=1). LBC, Ninja Van and Flash Express
// publish a tracking page without a documented deep link, so the email links to the page
// and asks the customer to enter the number. Re-check with a real waybill before launch.
const TRACKING = {
  'J&T Express': { url: (n) => `https://jtexpress.ph/trajectoryQuery?waybillNo=${n}&flag=1`, prefilled: true },
  LBC: { url: () => 'https://www.lbcexpress.com/track/', prefilled: false },
  'Ninja Van': { url: () => 'https://www.ninjavan.co/en-ph/tracking', prefilled: false },
  'Flash Express': { url: () => 'https://www.flashexpress.ph/', prefilled: false },
};
export const trackingUrl = (carrier, number) => (TRACKING[carrier] && number ? TRACKING[carrier].url(encodeURIComponent(number)) : null);
export const trackingPrefilled = (carrier) => Boolean(TRACKING[carrier]?.prefilled);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const money = (value) => peso.format(Number(value) || 0);
const PAYMENT = { cod: 'Cash on Delivery', gcash: 'GCash', maya: 'Maya', card: 'Card' };

const C = { bg: '#faf8f5', card: '#ffffff', line: '#e4ded5', ink: '#2a2622', muted: '#6e665e', subtle: '#8f877e', bronze: '#8c6e45', soft: '#f3f0eb' };
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const COPY = {
  Pending: { subject: (r) => `We've received your order ${r}`, heading: 'Thank you for your order',
    intro: (o) => `Hi ${o.customer.name}, we've received your order and will start preparing it soon. We'll email you at every step.` },
  Processing: { subject: (r) => `Your order ${r} is being prepared`, heading: 'Your order is being prepared',
    intro: (o) => `Hi ${o.customer.name}, good news: our team is now preparing your pieces.` },
  Shipped: { subject: (r) => `Your order ${r} is on its way`, heading: 'Your order is on its way',
    intro: (o) => `Hi ${o.customer.name}, your order has been handed to the courier.` },
  Delivered: { subject: (r) => `Your order ${r} has been delivered`, heading: 'Your order has arrived',
    intro: (o) => `Hi ${o.customer.name}, your order has been marked as delivered. We hope you love it.` },
  Cancelled: { subject: (r) => `Your order ${r} has been cancelled`, heading: 'Your order has been cancelled',
    intro: (o) => `Hi ${o.customer.name}, your order has been cancelled.` },
};
export const NOTIFY_STATUSES = Object.keys(COPY);
const ref = (order) => order.reference ?? order.id;
const itemDetails = (item) => [item.type, item.material, item.color, item.size && `Size ${item.size}`].filter(Boolean).join(' · ');

function layout({ preheader, heading, body, storeName, contactEmail }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td align="center" style="padding:8px 0 20px;font-family:${SERIF};font-size:26px;letter-spacing:6px;color:${C.ink};">AVENGEMS</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:6px;padding:28px 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};">
<h1 style="margin:0 0 12px;font-family:${SERIF};font-weight:500;font-size:28px;line-height:1.2;color:${C.ink};">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td align="center" style="padding:20px 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.subtle};">
Questions? Reply to this email or write to <a href="mailto:${escapeHtml(contactEmail)}" style="color:${C.bronze};">${escapeHtml(contactEmail)}</a>.<br>${escapeHtml(storeName)} · Handcrafted gemstone jewelry
</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html, style = '') => `<p style="margin:0 0 14px;${style}">${html}</p>`;
const button = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 22px;"><tr><td style="background:${C.ink};border-radius:4px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:14px;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
const panel = (title, html) => `<div style="margin:0 0 18px;padding:14px 16px;background:${C.soft};border-radius:4px;">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.bronze};margin-bottom:6px;">${escapeHtml(title)}</div>${html}</div>`;

function itemsHtml(order) {
  const rows = order.items.map((item) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top;">
<div style="font-weight:600;">${escapeHtml(item.name)}</div>
<div style="font-size:13px;color:${C.muted};">${escapeHtml(itemDetails(item))}</div>
${item.customized ? `<div style="font-size:13px;color:${C.bronze};">Customized · +${money(item.customizationFee)} each</div>` : ''}
<div style="font-size:13px;color:${C.muted};">${item.quantity} × ${money(item.unitPrice)}</div></td>
<td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap;">${money(item.unitPrice * item.quantity)}</td></tr>`).join('');
  const line = (label, value, strong = false) => `<tr><td style="padding:4px 0;${strong ? 'font-weight:600;font-size:16px;' : `color:${C.muted};`}">${label}</td>
<td align="right" style="padding:4px 0;${strong ? 'font-weight:600;font-size:16px;' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;font-size:14px;">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;">
${line('Subtotal', money(order.subtotal))}
${order.customizationTotal ? line('Customization', money(order.customizationTotal)) : ''}
${line('Shipping', order.shippingFee ? money(order.shippingFee) : 'Free')}
${line('Total', money(order.total), true)}</table>`;
}
const addressLines = (order) => [order.customer.name, order.shipping.address, `${order.shipping.city}, ${order.shipping.province} ${order.shipping.postalCode}`, order.customer.phone];

function itemsText(order) {
  return [...order.items.map((item) => `- ${item.name} (${itemDetails(item)})${item.customized ? `, customized +${money(item.customizationFee)} each` : ''}\n  ${item.quantity} x ${money(item.unitPrice)} = ${money(item.unitPrice * item.quantity)}`),
    '', `Subtotal: ${money(order.subtotal)}`, ...(order.customizationTotal ? [`Customization: ${money(order.customizationTotal)}`] : []),
    `Shipping: ${order.shippingFee ? money(order.shippingFee) : 'Free'}`, `Total: ${money(order.total)}`].join('\n');
}

/** Customer email for an order status. `order` is the API shape from toOrder(). */
export function customerOrderEmail(order, status, { storeName = 'AVENGEMS', contactEmail, origin }) {
  const copy = COPY[status];
  if (!copy) throw new Error(`No email template for status ${status}`);
  const reference = ref(order);
  // Without a configured APP_ORIGIN (development only) the link is left out.
  const link = origin ? `${origin}/account/orders/${encodeURIComponent(order.id)}` : null;
  const extra = [];
  const extraText = [];
  if (status === 'Shipped' && order.tracking?.number) {
    const carrier = order.tracking.carrier ?? 'Courier';
    const url = trackingUrl(order.tracking.carrier, order.tracking.number);
    const prefilled = trackingPrefilled(order.tracking.carrier);
    const label = prefilled ? 'Track your package' : `Open the ${carrier} tracking page`;
    const how = url && !prefilled ? `Enter tracking number ${order.tracking.number} on the ${carrier} page.` : '';
    extra.push(panel('Tracking', `<div>${escapeHtml(carrier)}: <strong>${escapeHtml(order.tracking.number)}</strong></div>
${url ? `<div style="margin-top:6px;"><a href="${escapeHtml(url)}" style="color:${C.bronze};">${escapeHtml(label)}</a></div>` : ''}
${how ? `<div style="margin-top:4px;font-size:13px;color:${C.muted};">${escapeHtml(how)}</div>` : ''}`));
    extraText.push(`Tracking: ${carrier} ${order.tracking.number}${url ? `\n${label}: ${url}` : ''}${how ? `\n${how}` : ''}`);
  }
  if (status === 'Cancelled') {
    if (order.cancellationReason) {
      extra.push(panel('Reason', escapeHtml(order.cancellationReason)));
      extraText.push(`Reason: ${order.cancellationReason}`);
    }
    const paid = order.paymentMethod !== 'cod';
    const note = paid ? 'If you were charged, our team will contact you about your refund.' : 'No payment is due for this order.';
    extra.push(p(escapeHtml(note), `color:${C.muted};`));
    extraText.push(note);
  }
  const body = [
    p(escapeHtml(copy.intro(order))),
    p(`Order <strong>${escapeHtml(reference)}</strong> · ${escapeHtml(PAYMENT[order.paymentMethod] ?? order.paymentMethod)}`, `color:${C.muted};font-size:14px;`),
    ...extra,
    link ? button(link, 'View your order') : '',
    itemsHtml(order),
    panel('Shipping to', addressLines(order).map(escapeHtml).join('<br>')),
  ].join('\n');
  const text = [`AVENGEMS`, '', copy.heading, '', copy.intro(order), '', `Order: ${reference}`,
    `Payment: ${PAYMENT[order.paymentMethod] ?? order.paymentMethod}`, ...(extraText.length ? ['', ...extraText] : []), '',
    ...(link ? [`View your order: ${link}`, ''] : []), itemsText(order), '', 'Shipping to:', ...addressLines(order), '',
    `Questions? Reply to this email or write to ${contactEmail}.`, storeName].join('\n');
  return { subject: copy.subject(reference), html: layout({ preheader: copy.subject(reference), heading: copy.heading, body, storeName, contactEmail }), text };
}

/** Internal alert to the store inbox for a new order. */
export function storeOrderAlert(order, { storeName = 'AVENGEMS', contactEmail, origin }) {
  const reference = ref(order);
  const subject = `New order ${reference} · ${money(order.total)}`;
  const link = origin ? `${origin}/admin/orders` : null;
  const customer = [order.customer.name, order.customer.email, order.customer.phone];
  const body = [
    p(`A new order was placed: <strong>${escapeHtml(reference)}</strong> · ${escapeHtml(PAYMENT[order.paymentMethod] ?? order.paymentMethod)}`),
    panel('Customer', customer.map(escapeHtml).join('<br>')),
    link ? button(link, 'Open admin orders') : '',
    itemsHtml(order),
    panel('Ship to', addressLines(order).map(escapeHtml).join('<br>')),
  ].join('\n');
  const text = ['AVENGEMS: new order', '', `Order: ${reference}`, `Payment: ${PAYMENT[order.paymentMethod] ?? order.paymentMethod}`, '',
    'Customer:', ...customer, '', ...(link ? [`Admin: ${link}`, ''] : []), itemsText(order), '', 'Ship to:', ...addressLines(order)].join('\n');
  return { subject, html: layout({ preheader: subject, heading: 'New order received', body, storeName, contactEmail }), text };
}
