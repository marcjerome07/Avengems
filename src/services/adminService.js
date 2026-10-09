// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoints (all require an admin token, enforced by the backend):
//   GET   /api/admin/stats
//   GET   /api/admin/sales?months=6
//   GET   /api/admin/orders?status=       PATCH /api/admin/orders/:id { status }
//   GET   /api/admin/customers
//   GET   /api/admin/analytics
//   GET   /api/admin/settings             PUT   /api/admin/settings
// Product CRUD lives in productService (createProduct / updateProduct / deleteProduct).

import { collections } from '../data/collections';
import { demoCustomers } from '../data/demoOrders';
import { delay, clone, ServiceError, ordersTable, productsTable, usersTable, settingsTable } from './mockDb';

const isRevenue = (o) => o.status !== 'Cancelled';

export async function getDashboardStats() {
  await delay();
  const orders = ordersTable.all();
  const customerIds = new Set([
    ...demoCustomers.map((c) => c.id),
    ...usersTable
      .all()
      .filter((u) => u.role === 'customer')
      .map((u) => u.id),
  ]);
  return {
    totalSales: orders.filter(isRevenue).reduce((sum, o) => sum + o.total, 0),
    totalOrders: orders.length,
    totalProducts: productsTable.all().length,
    totalCustomers: customerIds.size,
  };
}

/** Revenue per month for the last `months` months, oldest first. */
export async function getSalesOverview(months = 6) {
  await delay();
  const orders = ordersTable.all().filter(isRevenue);
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: d.toLocaleDateString('en-PH', { month: 'short' }),
      sales: 0,
      orders: 0,
    });
  }
  orders.forEach((o) => {
    const d = new Date(o.createdAt);
    const bucket = buckets.find((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) {
      bucket.sales += o.total;
      bucket.orders += 1;
    }
  });
  return buckets.map(({ key: _key, ...rest }) => rest);
}

export async function getOrderStatusBreakdown() {
  await delay();
  const counts = {};
  ordersTable.all().forEach((o) => {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  });
  return ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((status) => ({
    status,
    count: counts[status] ?? 0,
  }));
}

export async function getRecentOrders(limit = 6) {
  await delay();
  return clone(ordersTable.all().slice(0, limit));
}

function productSales() {
  const map = new Map();
  ordersTable
    .all()
    .filter(isRevenue)
    .forEach((o) =>
      o.items.forEach((item) => {
        const entry = map.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          type: item.type,
          stone: productsTable.find(item.productId)?.stone ?? item.stone,
          units: 0,
          revenue: 0,
        };
        entry.units += item.quantity;
        entry.revenue += item.unitPrice * item.quantity;
        map.set(item.productId, entry);
      }),
    );
  return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

export async function getBestSellers(limit = 5) {
  await delay();
  return clone(productSales().slice(0, limit));
}

export async function getAllOrders({ status = 'All' } = {}) {
  await delay();
  const list = ordersTable.all();
  return clone(status === 'All' ? list : list.filter((o) => o.status === status));
}

export async function updateOrderStatus(orderId, status) {
  await delay(250, 500);
  const order = ordersTable.find(orderId);
  if (!order) throw new ServiceError('NOT_FOUND', 'Order not found.');
  return clone(ordersTable.update(orderId, { status }));
}

export async function getCustomers() {
  await delay();
  const registered = usersTable
    .all()
    .filter((u) => u.role === 'customer')
    .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.addresses?.[0]?.city ?? '—' }));
  const all = [...registered, ...demoCustomers.filter((c) => !registered.some((r) => r.id === c.id))];
  const orders = ordersTable.all();
  return clone(
    all
      .map((c) => {
        const theirs = orders.filter((o) => o.userId === c.id);
        return {
          ...c,
          orderCount: theirs.length,
          totalSpent: theirs.filter(isRevenue).reduce((sum, o) => sum + o.total, 0),
          lastOrderAt: theirs[0]?.createdAt ?? null,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent),
  );
}

export async function getAnalytics() {
  await delay();
  const sales = productSales();
  const byStone = collections.map((c) => ({
    stone: c.stone,
    color: c.color,
    revenue: sales.filter((s) => s.stone === c.stone).reduce((sum, s) => sum + s.revenue, 0),
    units: sales.filter((s) => s.stone === c.stone).reduce((sum, s) => sum + s.units, 0),
  }));
  const byType = ['Ring', 'Necklace', 'Bracelet', 'Earrings'].map((type) => ({
    type,
    revenue: sales.filter((s) => s.type === type).reduce((sum, s) => sum + s.revenue, 0),
    units: sales.filter((s) => s.type === type).reduce((sum, s) => sum + s.units, 0),
  }));
  return clone({ byStone, byType, topProducts: sales.slice(0, 8) });
}

export async function getSettings() {
  await delay(250, 500);
  return clone(settingsTable.get());
}

export async function saveSettings(patch) {
  await delay();
  return clone(settingsTable.set(patch));
}
