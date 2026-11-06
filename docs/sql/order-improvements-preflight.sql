-- SINGLE READ-ONLY PREFLIGHT. No RPC calls, DDL/DML, locking reads or setting changes.
-- Execute sections in order, not blindly as one batch. STOP on missing baseline objects.
-- Do not execute either migration here. Keep CUSTOMER_ORDER_CANCELLATION_ENABLED disabled.
-- Expectations/approval gates: ../order-improvements-deployment-runbook.md.
-- Revised inspection queries are source-reviewed only; NOT run against PostgreSQL in this preparation.
-- F01: confirm project privately, known PG version, original two signatures present.
select current_database(),current_user,current_setting('server_version'),
  to_regprocedure('public.customer_checkout(uuid,uuid,jsonb)') as checkout,
  to_regprocedure('public.admin_cancel_order(uuid,text)') as admin_cancel;
select current_setting('transaction_isolation') as inspection_isolation,
  current_setting('lock_timeout') as original_lock_timeout,
  current_setting('statement_timeout') as original_statement_timeout,
  to_regprocedure('pg_catalog.gen_random_uuid()') as core_uuid_function;
-- Both old names must resolve to exactly one reviewed overload, not just any signature.
with expected(signature,argument_names,body_md5) as (values
  ('public.customer_checkout(uuid,uuid,jsonb)',array['p_user_id','p_key','p_request'],'0d678360d25017f3b3a17e335ff40597'),
  ('public.admin_cancel_order(uuid,text)',array['p_admin_id','p_order_id'],'44a1a3668c100ec20a2b65055c29f881'))
select e.signature,p.oid is not null as exists,p.proargnames=e.argument_names as arguments_match,
  p.prorettype='jsonb'::regtype and not p.proretset as jsonb_scalar,
  not p.prosecdef as security_invoker,p.proconfig,pg_get_userbyid(p.proowner) as owner,
  md5(btrim(replace(p.prosrc,E'\r',''),E' \n\t'))=e.body_md5 as reviewed_body_matches,
  (select count(*) from pg_proc q where q.pronamespace=p.pronamespace and q.proname=p.proname)=1 as no_overloads
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
-- Body fingerprints normalize CRLF/outer whitespace only, not semantic differences.
-- Mismatch means STOP/review the deployed revision; never replace an old function.

-- F02: before first forward install, these new objects MUST be absent. Any row is a stop.
select 'function' as kind,p.oid::regprocedure::text as object_name from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('customer_cancel_order','customer_cancellation_version','assign_order_reference')
union all select 'relation',c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('order_reference_counters','order_reference_counters_pkey','orders_display_reference_unique')
union all select 'column',a.attname from pg_attribute a where a.attrelid=to_regclass('public.orders')
  and not a.attisdropped and a.attname in ('reference_year','reference_number','order_reference')
union all select 'trigger',t.tgname from pg_trigger t where t.tgrelid=to_regclass('public.orders')
  and t.tgname in ('orders_assign_display_reference','orders_preserve_display_reference');

-- F03: confirm baseline PLUS installed checkout columns, constraints and index.
with required(name) as(values('profiles'),('orders'),('order_items'),('products'),('addresses'),('collections'),('store_settings'))
select r.name,c.oid is not null as exists,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
  pg_get_userbyid(c.relowner) as owner
from required r left join pg_class c on c.oid=to_regclass('public.'||r.name) order by r.name;
-- All matches must be TRUE. Stop before F05/F07 if any column/type/nullability differs.
with required(table_name,column_name,type,not_null) as(values
  ('profiles','id','uuid',true),('profiles','role','text',true),
  ('addresses','id','uuid',true),('addresses','user_id','uuid',true),
  ('addresses','address','text',true),('addresses','city','text',true),
  ('addresses','province','text',true),('addresses','postal_code','text',true),
  ('collections','stone','text',true),('collections','color','text',true),
  ('store_settings','id','integer',true),('store_settings','shipping_fee','numeric(10,2)',true),
  ('store_settings','free_shipping_threshold','numeric(10,2)',true),
  ('orders','id','text',true),('orders','user_id','uuid',true),
  ('orders','created_at','timestamp with time zone',true),('orders','status','text',true),
  ('orders','payment_method','text',true),('orders','customer_name','text',true),
  ('orders','customer_email','text',true),('orders','customer_phone','text',true),
  ('orders','ship_address','text',true),('orders','ship_city','text',true),
  ('orders','ship_province','text',true),('orders','ship_postal_code','text',true),
  ('orders','subtotal','numeric(10,2)',true),('orders','customization_total','numeric(10,2)',true),
  ('orders','shipping_fee','numeric(10,2)',true),('orders','total','numeric(10,2)',true),
  ('orders','checkout_key','uuid',false),('orders','checkout_request','jsonb',false),
  ('order_items','id','bigint',true),('order_items','order_id','text',true),
  ('order_items','product_id','text',true),('order_items','quantity','integer',true),
  ('order_items','base_price','numeric(10,2)',true),('order_items','customization_fee','numeric(10,2)',true),
  ('order_items','unit_price','numeric(10,2)',true),
  ('order_items','product_name','text',true),('order_items','product_slug','text',true),
  ('order_items','type','text',true),('order_items','material','text',true),
  ('order_items','stone','text',true),('order_items','color','text',true),
  ('order_items','size','text',false),('order_items','customized','boolean',true),
  ('products','id','text',true),('products','stock','integer',true),
  ('products','name','text',true),('products','slug','text',true),('products','type','text',true),
  ('products','material','text',true),('products','stone','text',true),('products','price','numeric(10,2)',true),
  ('products','customization_fee','numeric(10,2)',true),('products','customizable_size','boolean',true),
  ('products','customizable_color','boolean',true),('products','sizes','text[]',true),
  ('products','default_size','text',false),('products','archived','boolean',true))
select r.*,a.attnum is not null and format_type(a.atttypid,a.atttypmod)=r.type
  and a.attnotnull=r.not_null as matches
from required r left join pg_attribute a on a.attrelid=to_regclass('public.'||r.table_name)
  and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
order by r.table_name,r.column_name;
select c.relname as table_name,a.attname,format_type(a.atttypid,a.atttypmod) as type,
  a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_attribute a join pg_class c on c.oid=a.attrelid
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid in (to_regclass('public.profiles'),to_regclass('public.orders'),to_regclass('public.order_items'),
  to_regclass('public.products'),to_regclass('public.addresses'),to_regclass('public.collections'),to_regclass('public.store_settings'))
  and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum;
select c.conname,c.convalidated,pg_get_constraintdef(c.oid) from pg_constraint c
where c.conrelid in (to_regclass('public.profiles'),to_regclass('public.orders'),to_regclass('public.order_items'),to_regclass('public.products')) order by c.conrelid,c.conname;
select pg_get_indexdef(indexrelid),indisvalid,indisready from pg_index
where indrelid=to_regclass('public.orders');

-- F04: backfill invokes UPDATE triggers. Any unreviewed trigger/rule is a blocker.
select t.tgname,t.tgenabled,t.tgisinternal,t.tgfoid::regprocedure,
  md5(pg_get_triggerdef(t.oid)) as fingerprint from pg_trigger t
where t.tgrelid in (to_regclass('public.orders'),to_regclass('public.order_items'),to_regclass('public.products')) order by t.tgrelid,t.tgname;
select schemaname,tablename,rulename from pg_rules where schemaname='public' and tablename='orders';

-- F05: expected invalid dates/quantities/stock = 0. Legacy count may be >0;
-- those orders must stay ineligible for automatic restocking. Never forge metadata.
select count(*) as existing_orders,
  count(*) filter(where created_at is null or extract(year from created_at at time zone 'UTC') not between 1 and 9999) as invalid_reference_years,
  count(*) filter(where status in ('Pending','Processing') and
    (checkout_key is null or jsonb_typeof(checkout_request) is distinct from 'object')) as ineligible_legacy_orders
from public.orders;
select count(*) filter(where quantity is null or quantity not between 1 and 10) as invalid_quantities from public.order_items;
select count(*) filter(where stock is null or stock<0) as invalid_stock from public.products;
select count(*) filter(where status not in ('Pending','Processing','Shipped','Delivered','Cancelled')) as invalid_status,
  count(*) filter(where (checkout_key is null)<>(checkout_request is null)
    or (checkout_request is not null and jsonb_typeof(checkout_request)<>'object')) as invalid_provenance_pairs,
  count(*) filter(where not exists(select 1 from public.order_items i where i.order_id=o.id)) as orders_without_items,
  count(*) filter(where not exists(select 1 from public.profiles p where p.id=o.user_id)) as orphan_orders
from public.orders o;
select count(*) filter(where not exists(select 1 from public.orders o where o.id=i.order_id)) as orphan_items,
  count(*) filter(where not exists(select 1 from public.products p where p.id=i.product_id)) as missing_products
from public.order_items i;
select pg_total_relation_size('public.orders') as orders_bytes,
  pg_total_relation_size('public.order_items') as items_bytes;

-- F06: roles/default grants/RLS and dependencies require recorded review.
select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role');
-- Expected SIX rows: service_role=true and anon/authenticated=false for BOTH old RPCs.
select p.oid::regprocedure,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as allowed
from pg_proc p cross join pg_roles r
where p.oid in (to_regprocedure('public.customer_checkout(uuid,uuid,jsonb)'),to_regprocedure('public.admin_cancel_order(uuid,text)'))
  and r.rolname in ('anon','authenticated','service_role') order by p.proname,r.rolname;
-- Row-locking SELECTs require UPDATE rights too. Every allowed/schema_usage must be true.
with required(table_name,privilege) as(values('profiles','SELECT'),('profiles','UPDATE'),
  ('orders','SELECT'),('orders','INSERT'),('orders','UPDATE'),('order_items','SELECT'),('order_items','INSERT'),('order_items','UPDATE'),
  ('products','SELECT'),('products','UPDATE'),('addresses','SELECT'),('addresses','UPDATE'),
  ('collections','SELECT'),('collections','UPDATE'),('store_settings','SELECT'),('store_settings','UPDATE'))
select r.*,has_schema_privilege('service_role','public','USAGE') as schema_usage,
  has_table_privilege('service_role','public.'||r.table_name,r.privilege) as allowed
from required r order by r.table_name,r.privilege;
select pg_get_serial_sequence('public.order_items','id') as identity_sequence,
  has_sequence_privilege('service_role',pg_get_serial_sequence('public.order_items','id'),'USAGE') as sequence_usage;
-- Identity privilege semantics must be confirmed by actual service-role insertion
-- in approved disposable Supabase staging. Do not add speculative sequence grants.
select pg_get_userbyid(d.defaclrole) as creator,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where d.defaclnamespace=0 or n.nspname='public';
-- IMPORTANT: GRANT SELECT/INSERT/UPDATE does not remove a creator default DELETE
-- grant to service_role. A matching default for the actual migration creator is a
-- STOP until a separately reviewed correction/permission decision exists.
select pg_get_userbyid(d.defaclrole) as creator,n.nspname as schema_name,
  g.rolname as grantee,a.privilege_type,a.is_grantable
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a left join pg_roles g on g.oid=a.grantee
where d.defaclobjtype='r' and (d.defaclnamespace=0 or n.nspname='public')
  and g.rolname='service_role' and a.privilege_type not in ('SELECT','INSERT','UPDATE')
order by creator,schema_name,a.privilege_type;
select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl from pg_class c
where c.oid in (to_regclass('public.orders'),to_regclass('public.order_items'),to_regclass('public.products'));
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('orders','order_items','products');
select pg_describe_object(d.classid,d.objid,d.objsubid) as dependent_object,d.deptype
from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=to_regclass('public.orders');
-- Catalog dependencies do not enumerate all PL/pgSQL bodies or external writers.

-- F07 QUIET WINDOW baseline: save these aggregate fingerprints privately, rerun
-- identical logic in G07. No individual customer/contact/request data is returned.
-- Do not compare across active traffic. Hashes are change indicators, not backups.
select (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as items,
  (select coalesce(sum(stock::bigint),0) from public.products) as units,
  (select md5(coalesce(string_agg(md5((to_jsonb(o)-array['reference_year','reference_number','order_reference'])::text),'' order by o.id),'')) from public.orders o) as orders_md5,
  (select md5(coalesce(string_agg(md5(to_jsonb(i)::text),'' order by i.id),'')) from public.order_items i) as items_md5,
  (select md5(coalesce(string_agg(md5(jsonb_build_array(p.id,p.stock)::text),'' order by p.id),'')) from public.products p) as inventory_md5;
select c.relname,pg_total_relation_size(c.oid) as bytes,l.mode,l.granted,count(l.relation) as locks
from pg_class c left join pg_locks l on l.relation=c.oid
where c.oid in (to_regclass('public.orders'),to_regclass('public.order_items'),to_regclass('public.products'))
group by c.oid,c.relname,l.mode,l.granted order by c.relname,l.mode;
