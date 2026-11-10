-- READ ONLY. Compare original aggregates/fingerprints to approved preflight.
begin isolation level repeatable read read only;
select id,enabled from public.payment_gateway_config; -- Must remain false initially.
select count(*) orders,min(created_at) oldest,max(created_at) newest,
  sum(total) total_snapshot,count(order_reference) referenced from public.orders;
select count(*) items,sum(quantity) units from public.order_items;
select count(*) products,sum(stock::bigint) stock from public.products;
select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
  has_table_privilege('service_role',c.oid,'UPDATE') service_update,
  has_table_privilege('service_role',c.oid,'DELETE') service_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('payment_gateway_config','order_payments','payment_events','payment_refunds');
select p.oid::regprocedure,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'payment\_%' escape '\' or p.proname='xendit_payment_version');
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.orders'::regclass and not tgisinternal;
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.order_payments'::regclass,'public.payment_events'::regclass,'public.payment_refunds'::regclass);
select p.oid::regprocedure,md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t')) normalized_body_md5
from pg_proc p where p.oid in (to_regprocedure('public.customer_checkout(uuid,uuid,jsonb)'),
  to_regprocedure('public.admin_cancel_order(uuid,text)'),to_regprocedure('public.customer_cancel_order(uuid,text)'));
select status,count(*) from public.order_payments group by status;
-- After sandbox testing: these queries must be empty unless documented incidents.
select p.order_id,p.status,o.status order_status from public.order_payments p join public.orders o on o.id=p.order_id
where (p.inventory_released and o.status<>'Cancelled')
  or (o.status in ('Processing','Shipped','Delivered') and p.status not in ('paid','refunded','review'));
select status,count(*) unresolved from public.order_payments where status in ('creating','unknown','review') group by status;
commit;
