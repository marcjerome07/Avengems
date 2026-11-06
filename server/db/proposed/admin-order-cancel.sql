-- PROPOSED ONLY. Requires explicit approval and isolated PostgreSQL validation.
-- No new tables/columns or installation-time record/inventory updates.
-- Requires checkout-orders.sql first: only checkout-created orders may restock.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function public.admin_cancel_order(p_admin_id uuid, p_order_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.orders;
  line record;
  result jsonb;
begin
  -- Only the verified backend supplies this administrator identity.
  perform 1 from public.profiles where id = p_admin_id and role = 'admin' for share;
  if not found then raise exception 'Administrator required' using errcode = 'P2001'; end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P2002'; end if;
  if target.status <> 'Cancelled' then
    if target.status not in ('Pending','Processing') then
      raise exception 'Order cannot be cancelled' using errcode = 'P2003';
    end if;
    -- Never infer a prior inventory deduction for legacy/manual orders.
    -- Metadata is written only by the trusted checkout path and must be immutable.
    if target.checkout_key is null or jsonb_typeof(target.checkout_request) is distinct from 'object' then
      raise exception 'Checkout provenance required' using errcode = 'P2004';
    end if;
    -- The order lock serializes cancellation and fulfillment; existing Cancelled
    -- records are never retrospectively restocked. Products use checkout lock order.
    perform 1 from public.order_items where order_id = p_order_id order by id for update;
    if (select count(*) from public.order_items where order_id = p_order_id) not between 1 and 50
      or exists (select 1 from public.order_items where order_id = p_order_id
        and (quantity is null or quantity not between 1 and 10 or product_id is null)) then
      raise exception 'Invalid historical items' using errcode = 'P2004';
    end if;
    perform 1 from public.products where id in (
      select product_id from public.order_items where order_id = p_order_id
    ) order by id for update;
    for line in select product_id, sum(quantity)::bigint as quantity
      from public.order_items where order_id = p_order_id group by product_id order by product_id loop
      if line.quantity is null or line.quantity not between 1 and 500 then
        raise exception 'Invalid historical quantity' using errcode = 'P2004';
      end if;
      update public.products set stock = stock + line.quantity
        where id = line.product_id and stock <= 2147483647 - line.quantity;
      if not found then raise exception 'Restocking could not be completed'; end if;
    end loop;
    update public.orders set status = 'Cancelled' where id = p_order_id;
  end if;
  select to_jsonb(o) || jsonb_build_object('items', (
    select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
      from public.order_items i where i.order_id = o.id
  )) into result from public.orders o where o.id = p_order_id;
  return result;
end;
$$;
revoke all on function public.admin_cancel_order(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_cancel_order(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
