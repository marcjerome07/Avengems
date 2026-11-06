-- PROPOSED ONLY: requires explicit approval before execution. Does not modify existing rows.
-- Apply once through an authorized database administrator, then reload PostgREST's schema cache.
begin;
create function public.customer_address_mutate(
  p_user_id uuid, p_action text, p_id uuid default null, p_data jsonb default '{}'::jsonb
) returns setof public.addresses
language plpgsql security invoker set search_path = '' as $$
declare
  target public.addresses;
  make_default boolean;
begin
  -- Serialize every address mutation for one owner, including concurrent first inserts.
  perform 1 from public.profiles where id = p_user_id and role = 'customer' for update;
  if not found then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  if p_action not in ('create', 'update', 'delete', 'default') or p_action is null then
    raise exception 'Unsupported action' using errcode = '22023';
  end if;
  if p_action <> 'create' then
    select * into target from public.addresses where id = p_id and user_id = p_user_id for update;
    if not found then raise exception 'Address not found' using errcode = 'P0002'; end if;
  end if;
  if p_action = 'delete' then
    delete from public.addresses where id = p_id and user_id = p_user_id;
    if target.is_default then
      update public.addresses set is_default = true
      where user_id = p_user_id and id = (
        select id from public.addresses where user_id = p_user_id order by id limit 1
      );
    end if;
  else
    make_default := p_action = 'default' or coalesce((p_data->>'is_default')::boolean, false)
      or (p_action = 'create' and not exists (
        select 1 from public.addresses where user_id = p_user_id and is_default
      ));
    if make_default then
      update public.addresses set is_default = false where user_id = p_user_id and is_default;
    end if;
    if p_action = 'create' then
      insert into public.addresses (user_id, label, full_name, phone, address, city, province, postal_code, is_default)
      values (p_user_id, coalesce(p_data->>'label', ''), p_data->>'full_name', p_data->>'phone',
        p_data->>'address', p_data->>'city', p_data->>'province', p_data->>'postal_code', make_default);
    elsif p_action = 'update' then
      update public.addresses set
        label = coalesce(p_data->>'label', label),
        full_name = coalesce(p_data->>'full_name', full_name),
        phone = coalesce(p_data->>'phone', phone),
        address = coalesce(p_data->>'address', address),
        city = coalesce(p_data->>'city', city),
        province = coalesce(p_data->>'province', province),
        postal_code = coalesce(p_data->>'postal_code', postal_code),
        is_default = make_default or target.is_default
      where id = p_id and user_id = p_user_id;
    else
      update public.addresses set is_default = true where id = p_id and user_id = p_user_id;
    end if;
  end if;
  return query select * from public.addresses where user_id = p_user_id order by id;
end;
$$;
revoke all on function public.customer_address_mutate(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.customer_address_mutate(uuid, text, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
