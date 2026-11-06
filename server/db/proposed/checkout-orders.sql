-- PROPOSED ONLY. Requires approval and staging validation before execution.
-- Additive installation; no existing orders, items or stock are changed at install.
-- Intentionally fails on an existing conflicting column/function/index; audit first.
begin;
-- Deployment only: stop rather than wait indefinitely on the shared orders table.
-- These settings reset at COMMIT/ROLLBACK; they are not checkout runtime settings.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.orders add column checkout_key uuid;
alter table public.orders add column checkout_request jsonb;
create unique index orders_customer_checkout_key
  on public.orders(user_id, checkout_key) where checkout_key is not null;

create function public.customer_checkout(p_user_id uuid, p_key uuid, p_request jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.orders;
  settings public.store_settings;
  saved_address public.addresses;
  product public.products;
  line jsonb;
  cart jsonb;
  snapshots jsonb := '[]'::jsonb;
  chosen_color text;
  chosen_size text;
  chosen_stone text;
  color_matches bigint;
  default_color text;
  quantity integer;
  needed integer;
  base numeric;
  fee numeric;
  monetary_amount numeric;
  -- Same accepted money domain as the quote API: finite, nonnegative numeric(10,2).
  -- The decimal-only pattern excludes NaN, Infinity and -Infinity before arithmetic.
  money_pattern constant text := '^[0-9]{1,8}([.][0-9]{1,2})?$';
  subtotal numeric := 0;
  customization numeric := 0;
  shipping_fee numeric;
  total numeric;
  shipping jsonb;
  contact jsonb;
  variant text;
  seen text[] := '{}';
  order_id text;
  result jsonb;
begin
  -- Same-user requests, including duplicate keys, serialize on the profile.
  perform 1 from public.profiles where id = p_user_id and role = 'customer' for update;
  if not found then raise exception 'Customer required' using errcode = 'P1007'; end if;
  if p_key is null or jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'Invalid checkout' using errcode = 'P1006';
  end if;
  select * into existing from public.orders where user_id = p_user_id and checkout_key = p_key;
  if found then
    if existing.checkout_request is distinct from p_request then
      raise exception 'Checkout key conflict' using errcode = 'P1001';
    end if;
    return to_jsonb(existing) || jsonb_build_object('items', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
      from public.order_items i where i.order_id = existing.id
    ));
  end if;
  if (p_request - array['items','customer','shipping','paymentMethod']) <> '{}'::jsonb
    or jsonb_typeof(p_request->'items') is distinct from 'array'
    or jsonb_typeof(p_request->'customer') is distinct from 'object'
    or jsonb_typeof(p_request->'shipping') is distinct from 'object'
    or coalesce(p_request->>'paymentMethod', '') not in ('gcash','maya','cod','card') then
    raise exception 'Invalid checkout' using errcode = 'P1006';
  end if;
  cart := p_request->'items'; contact := p_request->'customer'; shipping := p_request->'shipping';
  if jsonb_array_length(cart) not between 1 and 50
    or (contact - array['name','email','phone']) <> '{}'::jsonb
    or coalesce(length(contact->>'name'), 0) not between 2 and 100
    or coalesce(length(contact->>'email'), 0) not between 3 and 254
    or coalesce(contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(contact->>'phone','') !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
    raise exception 'Invalid contact' using errcode = 'P1006';
  end if;
  if shipping ? 'addressId' then
    if (shipping - 'addressId') <> '{}'::jsonb then raise exception 'Invalid address' using errcode = 'P1006'; end if;
    select * into saved_address from public.addresses
      where id = (shipping->>'addressId')::uuid and user_id = p_user_id for share;
    if not found then raise exception 'Address not found' using errcode = 'P1005'; end if;
    shipping := jsonb_build_object('address',saved_address.address,'city',saved_address.city,
      'province',saved_address.province,'postalCode',saved_address.postal_code);
  end if;
  if (shipping - array['address','city','province','postalCode']) <> '{}'::jsonb
    or coalesce(length(shipping->>'address'),0) not between 1 and 300
    or coalesce(length(shipping->>'city'),0) not between 1 and 100
    or coalesce(length(shipping->>'province'),0) not between 1 and 100
    or coalesce(shipping->>'postalCode','') !~ '^[0-9]{4}$' then
    raise exception 'Invalid shipping' using errcode = 'P1006';
  end if;
  -- Validate before casts and locks; input is additionally allowlisted by Express.
  for line in select value from jsonb_array_elements(cart) loop
    if jsonb_typeof(line) is distinct from 'object'
      or (line - array['productId','quantity','color','size']) <> '{}'::jsonb
      or jsonb_typeof(line->'quantity') is distinct from 'number'
      or coalesce(line->>'quantity','') !~ '^([1-9]|10)$'
      or coalesce(line->>'productId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'
      or (line->>'color' is not null and (jsonb_typeof(line->'color') <> 'string' or length(line->>'color') not between 1 and 100))
      or (line->>'size' is not null and (jsonb_typeof(line->'size') <> 'string' or length(line->>'size') not between 1 and 100)) then
      raise exception 'Invalid line' using errcode = 'P1006';
    end if;
  end loop;
  select * into settings from public.store_settings where id = 1 for share;
  if not found then
    raise exception 'Settings unavailable';
  end if;
  -- Validate BOTH settings even when the order qualifies for free shipping.
  foreach monetary_amount in array array[settings.shipping_fee, settings.free_shipping_threshold] loop
    if monetary_amount is null or monetary_amount::text !~ money_pattern then
      raise exception 'Settings unavailable';
    end if;
  end loop;
  perform 1 from public.collections order by stone for share;
  -- Every checkout locks products in the same order to avoid purchase deadlocks.
  perform 1 from public.products where id in (
    select value->>'productId' from jsonb_array_elements(cart)
  ) order by id for update;
  for line in select value from jsonb_array_elements(cart) loop
    select * into product from public.products where id = line->>'productId' and not archived;
    if not found then raise exception 'Product unavailable' using errcode = 'P1003'; end if;
    select color into default_color from public.collections where stone = product.stone;
    if not found then raise exception 'Collection unavailable' using errcode = 'P1003'; end if;
    chosen_color := coalesce(line->>'color', default_color);
    chosen_size := coalesce(line->>'size', product.default_size);
    -- Resolve cardinality and value from ONE statement snapshot. Existing-row
    -- SHARE locks above do not prevent new collection inserts at Read Committed.
    select min(c.stone), count(*) into chosen_stone, color_matches
      from public.collections c where c.color = chosen_color;
    if color_matches > 1 then
      raise exception 'Ambiguous collection color';
    end if;
    if color_matches = 0 or (not product.customizable_color and chosen_color <> default_color)
      or (product.customizable_size and not coalesce(chosen_size = any(product.sizes), false))
      or (not product.customizable_size and chosen_size is distinct from product.default_size) then
      raise exception 'Unsupported customization' using errcode = 'P1004';
    end if;
    variant := jsonb_build_array(product.id, chosen_color, chosen_size)::text;
    if variant = any(seen) then raise exception 'Duplicate line' using errcode = 'P1006'; end if;
    seen := array_append(seen, variant);
    quantity := (line->>'quantity')::integer;
    select sum((value->>'quantity')::integer)::integer into needed
      from jsonb_array_elements(cart) where value->>'productId' = product.id;
    if product.stock < needed then raise exception 'Insufficient stock' using errcode = 'P1002'; end if;
    -- Reject invalid configured fees even for an uncustomized line, matching quotes.
    foreach monetary_amount in array array[product.price, product.customization_fee] loop
      if monetary_amount is null or monetary_amount::text !~ money_pattern then
        raise exception 'Pricing unavailable';
      end if;
    end loop;
    base := product.price;
    fee := case when chosen_color <> default_color or chosen_size is distinct from product.default_size
      then product.customization_fee else 0 end;
    subtotal := subtotal + base * quantity;
    customization := customization + fee * quantity;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('product_id',product.id,
      'product_name',product.name,'product_slug',product.slug,'type',product.type,'material',product.material,
      'stone',chosen_stone,'color',chosen_color,'size',chosen_size,'base_price',base,
      'customization_fee',fee,'unit_price',base+fee,'customized',fee <> 0 or chosen_color <> default_color
        or chosen_size is distinct from product.default_size,'quantity',quantity));
  end loop;
  shipping_fee := case when subtotal + customization >= settings.free_shipping_threshold then 0 else settings.shipping_fee end;
  total := subtotal + customization + shipping_fee;
  -- Finite inputs and exact numeric arithmetic keep derived amounts finite.
  -- Check output invariants explicitly; retain the existing amount-limit error.
  foreach monetary_amount in array array[subtotal, customization, shipping_fee, total] loop
    if monetary_amount is null or monetary_amount::text in ('NaN', 'Infinity', '-Infinity') or monetary_amount < 0 then
      raise exception 'Pricing unavailable';
    end if;
  end loop;
  if total > 99999999.99 then raise exception 'Order amount too large' using errcode = 'P1006'; end if;
  -- UUID-based reference avoids the existing five-digit demo number's small space.
  order_id := 'AVG-' || to_char(current_timestamp at time zone 'UTC','YYYY') || '-' || upper(replace(gen_random_uuid()::text,'-',''));
  insert into public.orders(id,user_id,status,payment_method,customer_name,customer_email,customer_phone,
    ship_address,ship_city,ship_province,ship_postal_code,subtotal,customization_total,shipping_fee,total,checkout_key,checkout_request)
  values(order_id,p_user_id,'Pending',p_request->>'paymentMethod',contact->>'name',contact->>'email',contact->>'phone',
    shipping->>'address',shipping->>'city',shipping->>'province',shipping->>'postalCode',subtotal,customization,shipping_fee,total,p_key,p_request);
  for line in select value from jsonb_array_elements(snapshots) loop
    insert into public.order_items(order_id,product_id,product_name,product_slug,type,material,stone,color,size,
      base_price,customization_fee,unit_price,customized,quantity)
    values(order_id,line->>'product_id',line->>'product_name',line->>'product_slug',line->>'type',line->>'material',
      line->>'stone',line->>'color',line->>'size',(line->>'base_price')::numeric,(line->>'customization_fee')::numeric,
      (line->>'unit_price')::numeric,(line->>'customized')::boolean,(line->>'quantity')::integer);
  end loop;
  for line in select jsonb_build_object('id',value->>'productId','quantity',sum((value->>'quantity')::integer))
    from jsonb_array_elements(cart) group by value->>'productId' order by value->>'productId' loop
    update public.products set stock = stock - (line->>'quantity')::integer
      where id = line->>'id' and stock >= (line->>'quantity')::integer;
    if not found then raise exception 'Insufficient stock' using errcode = 'P1002'; end if;
  end loop;
  select to_jsonb(o) || jsonb_build_object('items', (
    select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id = o.id
  )) into result from public.orders o where o.id = order_id;
  return result;
end;
$$;
revoke all on function public.customer_checkout(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.customer_checkout(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
