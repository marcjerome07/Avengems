-- FORWARD ONLY. Requires installed checkout metadata; do not edit installed files.
-- Review, isolated staging, backup and explicit team approval required before shared deployment.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function public.customer_cancel_order(p_user_id uuid, p_order_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.orders;
  line record;
  result jsonb;
begin
  -- Express verifies normal token, email and customer role; ID is never client supplied.
  perform 1 from public.profiles where id=p_user_id and role='customer' for share;
  if not found then raise exception 'Customer required' using errcode='P3001'; end if;
  select * into target from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'Order not found' using errcode='P3002'; end if;
  -- Customer replays are denied; admin replay semantics remain unchanged.
  if target.status not in ('Pending','Processing') then
    raise exception 'Order cannot be cancelled' using errcode='P3003';
  end if;
  if target.checkout_key is null or jsonb_typeof(target.checkout_request) is distinct from 'object' then
    raise exception 'Checkout provenance required' using errcode='P3004';
  end if;
  perform 1 from public.order_items where order_id=p_order_id order by id for update;
  if (select count(*) from public.order_items where order_id=p_order_id) not between 1 and 50
    or exists(select 1 from public.order_items where order_id=p_order_id
      and (quantity is null or quantity not between 1 and 10 or product_id is null)) then
    raise exception 'Invalid historical items' using errcode='P3004';
  end if;
  perform 1 from public.products where id in
    (select product_id from public.order_items where order_id=p_order_id) order by id for update;
  for line in select product_id,sum(quantity)::bigint as quantity from public.order_items
    where order_id=p_order_id group by product_id order by product_id loop
    if line.quantity is null or line.quantity not between 1 and 500 then
      raise exception 'Invalid historical quantity' using errcode='P3004';
    end if;
    update public.products set stock=stock+line.quantity
      where id=line.product_id and stock<=2147483647-line.quantity;
    if not found then raise exception 'Restocking unavailable' using errcode='P3004'; end if;
  end loop;
  update public.orders set status='Cancelled' where id=p_order_id;
  select to_jsonb(o)||jsonb_build_object('items',(
    select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)
    from public.order_items i where i.order_id=o.id)) into result from public.orders o where o.id=p_order_id;
  return result;
end;
$$;
-- Presence check plus the backend flag attest a separately reviewed/validated installation.
create function public.customer_cancellation_version() returns integer
language sql stable security invoker set search_path = '' as $$ select 1; $$;
revoke all on function public.customer_cancel_order(uuid,text) from public,anon,authenticated;
revoke all on function public.customer_cancellation_version() from public,anon,authenticated;
grant execute on function public.customer_cancel_order(uuid,text) to service_role;
grant execute on function public.customer_cancellation_version() to service_role;
notify pgrst,'reload schema';
commit;
