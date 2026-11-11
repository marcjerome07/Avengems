import { ApiError } from './errors.js';

export const CHANNELS = Object.freeze({ gcash: 'GCASH', maya: 'PAYMAYA', card: 'CARDS' });
const unavailable = () => new ApiError(503, 'PAYMENTS_DISABLED', 'Online payments are awaiting validated Test Mode deployment. Choose Cash on Delivery.');
export function createXendit({ env = process.env, fetcher = fetch } = {}) {
  const methods = (env.XENDIT_ENABLED_METHODS ?? '').split(',').filter((value) => Object.hasOwn(CHANNELS, value));
  const hosts = (env.XENDIT_CHECKOUT_HOSTS ?? 'xen.to').split(',').map((host) => host.trim());
  const configured = env.XENDIT_ENVIRONMENT === 'test' && /^xnd_development_[A-Za-z0-9+/=_-]+$/.test(env.XENDIT_SECRET_KEY ?? '')
    && Boolean(env.XENDIT_BUSINESS_ID) && (env.XENDIT_WEBHOOK_TOKEN?.length ?? 0) >= 16;
  const enabled = configured && env.XENDIT_PAYMENTS_ENABLED === 'true' && env.XENDIT_DEPLOYMENT_VALIDATED === 'true' && methods.length > 0;
  function checkoutUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) throw new Error();
      return url.href;
    } catch { throw new ApiError(503, 'INVALID_PAYMENT_LINK', 'The provider checkout link could not be verified. Please check your order.'); }
  }
  async function request(path, { method = 'GET', body, version, retry = true } = {}) {
    if (!configured) throw unavailable();
    const headers = { Authorization: `Basic ${Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString('base64')}`, 'Content-Type': 'application/json' };
    if (version) headers['api-version'] = version;
    let response;
    try {
      response = await fetcher(`https://api.xendit.co${path}`, { method, headers, redirect: 'error',
        signal: AbortSignal.timeout(10000), ...(body ? { body: JSON.stringify(body) } : {}) });
      if (method === 'GET' && retry && [429, 502, 503, 504].includes(response.status)) return request(path, { method, version, retry: false });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch { throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment verification is temporarily unavailable. Check this order before trying again.'); }
  }
  const identifier = (value, prefix) => {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}-[A-Za-z0-9-]{1,100}$`).test(value)) throw new ApiError(400, 'INVALID_PAYMENT_ID', 'Invalid provider identifier.');
    return encodeURIComponent(value);
  };
  return { enabled, configured, methods: [...new Set(methods)], businessId: env.XENDIT_BUSINESS_ID,
    webhookToken: env.XENDIT_WEBHOOK_TOKEN, checkoutUrl,
    create: (body) => { if (!enabled) throw unavailable(); return request('/sessions', { method: 'POST', body }); },
    getSession: (id) => request(`/sessions/${identifier(id, 'ps')}`),
    getRequest: (id) => request(`/v3/payment_requests/${identifier(id, 'pr')}`, { version: '2024-11-11' }),
    getRefunds: (id) => request(`/v3/refunds?payment_id=${identifier(id, 'py')}`, { version: '2024-11-11' }),
    cancelSession: (id) => request(`/sessions/${identifier(id, 'ps')}/cancel`, { method: 'POST' }),
  };
}
