import AdminHeader from '../../components/admin/AdminHeader';
import { StoneBarChart, SimpleBarChart } from '../../components/admin/Charts';
import Skeleton, { TableSkeleton } from '../../components/ui/Skeleton';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getAnalytics } from '../../services/adminService';
import { formatPrice } from '../../utils/formatPrice';
import { stoneTheme } from '../../utils/stoneTheme';

export default function Analytics() {
  useDocumentTitle('Admin · Analytics');
  const { data } = useServiceData(getAnalytics);

  return (
    <>
      <AdminHeader title="Analytics" subtitle="Revenue from non-cancelled orders, all time." />

      <div className="admin-grid-even">
        <section className="panel" aria-labelledby="stone-title">
          <div className="panel__head">
            <h2 id="stone-title" className="panel__title">
              Sales by Stone Color
            </h2>
          </div>
          {data ? <StoneBarChart data={data.byStone} /> : <Skeleton height={300} />}
        </section>
        <section className="panel" aria-labelledby="type-title">
          <div className="panel__head">
            <h2 id="type-title" className="panel__title">
              Sales by Jewelry Type
            </h2>
          </div>
          {data ? <SimpleBarChart data={data.byType} categoryKey="type" /> : <Skeleton height={240} />}
        </section>
      </div>

      <section className="panel" aria-labelledby="top-title">
        <div className="panel__head">
          <h2 id="top-title" className="panel__title">
            Top Products
          </h2>
        </div>
        {data ? (
          <div className="table-wrap">
            <table className="rtable">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Product</th>
                  <th scope="col">Stone</th>
                  <th scope="col" className="num">
                    Units
                  </th>
                  <th scope="col" className="num">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={p.productId}>
                    <td data-label="Rank">{i + 1}</td>
                    <td data-label="Product" className="strong">
                      {p.name}
                    </td>
                    <td data-label="Stone">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="stone-dot" style={{ background: stoneTheme(p.stone).base }} aria-hidden="true" />
                        {stoneTheme(p.stone).color}
                      </span>
                    </td>
                    <td data-label="Units" className="num">
                      {p.units}
                    </td>
                    <td data-label="Revenue" className="num strong">
                      {formatPrice(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TableSkeleton rows={6} cols={5} />
        )}
      </section>
    </>
  );
}
