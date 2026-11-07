import Button from '../ui/Button';

export default function AdminDataState({ error, onRetry }) {
  if (!error) return null;
  return <div role="alert" className="panel"><p>{error.message}</p><Button onClick={onRetry}>Retry loading data</Button></div>;
}
