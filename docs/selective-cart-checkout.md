# Selective cart checkout

Implemented locally on backend-mariel. No SQL change or migration is required:
the existing customer_checkout RPC already accepts a list of selected product IDs,
quantities and variant options, recomputes prices/shipping, and locks/decrements
only submitted inventory in the same transaction as order placement. The existing
CSRF, Origin, verified customer, idempotency and payment gates remain in use.
No SQL file was edited or executed; nothing was deployed or enabled.

Cart selection is a boolean on each persisted local cart line. Old carts default
to all selected. New/re-added items are selected. Select All supports a partial
state; unselected items remain visible and persist across refresh. Header cart
counts still include all units, while quote totals include selected lines only.
Prices are not trusted from localStorage. Unselected rows display no authoritative
price until selected and quoted. An unselected sold-out/archived item does not
block a valid selected subset. Empty selection cannot proceed to checkout.

Both normal checkout summaries and submission use the selected subset. A saved
pending attempt keeps its original subset, quantities and key across failures,
selection changes and refresh. Its summary follows that saved request, not the
new selection. Confirmation subtracts only those purchased product/variant
quantities; unrelated and unselected lines remain. Extra quantities added while
an order is awaiting confirmation remain after the purchased quantity is removed.
An uncertain result must be retried with the saved key; never start another order
just because the network failed. A refreshed pending quote may fail because stock
was already reserved; this must not prevent confirming the original attempt.

Manual browser checks, using approved synthetic accounts/catalog:

1. Add two products and two variants of one product. Deselect individual lines;
   verify the selected count, partial Select All state and recalculated server
   totals, including loss/gain of free shipping when the subset changes.
2. Deselect all. Checkout must be disabled and direct /checkout must show the
   no-selection message. Select All again; all lines should return to the quote.
3. Leave one line selected and refresh Cart, then Checkout. Verify the choice
   persists and both mobile/desktop summaries contain only that line.
4. Complete a COD subset checkout. Verify the order contains only submitted
   variants/quantities and unselected cart lines survive another refresh.
5. In approved staging, change stock before quote/placement. Selected unavailable
   stock must produce an error and retain the cart. Deselect that line and verify
   a valid remaining selection can be quoted.
6. Interrupt an order response, change the cart selection/quantity, and refresh.
   Retry the pending order; verify the original key/request is reused, no duplicate
   order/stock deduction occurs, and only original purchased quantities disappear.
7. Check checkbox keyboard operation, mixed Select All state, narrow layout and
   visible quote errors/retry. Cookie security and payment flags must be unchanged.

Automated frontend tests cover selection/persistence, variant identity, summaries,
empty selection, uncertain retries and quantity removal. Backend HTTP tests cover
subset quotes/shipping, forwarding the exact subset/key to the atomic RPC, and
rejection of empty/injected line data or stale stock. Supabase is mocked in those
HTTP tests; they do not certify a new live PostgreSQL installation or browser run.
