import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getCustomers } from '../../services/adminService';
import { formatDate, formatPrice } from '../../utils/formatPrice';

export default function Customers() {
  useDocumentTitle('Admin · Customers');
  const { data, loading } = useServiceData(getCustomers);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((c) => !q || `${c.name} ${c.email} ${c.city}`.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <>
      <AdminHeader title="Customers" subtitle={`${data?.length ?? '–'} customers · sample store data`} />
      <div className="admin-toolbar">
        <Input
          label="Search customers"
          icon={Search}
          placeholder="Name, email, city…"
          className="field--grow"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Email</th>
                <th scope="col">City</th>
                <th scope="col" className="num">
                  Orders
                </th>
                <th scope="col" className="num">
                  Total Spent
                </th>
                <th scope="col">Last Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td data-label="Customer" className="strong">
                    {c.name}
                  </td>
                  <td data-label="Email">{c.email}</td>
                  <td data-label="City">{c.city || '—'}</td>
                  <td data-label="Orders" className="num">
                    {c.orderCount}
                  </td>
                  <td data-label="Total Spent" className="num strong">
                    {formatPrice(c.totalSpent)}
                  </td>
                  <td data-label="Last Order">{c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={Users} title="No customers found" message="Try a different search." />
      )}
    </>
  );
}
