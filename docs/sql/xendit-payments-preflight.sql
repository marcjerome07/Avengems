-- READ ONLY. Operator must verify project/environment privately before execution.
-- Not run against the shared project by this task. STOP on a missing prerequisite,
-- any naming conflict, unexpected grants/body fingerprints, or active deployment writes.
begin isolation level repeatable read read only;
select current_database(),current_user,current_setting('server_version');
select name,to_regprocedure(name) as installed from (values
  ('public.customer_checkout(uuid,uuid,jsonb)'),('public.admin_cancel_order(uuid,text)'),
  ('public.customer_cancel_order(uuid,text)'),('public.customer_cancellation_version()'),
  ('public.assign_order_reference()')) expected(name);
select p.oid::regprocedure as signature,p.proargnames,p.prosecdef,p.proconfig,
  md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t')) as normalized_body_md5
from pg_proc p where p.oid in (to_regprocedure('public.customer_checkout(uuid,uuid,jsonb)'),
  to_regprocedure('public.admin_cancel_order(uuid,text)'),to_regprocedure('public.customer_cancel_order(uuid,text)'));
-- Zero rows required before FIRST install. Do not "fix" conflicts by dropping objects.
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('payment_gateway_config','order_payments','payment_events','payment_refunds');
select attname from pg_attribute where attrelid='public.orders'::regclass and attname='payment_state' and not attisdropped;
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'payment\_%' escape '\' or p.proname='xendit_payment_version');
select tgname from pg_trigger where tgrelid='public.orders'::regclass and not tgisinternal;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='orders';
-- Record these aggregates securely and compare in postflight (no customer data).
select count(*) orders,min(created_at) oldest,max(created_at) newest,
  sum(total) total_snapshot,count(order_reference) referenced from public.orders;
select count(*) items,sum(quantity) units from public.order_items;
select count(*) products,sum(stock::bigint) stock from public.products;
select status,payment_method,count(*) from public.orders group by status,payment_method order by status,payment_method;
select count(*) invalid_checkout_provenance from public.orders
where checkout_key is not null and jsonb_typeof(checkout_request) is distinct from 'object';
-- New functions must never be granted to browser roles. Inspect role inheritance,
-- default ACLs and platform-specific grants before approving the migration.
select rolname,rolinherit,rolsuper,rolbypassrls from pg_roles where rolname in ('service_role','anon','authenticated');
select defaclrole::regrole,defaclobjtype,defaclacl from pg_default_acl;
commit;
