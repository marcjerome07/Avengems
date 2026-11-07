-- FORWARD ONLY. New customer-facing references; internal IDs and installed RPCs stay intact.
-- Full-table backfill/rewrite: quiet window, reviewed triggers, backup and explicit approval required.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table public.order_reference_counters (
  reference_year integer primary key check(reference_year between 1 and 9999),
  last_value bigint not null check(last_value>0)
);
alter table public.order_reference_counters enable row level security;
revoke all on public.order_reference_counters from public,anon,authenticated;
grant select,insert,update on public.order_reference_counters to service_role;
alter table public.orders add column reference_year integer check(reference_year between 1 and 9999);
alter table public.orders add column reference_number bigint check(reference_number>0);
alter table public.orders add column order_reference text generated always as
  ('AVG-'||lpad(reference_year::text,4,'0')||'-'||
    lpad(reference_number::text,greatest(4,length(reference_number::text)),'0')) stored;
create unique index orders_display_reference_unique on public.orders(order_reference);

create function public.assign_order_reference() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if old.reference_year is not null and
      (new.reference_year is distinct from old.reference_year or new.reference_number is distinct from old.reference_number) then
      raise exception 'Order reference is immutable';
    end if;
    return new;
  end if;
  if new.reference_year is not null or new.reference_number is not null then
    raise exception 'Order reference is assigned by the server';
  end if;
  new.reference_year:=extract(year from new.created_at at time zone 'UTC')::integer;
  insert into public.order_reference_counters as counter(reference_year,last_value) values(new.reference_year,1)
    on conflict(reference_year) do update set last_value=counter.last_value+1
    returning last_value into new.reference_number;
  return new;
end;
$$;
revoke all on function public.assign_order_reference() from public,anon,authenticated;
grant execute on function public.assign_order_reference() to service_role;
create trigger orders_assign_display_reference before insert on public.orders
  for each row execute function public.assign_order_reference();
create trigger orders_preserve_display_reference before update of reference_year,reference_number on public.orders
  for each row execute function public.assign_order_reference();

-- Installation holds the orders DDL lock: no concurrent inserts can race backfill.
-- Only new display columns change. Do not backfill checkout provenance or inventory.
do $$
declare target record; allocated bigint; yr integer;
begin
  for target in select id,created_at from public.orders order by created_at,id for update loop
    yr:=extract(year from target.created_at at time zone 'UTC')::integer;
    insert into public.order_reference_counters as counter(reference_year,last_value) values(yr,1)
      on conflict(reference_year) do update set last_value=counter.last_value+1 returning last_value into allocated;
    update public.orders set reference_year=yr,reference_number=allocated where id=target.id;
  end loop;
end;
$$;
alter table public.orders alter column reference_year set not null;
alter table public.orders alter column reference_number set not null;
notify pgrst,'reload schema';
commit;
