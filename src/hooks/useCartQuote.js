import { useEffect, useState, useCallback, useMemo } from 'react';
import { cartSelections } from '../services/cartService';
import { commerce } from '../services/commerceService';

export default function useCartQuote(items) {
  const key = JSON.stringify(cartSelections(items));
  const [state, setState] = useState({ request: null, quote: null, error: null });
  const [version, setVersion] = useState(0);
  const request = useMemo(() => ({ key, version }), [key, version]);
  useEffect(() => {
    if (request.key === '[]') return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      commerce.request('/api/cart/quote', { method: 'POST', body: { items: JSON.parse(request.key) }, signal: controller.signal })
        .then((quote) => {
          if (!Array.isArray(quote?.items) || !quote.totals || !Number.isFinite(quote.totals.total)) throw new Error('Unable to validate the cart quote. Please retry.');
          if (!controller.signal.aborted) setState({ request, quote, error: null });
        })
        .catch((error) => { if (!controller.signal.aborted) setState({ request, quote: null, error }); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = state.request === request;
  return { quote: current ? state.quote : null, error: current ? state.error : null,
    loading: key !== '[]' && !current, reload };
}
