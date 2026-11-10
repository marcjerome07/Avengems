import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { reports } from '../../server/src/admin.js';

// SSR does not run effects. Supply the completed request through a test-only
// context so the real dashboard's populated render is exercised, not just skeletons.
const fixtureModule = '\0admin-dashboard-request-state';
const vite = await createServer({ configFile: false, plugins: [{
  name: 'dashboard-request-fixture', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/useServiceData')) return fixtureModule; },
  load(id) {
    if (id === fixtureModule) return `import { createContext, useContext } from 'react';
      export const RequestState = createContext(null);
      export default function useServiceData() { return useContext(RequestState); }`;
  },
}, react()], ssr: { external: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts'] },
server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
after(() => vite.close());
const { default: Dashboard } = await vite.ssrLoadModule('/src/pages/admin/Dashboard.jsx');
const { RequestState } = await vite.ssrLoadModule(fixtureModule);
const render = (state) => renderToString(h(MemoryRouter, null, h(RequestState.Provider, { value: state }, h(Dashboard))));

test('dashboard renders populated backend report, including historical COD orders', () => {
  const data = reports({ orders: [{ id: 'internal-order', order_reference: 'AVG-2026-0001',
    status: 'Shipped', payment_method: 'cod', created_at: '2026-11-08T00:00:00Z',
    customer_name: 'Synthetic Customer', total: '1020', subtotal: '900', customization_total: '0', shipping_fee: '120',
    items: [{ id: 1, product_id: 'synthetic-ring', product_name: 'Synthetic Ring',
      type: 'Ring', stone: 'power', unit_price: '900', quantity: 1 }] }],
  products: [{ id: 'synthetic-ring', archived: false }], profiles: [{ role: 'customer' }],
  collections: [{ stone: 'power', color: 'Purple' }] }, 6, new Date('2026-11-09T00:00:00Z'));
  const html = render({ data, error: null, loading: false, reload() {} });
  assert.match(html, /Synthetic Customer/);
  assert.match(html, /AVG-2026-0001/);
  assert.match(html, /Synthetic Ring/);
  assert.match(html, /Shipped/);
});

test('dashboard retains a visible retry action for API failures', () => {
  const html = render({ data: null, loading: false, error: new Error('Store data temporarily unavailable.'), reload() {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /Retry loading data/);
  assert.doesNotMatch(html, /Synthetic Customer/);
});
