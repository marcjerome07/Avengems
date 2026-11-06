import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getCustomerDirectory } from '../../services/adminService';
import { formatDate, formatPrice } from '../../utils/formatPrice';

export function CustomerResults({ customers = [], query = '', loading = false, error, onRetry, emailLookupAvailable = true }) {
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => !q || [c.name, c.email, c.city].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <>
      {!error && !loading && !emailLookupAvailable && <p role="status">Some customer emails are unavailable. <button type="button" onClick={onRetry}>Retry email lookup</button></p>}
      {error ? <AdminDataState error={error} onRetry={onRetry} /> : loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Customer Email</th>
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
                  <td data-label="Customer Email">{c.email || '—'}</td>
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

export default function Customers() {
  useDocumentTitle('Admin · Customers');
  const { data, loading, error, reload } = useServiceData(getCustomerDirectory);
  const [query, setQuery] = useState('');
  return <>
    <AdminHeader title="Customers" subtitle={`${data?.items?.length ?? '–'} registered customers · confirmed account email and saved-address city`} />
    <div className="admin-toolbar">
      <Input label="Search customers" icon={Search} placeholder="Name, email, city…" className="field--grow"
        value={query} onChange={(e) => setQuery(e.target.value)} />
    </div>
    <CustomerResults customers={data?.items ?? []} query={query} loading={loading} error={error} onRetry={reload}
      emailLookupAvailable={data?.emailLookupAvailable !== false} />
  </>;
}
