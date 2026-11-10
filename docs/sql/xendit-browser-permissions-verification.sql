-- AVENGEMS: follow-up to the 426-row supplemental preflight export.
-- READ-ONLY CATALOG INSPECTION ONLY. This file does not remediate permissions.
-- Do not append a migration or grant/revoke/role/configuration command.
-- No application RPC, Auth call, sequence advance or customer-row read is used.
-- Verify dashboard project reference privately. Run each numbered SELECT alone
-- in SQL Editor and export its COMPLETE result; an empty result is evidence too.
-- Keep exports private: policy expressions / platform routine definitions can
-- contain literal values. Redact credentials if present before sharing bodies.
-- Preserve both Xendit flags=false. This file does not verify runtime flags or
-- authorize installation, provider transactions, settings changes or enablement.
-- PostgreSQL 17 is the exported target. MAINTAIN checks are version-guarded.

-- Q1. Current baseline and effective privileges, including PG17 MAINTAIN.
-- Minimum proposed remediation: TRUNCATE=false for BOTH browser roles on the
-- six private tables. Public catalog tables are included to expose adjacent
-- hardening scope; do not silently expand the approved change to those objects.
WITH targets(table_name) AS (VALUES
  ('profiles'),('addresses'),('orders'),('order_items'),('wishlist_items'),
  ('store_settings'),('order_reference_counters'),('products'),('collections')
), principals AS (
  SELECT oid,rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon','authenticated','service_role')
)
SELECT t.table_name,r.rolname AS role_name,c.relkind,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  CASE WHEN c.relkind IN ('r','p') THEN pg_catalog.jsonb_build_object(
    'select',pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT'),
    'insert',pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT'),
    'update',pg_catalog.has_table_privilege(r.oid,c.oid,'UPDATE'),
    'delete',pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE'),
    'truncate',pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE'),
    'references',pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES'),
    'trigger',pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER'),
    'maintain',CASE WHEN pg_catalog.current_setting('server_version_num')::integer>=170000
      THEN pg_catalog.has_table_privilege(r.oid,c.oid,'MAINTAIN') ELSE NULL END,
    'any_column_select',pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT'),
    'any_column_insert',pg_catalog.has_any_column_privilege(r.oid,c.oid,'INSERT'),
    'any_column_update',pg_catalog.has_any_column_privilege(r.oid,c.oid,'UPDATE'),
    'any_column_references',pg_catalog.has_any_column_privilege(r.oid,c.oid,'REFERENCES'))
  END AS effective_privileges
FROM targets t CROSS JOIN principals r LEFT JOIN pg_catalog.pg_class c
  ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',t.table_name))
ORDER BY t.table_name,r.rolname;

-- Q2. Explicit policy counts AND complete definitions for every baseline table.
-- Expect ZERO applicable policies on the six private tables for anon/authenticated
-- if current repository intent still holds. Inspect a new/different policy; do
-- not remove it automatically. RLS enabled + zero policies = ordinary row denial.
-- MEMBER is intentionally conservative (also flags non-inherited memberships).
WITH targets(table_name) AS (VALUES
  ('profiles'),('addresses'),('orders'),('order_items'),('wishlist_items'),
  ('store_settings'),('order_reference_counters'),('products'),('collections')
), principals AS (
  SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated')
)
SELECT t.table_name,b.rolname AS browser_role,c.relrowsecurity,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) AS total_policies,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND
    EXISTS(SELECT 1 FROM pg_catalog.unnest(p.polroles) x(role_oid)
      WHERE CASE WHEN x.role_oid=0 THEN true ELSE pg_catalog.pg_has_role(b.oid,x.role_oid,'MEMBER') END)) AS applicable_policy_count,
  (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT pg_catalog.jsonb_agg(CASE WHEN x.role_oid=0 THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(x.role_oid)::text END ORDER BY x.role_oid)
      FROM pg_catalog.unnest(p.polroles) x(role_oid)),
    'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),
    'with_check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
    FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid) AS policy_definitions
FROM targets t CROSS JOIN principals b LEFT JOIN pg_catalog.pg_class c
  ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',t.table_name))
ORDER BY t.table_name,b.rolname;

-- Q3. Actual table ACL sources: defaults alone do not prove the current grantor.
-- Retain as the exact pre-change ACL record. PUBLIC / inherited grants must be
-- considered before choosing any approved REVOKE target. No change is made here.
WITH principals AS (
  SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')
)
SELECT c.relname AS table_name,pg_catalog.pg_get_userbyid(c.relowner) AS owner,
  pg_catalog.pg_get_userbyid(a.grantor) AS grantor,
  CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END AS grantee,
  a.privilege_type,a.is_grantable,b.rolname AS relevant_role,
  CASE WHEN a.grantee=0 THEN true ELSE pg_catalog.pg_has_role(b.oid,a.grantee,'USAGE') END AS immediately_inherited,
  CASE WHEN a.grantee=0 THEN true ELSE pg_catalog.pg_has_role(b.oid,a.grantee,'MEMBER') END AS membership_reachable,
  c.relacl::text AS explicit_acl
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
CROSS JOIN principals b
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN
  ('profiles','addresses','orders','order_items','wishlist_items','store_settings',
   'order_reference_counters','products','collections')
ORDER BY c.relname,b.rolname,a.grantee,a.privilege_type;

-- Q4. Explicit column grants (no rows is normal), which table-only revokes
-- would not necessarily remove. These do not override enabled RLS.
SELECT c.relname AS table_name,a.attname AS column_name,
  pg_catalog.pg_get_userbyid(x.grantor) AS grantor,
  CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee,
  x.privilege_type,x.is_grantable
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
WHERE n.nspname='public' AND c.relname IN
  ('profiles','addresses','orders','order_items','wishlist_items','store_settings',
   'order_reference_counters','products','collections')
ORDER BY c.relname,a.attname,x.grantee,x.privilege_type;

-- Q5. Roles and inheritance direction. A row member=postgres, granted_role=anon
-- means postgres can reach anon, NOT that anon can reach postgres.
SELECT pg_catalog.pg_get_userbyid(m.member) AS member,
  pg_catalog.pg_get_userbyid(m.roleid) AS granted_role,m.admin_option,
  pg_catalog.to_jsonb(m)->'inherit_option' AS inherit_option,
  pg_catalog.to_jsonb(m)->'set_option' AS set_option
FROM pg_catalog.pg_auth_members m
ORDER BY member,granted_role;

-- Q6. All non-system routines potentially executable by browser SQL roles.
-- Does NOT invoke them. Original preflight checked named privileged functions
-- and public SECURITY DEFINER routines, not every invoker routine/other schema.
-- Match this inventory to dashboard Exposed schemas + Extra search path and
-- review reachable wrappers/dynamic SQL. Regex flags are triage, not proof.
SELECT n.nspname AS schema_name,p.oid::regprocedure::text AS signature,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,l.lanname AS language,
  p.prokind,p.prosecdef,p.proconfig,p.provolatile,
  p.prorettype IN ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype) AS trigger_only,
  (SELECT pg_catalog.jsonb_object_agg(r.rolname,pg_catalog.jsonb_build_object(
    'schema_usage',pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE'),
    'execute',pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')) ORDER BY r.rolname)
    FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')) AS browser_privileges,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS full_definition_md5,
  p.prosrc ~* '\m(truncate|execute|set_config|dblink|http|pg_read_file|pg_write_file|lo_import|lo_export)\M' AS source_needs_attention,
  p.prosqlbody IS NOT NULL AS has_sql_standard_body,
  pg_catalog.jsonb_build_object('anon_can_create_in_schema',pg_catalog.has_schema_privilege('anon',n.oid,'CREATE'),
    'authenticated_can_create_in_schema',pg_catalog.has_schema_privilege('authenticated',n.oid,'CREATE')) AS schema_creation
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
WHERE p.prokind IN ('f','p')
  AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))
ORDER BY n.nspname,p.oid::regprocedure::text;

-- Q7. Browser-selectable views, which can run with the view owner's privileges.
-- Absence of private-table RLS policies does not certify owner-run views safe.
-- Catalog references show direct dependencies only; inspect function dependencies
-- and definitions privately. Do not execute views to test for customer data.
SELECT n.nspname AS schema_name,c.relname AS view_name,c.relkind,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.reloptions,
  pg_catalog.has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
  pg_catalog.has_any_column_privilege('anon',c.oid,'SELECT') AS anon_any_column_select,
  pg_catalog.has_any_column_privilege('authenticated',c.oid,'SELECT') AS authenticated_any_column_select,
  pg_catalog.md5(pg_catalog.pg_get_viewdef(c.oid)) AS definition_md5,
  (SELECT pg_catalog.jsonb_agg(DISTINCT d.refobjid::regclass::text)
    FROM pg_catalog.pg_rewrite rw JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_rewrite'::regclass AND d.objid=rw.oid
    WHERE rw.ev_class=c.oid AND d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid<>c.oid) AS relation_dependencies
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND (pg_catalog.has_any_column_privilege('anon',c.oid,'SELECT')
    OR pg_catalog.has_any_column_privilege('authenticated',c.oid,'SELECT'))
ORDER BY n.nspname,c.relname;

-- Q8. Full definitions for the SIX observed platform event-trigger functions.
-- Review privately for authentic Supabase behavior and emitted commands/grants.
-- Extension-tagged four should not match a payment migration with no extension
-- operations; broad PostgREST watchers do match DDL. Never disable them to pass.
SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,
  pg_catalog.pg_get_userbyid(e.evtowner) AS event_owner,
  pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
  p.oid::regprocedure::text AS signature,
  pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
ORDER BY e.evtname;

-- Q9. Default ACLs for the intended installer and platform creator. This is
-- evidence only: do not alter project-wide defaults to fix six existing tables.
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator,
  CASE WHEN d.defaclnamespace=0 THEN 'GLOBAL' ELSE n.nspname::text END AS schema_name,
  d.defaclobjtype,
  CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END AS grantee,
  pg_catalog.pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
WHERE pg_catalog.pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
  AND (d.defaclnamespace=0 OR n.nspname='public')
ORDER BY creator,schema_name,d.defaclobjtype,grantee,a.privilege_type;

-- Q10. Read ONLY the three permitted PostgREST setting names, never JWT secrets,
-- passwords or all rolconfig/setconfig. No rows/NULL is inconclusive: deployment
-- config may be external. Dashboard Exposed schemas/Extra search path and deployed
-- pre-request hooks still require operator attestation.
SELECT coalesce(db.datname,'ALL_DATABASES') AS database_name,
  CASE WHEN s.setrole=0 THEN 'ALL_ROLES' ELSE pg_catalog.pg_get_userbyid(s.setrole)::text END AS role_name,
  x.setting
FROM pg_catalog.pg_db_role_setting s LEFT JOIN pg_catalog.pg_database db ON db.oid=s.setdatabase
CROSS JOIN LATERAL pg_catalog.unnest(s.setconfig) x(setting)
WHERE pg_catalog.split_part(x.setting,'=',1) IN
  ('pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_pre_request')
ORDER BY database_name,role_name,x.setting;

-- Q11. Backend identity sequence privileges, without reading/advancing its value.
SELECT n.nspname AS schema_name,c.relname AS sequence_name,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,
  pg_catalog.has_sequence_privilege('service_role',c.oid,'USAGE') AS service_usage,
  pg_catalog.has_sequence_privilege('service_role',c.oid,'SELECT') AS service_select,
  pg_catalog.has_sequence_privilege('service_role',c.oid,'UPDATE') AS service_update,
  pg_catalog.has_sequence_privilege('anon',c.oid,'UPDATE') AS anon_update,
  pg_catalog.has_sequence_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname;
