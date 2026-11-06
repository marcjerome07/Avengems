import { commerce } from './commerceService';
export const FULFILLMENT_NEXT = { Pending: ['Processing'], Processing: ['Shipped'], Shipped: ['Delivered'], Delivered: [], Cancelled: [] };

const get = (path) => commerce.request(`/api/admin/${path}`);
export const getDashboardData = (months = 6) => get(`dashboard?months=${months}`);
export const getDashboardStats = async () => (await getDashboardData()).stats;
export const getSalesOverview = async (months = 6) => (await getDashboardData(months)).sales;
export const getOrderStatusBreakdown = async () => (await getDashboardData()).status;
export const getRecentOrders = async (limit = 6) => (await getDashboardData()).recent.slice(0, limit);
export const getBestSellers = async (limit = 5) => (await getDashboardData()).best.slice(0, limit);
export const getAllOrders = async ({ status = 'All' } = {}) => (await get(`orders?status=${encodeURIComponent(status)}`)).items;
export const getAdminOrder = (id) => get(`orders/${encodeURIComponent(id)}`);
export const updateOrderStatus = (id, status, expectedStatus) => commerce.request(`/api/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status, expectedStatus } });
export const cancelOrder = (id) => commerce.request(`/api/admin/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
export const getCustomerDirectory = () => get('customers');
export const getCustomers = async () => (await getCustomerDirectory()).items;
export const getAnalytics = () => get('analytics');
export const getSettings = () => get('settings');
export const saveSettings = (body) => commerce.request('/api/admin/settings', { method: 'PATCH', body });
export const getAdminProducts = () => get('products');
export const createProduct = (body) => commerce.request('/api/admin/products', { method: 'POST', body });
export const updateProduct = (id, body) => commerce.request(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'PATCH', body });
export const archiveProduct = (id) => commerce.request(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} });
export function productUpdatePayload(original, values) {
  const patch = { ...values };
  if (Object.hasOwn(patch, 'stock')) {
    if (patch.stock === Number(original.stock)) delete patch.stock;
    else patch.expectedStock = Number(original.stock);
  }
  return patch;
}
