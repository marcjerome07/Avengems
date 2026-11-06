import { orderReference } from '../../utils/orderReference';
export default function OrderReference({ order }) {
  return <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 }}>{orderReference(order)}</span>;
}
