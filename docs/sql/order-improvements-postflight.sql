-- READ-ONLY VERIFICATION. No business RPCs, DDL/DML, locking reads or setting changes.
-- G00 only: after customer-order-cancel.sql; all G sections after BOTH installs.
-- Keep CUSTOMER_ORDER_CANCELLATION_ENABLED disabled throughout this runbook.
-- Current revised inspection scripts have NOT been executed against PostgreSQL.

-- G00 customer migration only: exactly TWO rows, arguments/body/config/return types
-- match; customer function is volatile (v), version stable (s); no extra overloads.
with expected(signature,argument_names,return_type,volatility,body_md5) as(values
  ('public.customer_cancel_order(uuid,text)',array['p_user_id','p_order_id'],'jsonb','v','13dc70fe2cd372bd098653a251bf0423'),
  ('public.customer_cancellation_version()',null::text[],'integer','s','ccb5b4481bced39454dca6d845601d54'))
select e.signature,p.oid is not null as exists,p.proargnames is not distinct from e.argument_names as arguments_match,
  p.prorettype=to_regtype(e.return_type) and not p.proretset as return_type_matches,
  p.provolatile::text=e.volatility as volatility_matches,not p.prosecdef as security_invoker,p.proconfig,
  md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t'))=e.body_md5 as reviewed_body_matches,
  (select count(*) from pg_proc q where q.pronamespace=p.pronamespace and q.proname=p.proname)=1 as no_overloads
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
-- SIX rows: service_role=true; anon/authenticated=false. Missing rows fail inspection.
select p.oid::regprocedure,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed
from pg_proc p cross join pg_roles r
where p.oid in (to_regprocedure('public.customer_cancel_order(uuid,text)'),to_regprocedure('public.customer_cancellation_version()'))
  and r.rolname in ('anon','authenticated','service_role') order by p.proname,r.rolname;
-- Review ALL effective executors of these two functions at the first checkpoint.
select p.oid::regprocedure,r.rolname from pg_proc p cross join pg_roles r
where p.oid in (to_regprocedure('public.customer_cancel_order(uuid,text)'),to_regprocedure('public.customer_cancellation_version()'))
  and has_function_privilege(r.oid,p.oid,'EXECUTE') order by p.proname,r.rolname;
-- G01: exact signatures, invoker=false prosecdef, empty search_path; no unexpected overloads.
select p.oid::regprocedure,p.proargnames,p.prorettype::regtype,p.prosecdef,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('customer_cancel_order','customer_cancellation_version','assign_order_reference') order by p.proname;
-- G02: nine rows: anon/authenticated false, service_role true for all three functions.
select p.oid::regprocedure,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in ('customer_cancel_order','customer_cancellation_version','assign_order_reference')
  and r.rolname in ('anon','authenticated','service_role') order by p.proname,r.rolname;
-- ALL effective executors must be limited to trusted owners/platform roles/service_role.
select p.oid::regprocedure,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in ('customer_cancel_order','customer_cancellation_version','assign_order_reference')
  and has_function_privilege(r.oid,p.oid,'EXECUTE') order by p.proname,r.rolname;
-- G03: counter RLS=true; 21 role/right rows: clients all false; service S/I/U true,
-- all DELETE/TRUNCATE/REFERENCES/TRIGGER rights false. No counter policies.
select relrowsecurity,pg_get_userbyid(relowner) as owner,relacl from pg_class where oid='public.order_reference_counters'::regclass;
select r.rolname,v.privilege,has_table_privilege(r.oid,'public.order_reference_counters',v.privilege) as allowed
from pg_roles r cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
where r.rolname in ('anon','authenticated','service_role') order by r.rolname,v.privilege;
select count(*)=0 as no_counter_policies from pg_policies
where schemaname='public' and tablename='order_reference_counters';
-- G04: three new columns, generated stored order_reference, non-null number/year.
select attname,format_type(atttypid,atttypmod) as type,attnotnull,attgenerated
from pg_attribute where attrelid='public.orders'::regclass and not attisdropped
  and attname in ('reference_year','reference_number','order_reference');
select indisunique,indisvalid,indisready,pg_get_indexdef(indexrelid) from pg_index
where indexrelid='public.orders_display_reference_unique'::regclass;
select tgname,tgenabled,tgfoid::regprocedure from pg_trigger where tgrelid='public.orders'::regclass
  and tgname in ('orders_assign_display_reference','orders_preserve_display_reference');
select p.proargnames is null as no_arguments,p.prorettype='trigger'::regtype and not p.proretset as trigger_return,
  not p.prosecdef as security_invoker,p.proconfig,
  md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t'))='db8231ddd2cc7b40073c28f5845482a3' as reviewed_allocator_body_matches
from pg_proc p where p.oid=to_regprocedure('public.assign_order_reference()');
select pg_get_expr(d.adbin,d.adrelid) as generated_reference_expression from pg_attrdef d
join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
where a.attrelid='public.orders'::regclass and a.attname='order_reference';
select conname,convalidated,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.order_reference_counters'::regclass,'public.orders'::regclass) order by conrelid,conname;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid='public.orders'::regclass
  and tgname in ('orders_assign_display_reference','orders_preserve_display_reference');
-- G05: all counts zero. Compare order/item IDs, snapshots and stock with pre-install evidence.
select count(*) filter(where order_reference is null) as missing_references,
  count(*)-count(distinct order_reference) as duplicate_references,
  count(*) filter(where order_reference !~ '^AVG-[0-9]{4}-[0-9]{4,19}$') as invalid_format
from public.orders;
select count(*) as counters_behind_orders from public.orders o where not exists
  (select 1 from public.order_reference_counters c where c.reference_year=o.reference_year and c.last_value>=o.reference_number);
select count(*) as duplicate_year_number_groups from
  (select reference_year,reference_number from public.orders group by reference_year,reference_number having count(*)>1) duplicates;
select count(*) filter(where reference_year is distinct from extract(year from created_at at time zone 'UTC')::integer) as incorrect_utc_year,
  count(*) filter(where reference_number is null or reference_number<=0) as invalid_numbers,
  count(*) filter(where order_reference is distinct from 'AVG-'||lpad(reference_year::text,4,'0')||'-'||
    lpad(reference_number::text,greatest(4,length(reference_number::text)),'0')) as incorrect_generated_values
from public.orders;
select (select count(*) from public.orders) as orders,(select count(*) from public.order_items) as items,
  (select coalesce(sum(stock::bigint),0) from public.products) as units;

-- G06 IMMEDIATE QUIET-WINDOW backfill only, BEFORE ANY new checkout resumes.
-- Expected all counts zero. Do not require this historical ordinal test after
-- live concurrent insertion/deletion: allocation order need not equal timestamp order.
with backfill as(select reference_number,row_number() over
  (partition by reference_year order by created_at,id) as expected_number from public.orders)
select count(*) as incorrect_backfill_ordinals from backfill where reference_number<>expected_number;
select count(*) as incorrect_initial_counter_totals from
  (select c.reference_year,c.last_value,count(o.id) as assigned from public.order_reference_counters c
    left join public.orders o on o.reference_year=c.reference_year group by c.reference_year,c.last_value) x
where x.last_value<>x.assigned;
select count(*) filter(where status in ('Pending','Processing') and
  (checkout_key is null or jsonb_typeof(checkout_request) is distinct from 'object')) as ineligible_legacy_orders
from public.orders;

-- G07: MUST equal the saved F07 baseline on the same quiet dataset. These hashes
-- include original IDs/snapshots/provenance, exclude only the three new columns.
select (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as items,
  (select coalesce(sum(stock::bigint),0) from public.products) as units,
  (select md5(coalesce(string_agg(md5((to_jsonb(o)-array['reference_year','reference_number','order_reference'])::text),'' order by o.id),'')) from public.orders o) as orders_md5,
  (select md5(coalesce(string_agg(md5(to_jsonb(i)::text),'' order by i.id),'')) from public.order_items i) as items_md5,
  (select md5(coalesce(string_agg(md5(jsonb_build_array(p.id,p.stock)::text),'' order by p.id),'')) from public.products p) as inventory_md5;

-- G08: old function bodies, policies, unrelated grants/triggers must be preserved.
with expected(signature,body_md5) as(values
  ('public.customer_checkout(uuid,uuid,jsonb)','0d678360d25017f3b3a17e335ff40597'),
  ('public.admin_cancel_order(uuid,text)','44a1a3668c100ec20a2b65055c29f881'))
select e.signature,md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t'))=e.body_md5 as old_body_preserved
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public'
  and tablename in ('orders','order_items','products','order_reference_counters');
select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl from pg_class c
where c.oid in ('public.orders'::regclass,'public.order_items'::regclass,'public.products'::regclass);
select tgname,tgenabled,tgisinternal,tgfoid::regprocedure,md5(pg_get_triggerdef(oid)) as fingerprint
from pg_trigger where tgrelid in ('public.orders'::regclass,'public.order_items'::regclass,'public.products'::regclass)
order by tgrelid,tgname;
select current_setting('lock_timeout') as lock_timeout,current_setting('statement_timeout') as statement_timeout;
