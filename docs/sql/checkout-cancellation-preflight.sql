-- READ ONLY. Prepared for an authorized administrator; never run automatically.
-- Run P01-P04 first. Stop if required relations/columns/types are absent or differ.
-- Later data queries assume the reviewed baseline schema. No private rows emitted.

-- P01 Expected: explicitly approved project/database, supported PostgreSQL,
-- core pg_catalog.gen_random_uuid(), known Read Committed runtime isolation.
select current_database() as database_name, current_user as inspection_role,
  current_setting('server_version') as postgres_version,
  current_setting('transaction_isolation') as isolation,
  current_setting('lock_timeout') as original_lock_timeout,
  current_setting('statement_timeout') as original_statement_timeout,
  to_regprocedure('pg_catalog.gen_random_uuid()') as core_uuid_function;
select l.lanname from pg_language l where l.lanname='plpgsql';
-- Role/database defaults may differ from the administrator's inspection session.
-- Only non-secret timeout/isolation settings are reported, never arbitrary GUCs.
select case when s.setdatabase=0 then 'ALL DATABASES' else d.datname end as database_name,
  case when s.setrole=0 then 'ALL ROLES' else r.rolname end as role_name,v.setting
from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase
left join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) v(setting)
where (s.setdatabase=0 or d.datname=current_database())
  and (s.setrole=0 or r.rolname in ('service_role','authenticator','anon','authenticated'))
  and split_part(v.setting,'=',1) in ('lock_timeout','statement_timeout','default_transaction_isolation')
order by database_name,role_name,v.setting;

-- P02 Expected: eight existing ordinary tables, RLS enabled. Save baseline flags.
with required(name) as (values ('profiles'),('addresses'),('collections'),('products'),
  ('orders'),('order_items'),('store_settings'),('wishlist_items'))
select r.name, c.oid is not null as exists, c.relkind, c.relrowsecurity,
  c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
from required r left join pg_class c on c.oid = to_regclass('public.' || r.name)
order by r.name;

-- P03 Expected: exact baseline columns/types/defaults/identity from schema.sql.
-- checkout_key/checkout_request must be ABSENT before first checkout install.
select c.relname as table_name, a.attname as column_name,
  format_type(a.atttypid,a.atttypmod) as type, a.attnotnull,
  a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in
  ('profiles','addresses','collections','products','orders','order_items','store_settings','wishlist_items')
order by c.relname,a.attnum;

-- P04 Expected: validated PK/FK/check constraints match schema.sql. In particular
-- profiles.id -> auth.users.id, order quantities 1..10, stock >=0, status enum-check.
select c.relname as table_name, k.conname, k.contype, k.convalidated,
  k.condeferrable, k.condeferred, pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('profiles','addresses','collections','products','orders','order_items','store_settings')
order by c.relname,k.conname;

-- P05 Expected: existing indexes valid/ready; baseline uniqueness preserved.
select t.relname as table_name, i.relname as index_name, x.indisvalid, x.indisready,
  x.indisunique, pg_get_indexdef(i.oid) as definition
from pg_index x join pg_class i on i.oid=x.indexrelid
join pg_class t on t.oid=x.indrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname in
  ('profiles','addresses','collections','products','orders','order_items','store_settings')
order by t.relname,i.relname;

-- P06 Expected: zero rows before FIRST installation. Any matching relation,
-- column or function overload is a conflict: inspect; do not replace or rerun.
select 'column' as kind, 'public.orders.' || a.attname as object_name
from pg_attribute a where a.attrelid=to_regclass('public.orders')
  and not a.attisdropped and a.attname in ('checkout_key','checkout_request')
union all
select 'relation', n.nspname || '.' || c.relname from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='orders_customer_checkout_key'
union all
select 'function', p.oid::regprocedure::text from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order');

-- P07 Expected: only reviewed triggers/rules. No unknown stock/status side effects.
-- Internal FK triggers are included. Definitions/arguments are not printed.
select n.nspname, c.relname, t.tgname, t.tgenabled, t.tgisinternal,
  pn.nspname as function_schema, p.proname,
  md5(pg_get_triggerdef(t.oid)) as definition_fingerprint
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where (n.nspname='public' and c.relname in
  ('profiles','addresses','collections','products','orders','order_items','store_settings'))
  or (n.nspname='auth' and c.relname='users')
order by n.nspname,c.relname,t.tgname;
select schemaname, tablename, rulename from pg_rules
where schemaname='public' and tablename in ('orders','order_items','products');

-- P08 Expected: unchanged policies; baseline public reads only products/collections.
-- Additional existing policies require review, never automatic removal.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename in
  ('profiles','addresses','collections','products','orders','order_items','store_settings','wishlist_items')
order by tablename,policyname;

-- P09 Expected: all three roles exist. service_role trusted/bypasses RLS in this
-- deployment; anon/authenticated must not be superusers or bypass RLS.
select rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role') order by rolname;

-- P10 Expected: service_role has schema USAGE and required table rights.
-- No new grants are added to tables by either migration.
with required(table_name, privilege) as (values
  ('profiles','SELECT'),('profiles','UPDATE'),('addresses','SELECT'),('addresses','UPDATE'),
  ('collections','SELECT'),('collections','UPDATE'),('products','SELECT'),('products','UPDATE'),
  ('orders','SELECT'),('orders','INSERT'),('orders','UPDATE'),
  ('order_items','SELECT'),('order_items','INSERT'),('order_items','UPDATE'),('store_settings','SELECT'),('store_settings','UPDATE'))
select r.table_name,r.privilege,
  has_schema_privilege('service_role','public','USAGE') as schema_usage,
  has_table_privilege('service_role','public.' || r.table_name,r.privilege) as allowed
from required r order by r.table_name,r.privilege;
-- Check identity sequence separately; actual INSERT under service_role is a staging gate.
select pg_get_serial_sequence('public.order_items','id') as identity_sequence,
  has_sequence_privilege('service_role',pg_get_serial_sequence('public.order_items','id'),'USAGE') as sequence_usage;
select c.relname as table_name,coalesce(r.rolname,'PUBLIC') as grantee,a.privilege_type,a.is_grantable
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
left join pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relname in
  ('profiles','addresses','collections','products','orders','order_items','store_settings')
order by c.relname,grantee,a.privilege_type;

-- P11 Expected: only approved function-creation default grantees. These defaults
-- can create extra EXECUTE paths not removed by explicit anon/authenticated revokes.
select pg_get_userbyid(d.defaclrole) as creator_role, n.nspname as schema_name,
  coalesce(g.rolname,'PUBLIC') as grantee, a.privilege_type, a.is_grantable
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a left join pg_roles g on g.oid=a.grantee
where d.defaclobjtype='f' and (d.defaclnamespace=0 or n.nspname='public')
order by creator_role,schema_name,grantee;

-- P12 Expected: inspect all catalog dependencies before upgrade/removal; no
-- unexpected views, triggers, functions or extensions controlling these objects.
-- pg_depend is NOT an exhaustive list of PL/pgSQL body/external application uses.
with targets as (
  select 'pg_class'::regclass as classid,c.oid as objid from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('orders','order_items','products','orders_customer_checkout_key')
  union all
  select 'pg_proc'::regclass,p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
)
select pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as referenced_object,
  pg_describe_object(d.classid,d.objid,d.objsubid) as dependent_object,d.deptype
from pg_depend d join targets t on d.refclassid=t.classid and d.refobjid=t.objid
order by referenced_object,dependent_object;

-- P13 Expected: exactly one settings row, ID 1, both valid money amounts.
select count(*) as settings_rows, count(*) filter (where id=1) as singleton_rows,
  count(*) filter (where shipping_fee is null or shipping_fee::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
    or free_shipping_threshold is null or free_shipping_threshold::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$') as invalid_money_rows
from public.store_settings;

-- P14 Expected: all counts zero. Money regex rejects numeric NaN and infinities.
select count(*) filter (where stock is null or stock<0) as invalid_stock,
  count(*) filter (where price is null or price::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
    or customization_fee is null or customization_fee::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$') as invalid_money,
  count(*) filter (where sizes is null or (default_size is not null and not coalesce(default_size=any(sizes),false))
    or (customizable_size and not coalesce(default_size=any(sizes),false))) as invalid_size_configuration,
  count(*) filter (where not exists (select 1 from public.collections c where c.stone=p.stone)) as missing_collections
from public.products p;

-- P15 Expected: all counts zero. Duplicate colors are not prevented by schema.sql.
select (select count(*) from (select color from public.collections group by color having count(*)>1) x) as duplicate_color_groups,
  (select count(*) from public.collections where color is null or stone is null) as null_collection_keys,
  (select count(*) from (select user_id from public.addresses where is_default group by user_id having count(*)>1) x) as multiple_default_address_groups,
  (select count(*) from public.addresses a where not exists(select 1 from public.profiles p where p.id=a.user_id)) as orphan_addresses,
  (select count(*) from public.profiles p where not exists(select 1 from auth.users u where u.id=p.id)) as orphan_profiles;

-- P16 Expected: all counts zero; investigate any legacy exceptions before enabling.
select count(*) filter (where status is null or status not in ('Pending','Processing','Shipped','Delivered','Cancelled')) as invalid_status,
  count(*) filter (where payment_method is null or payment_method not in ('gcash','maya','cod','card')) as invalid_method,
  count(*) filter (where not exists(select 1 from public.profiles p where p.id=o.user_id)) as orphan_orders,
  count(*) filter (where not exists(select 1 from public.order_items i where i.order_id=o.id)) as orders_without_items,
  count(*) filter (where subtotal is null or customization_total is null or shipping_fee is null or total is null
    or subtotal::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' or customization_total::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
    or shipping_fee::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' or total::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$') as invalid_money
from public.orders o;
select count(*) filter (where quantity is null or quantity not between 1 and 10) as invalid_quantity,
  count(*) filter (where not exists(select 1 from public.orders o where o.id=i.order_id)) as orphan_items,
  count(*) filter (where not exists(select 1 from public.products p where p.id=i.product_id)) as missing_products,
  count(*) filter (where base_price is null or customization_fee is null or unit_price is null
    or base_price::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' or customization_fee::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
    or unit_price::text !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' or unit_price<>base_price+customization_fee) as invalid_money
from public.order_items i;

-- P17 Expected: zero inconsistent snapshot totals. Historical prices are compared
-- to item snapshots, NEVER current product prices.
with sums as (select order_id,sum(base_price*quantity) as subtotal,
  sum(customization_fee*quantity) as customization from public.order_items group by order_id)
select count(*) as inconsistent_order_totals from public.orders o left join sums s on s.order_id=o.id
where o.subtotal is distinct from coalesce(s.subtotal,0)
  or o.customization_total is distinct from coalesce(s.customization,0)
  or o.total is distinct from o.subtotal+o.customization_total+o.shipping_fee;

-- P18 Works both before and after added columns; emits counts only, not retained PII.
-- Expected: zero metadata rows before installation. Afterward, paired object/key
-- metadata with no duplicates. Legacy rows remain null and cannot be restocked.
with metadata as (select user_id,status,to_jsonb(o)->>'checkout_key' as key,
  nullif(to_jsonb(o)->'checkout_request','null'::jsonb) as request from public.orders o)
select count(*) filter (where key is not null) as keyed_orders,
  count(*) filter (where (key is null)<>(request is null) or (request is not null and jsonb_typeof(request)<>'object')) as invalid_metadata,
  count(*) filter (where status in ('Pending','Processing') and key is null) as legacy_ineligible_for_restock,
  (select count(*) from (select user_id,key from metadata where key is not null group by user_id,key having count(*)>1) x) as duplicate_customer_keys
from metadata;

-- P19 Expected: reviewed small table sizes, no contention during approved install.
-- Counts are baseline evidence, not an immutable snapshot under concurrent traffic.
select 'orders' as object_name,count(*) as rows from public.orders
union all select 'order_items',count(*) from public.order_items
union all select 'products',count(*) from public.products
union all select 'profiles',count(*) from public.profiles;
select c.relname,pg_total_relation_size(c.oid) as bytes,l.mode,l.granted,count(l.relation) as locks
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_locks l on l.relation=c.oid
where n.nspname='public' and c.relname in ('orders','order_items','products')
group by c.oid,c.relname,l.mode,l.granted order by c.relname,l.mode;
