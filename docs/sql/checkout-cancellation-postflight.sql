-- READ ONLY. No RPC calls, DDL, DML, notifications or setting changes.
-- Run after approved installation, before enabling checkout/cancellation traffic.

-- V01 Expected: exactly these two nullable columns; no defaults/backfill.
select a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,
  pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.orders') and not a.attisdropped
  and a.attname in ('checkout_key','checkout_request') order by a.attname;

-- V02 Expected: one valid/ready unique (user_id,checkout_key) index with
-- predicate checkout_key IS NOT NULL. No other constraint/index changes.
select i.relname,x.indisvalid,x.indisready,x.indisunique,
  pg_get_indexdef(i.oid) as definition,pg_get_expr(x.indpred,x.indrelid) as predicate
from pg_index x join pg_class i on i.oid=x.indexrelid
where x.indexrelid=to_regclass('public.orders_customer_checkout_key')
  and x.indrelid=to_regclass('public.orders');

-- V03 Expected: exactly two functions, exact parameter names/types, JSONB scalar,
-- plpgsql, volatile, SECURITY INVOKER (false), approved owner, empty search_path.
-- No lock_timeout/statement_timeout runtime function settings.
select p.oid::regprocedure as signature,p.proargnames,p.prorettype::regtype as returns,
  p.proretset,p.prokind,l.lanname,p.provolatile,p.prosecdef,
  pg_get_userbyid(p.proowner) as owner,p.proconfig,
  exists(select 1 from unnest(p.proconfig) s(setting)
    where s.setting in ('search_path=','search_path=""')) as empty_search_path,
  not exists(select 1 from unnest(p.proconfig) s(setting)
    where s.setting like 'lock_timeout=%' or s.setting like 'statement_timeout=%') as no_runtime_timeout_change,
  md5(p.prosrc) as body_fingerprint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
order by p.proname;

-- V04 Expected: six rows; anon=false, authenticated=false, service_role=true
-- for BOTH signatures. Missing rows/functions/roles are failure, not a pass.
select p.oid::regprocedure as signature,r.rolname,
  has_function_privilege(r.oid,p.oid,'EXECUTE') as effective_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join pg_roles r
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
  and r.rolname in ('anon','authenticated','service_role')
order by p.proname,r.rolname;

-- V05 Expected: direct ACL only approved owner/service_role; no PUBLIC grant.
-- Effective rights of ALL roles expose inherited/default/custom-role access.
select p.oid::regprocedure as signature,coalesce(r.rolname,'PUBLIC') as grantee,
  a.privilege_type,a.is_grantable
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
left join pg_roles r on r.oid=a.grantee
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
order by p.proname,grantee;
select p.oid::regprocedure as signature,r.rolname,r.rolsuper,r.rolbypassrls,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
  and has_function_privilege(r.oid,p.oid,'EXECUTE')
order by p.proname,r.rolname;

-- V06 Expected: reviewed bodies identical to approved artifacts (inspect locally,
-- never include customer request values). PL/pgSQL dependencies are not exhaustive.
select p.oid::regprocedure as signature,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('customer_checkout','admin_cancel_order')
order by p.proname;

-- V07 Expected: installation changed no order/item/product/profile row counts or
-- stock sums. Compare in a coordinated quiet window, before smoke-test writes.
select (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as items,
  (select count(*) from public.products) as products,
  (select coalesce(sum(stock::bigint),0) from public.products) as total_units,
  (select count(*) from public.profiles) as profiles;
-- Full independent invariant and policy checks are P02-P05/P07-P19 of preflight.
-- P06 must NOT be expected empty after installation; it now reports new objects.

-- V08 Expected: transaction-local deployment settings returned to P01 originals.
-- A different inspection connection has its own settings: compare on SAME connection.
select current_setting('lock_timeout') as lock_timeout,
  current_setting('statement_timeout') as statement_timeout,
  current_setting('transaction_isolation') as isolation;
