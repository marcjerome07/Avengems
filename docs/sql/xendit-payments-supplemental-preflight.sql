-- AVENGEMS Xendit PRE-INSTALL supplemental inspection. ONE SELECT statement.
-- No BEGIN/SET/DO/DDL/DML/GRANT/NOTIFY, application RPC calls or sequence advances.
-- Never connects anywhere itself. This task does NOT authorize a shared deployment.
--
-- RUN: verify the Supabase dashboard PROJECT REFERENCE privately, open a fresh SQL
-- Editor query, paste this ENTIRE file and run it alone. Export the entire result
-- grid, not just PASS rows. Keep both Xendit flags false. Do not paste credentials.
-- Edit ONLY the SELECT literals in run_settings: intended deployment role (default
-- current_user; attest this really is the future installer), and a private random
-- snapshot salt of >=32 characters, reused for comparisons and NEVER shared in chat.
-- The salt is not an account credential. If left unset, hashes are withheld and a
-- REVIEW result is emitted. Hashes are change detectors, not anonymization proof.
--
-- FAIL or any SQL error => NO-GO. REVIEW => unresolved until an authorized human
-- records a disposition. Technical PASS never authorizes installation or payment
-- enablement. No proposed payment object should exist before FIRST installation.
-- Missing/incompatible tables suppress data reads rather than invent zero counts.
-- Counts are exact only for this statement's MVCC snapshot/inspection visibility.
-- The known 5-COD baseline is checked for drift, not assumed permanent.
--
-- Constraint/default fingerprints are conservative PostgreSQL deparser fingerprints
-- derived from empty local catalog fixtures matching the repository baseline.
-- Definition formatting/version drift must be reviewed, not bypassed or repaired.
-- Snapshot queries use only constant SELECT text, quoted approved identifiers and
-- pg_catalog.format(%L) for the salt. query_to_xml is a core inspection bridge for safe absence
-- handling; it never receives user SQL or calls an AVENGEMS function.
--
-- POST-INSTALL: use the existing postflight, NOT an all-green rerun of this script
-- (object-conflict FAILs are then expected). Compare the snapshot field lists with
-- the same salt; they intentionally omit the new orders.payment_state column.
-- Keep evidence restricted: no row-level customer/contact/address/credential data
-- is returned. Trigger/rule bodies and arguments are hashed, not printed.
--
-- EXPECT: required baseline/function/index/trigger and browser-denial rows PASS;
-- proposed names absent; G/data-visible PASS and G/snapshot present; supplied COD
-- counts match. The final decision intentionally remains REVIEW even with zero
-- failures: each REVIEW needs a recorded owner/disposition, not a filtered export.
-- Preserve the original preflight results too; this file supplements them.
-- INSTALLATION GO requires zero unresolved failures/reviews, current restricted
-- snapshot evidence, approved backup/restore and quiet-window plan, hosted staging
-- evidence and explicit authorization for this exact artifact/project/role.
-- After any future approved install, run docs/sql/xendit-payments-postflight.sql;
-- verify all new effective ACLs (including column/inherited grants), event audit
-- append-only behavior, unchanged prerequisite hashes and historical snapshots,
-- zero historical payment rows, NULL historical payment_state, and DB gate false.
-- Future-table privileges cannot be certified before objects exist. Browser/API
-- access and hosted checkout/webhook QA require separately authorized testing.
-- Keep both server flags false throughout; installation GO is not enablement GO.
WITH RECURSIVE
run_settings AS (
  SELECT 'postgres'::text AS intended_deployment_role,
    '24D3A65085B7E4AC86D63EA4CFB173205FC073A4F60400A7BD2E1F48EC6D3313'::text AS snapshot_salt
),
settings AS (
  SELECT r.*, pg_catalog.to_regrole(r.intended_deployment_role)::oid AS installer_oid,
    pg_catalog.length(r.snapshot_salt)>=32 AND r.snapshot_salt<>'REPLACE_WITH_PRIVATE_SNAPSHOT_SALT' AS salt_ready
  FROM run_settings r
),
baseline_tables(table_name) AS (VALUES
  ('profiles'),('addresses'),('collections'),('products'),('store_settings'),
  ('orders'),('order_items'),('wishlist_items'),('order_reference_counters')
),
required_columns(table_name,column_name,type_name,not_null,identity_kind,generated_kind,default_md5) AS (VALUES
  ('orders','id','text',true,'','',NULL::text),
  ('orders','user_id','uuid',true,'','',NULL::text),
  ('orders','created_at','timestamp with time zone',true,'','','75230039beb12ce952f24927f2bfa2f2'),
  ('orders','status','text',true,'','','9e592e1658514566754ef565d19c9627'),
  ('orders','payment_method','text',true,'','',NULL::text),
  ('orders','customer_name','text',true,'','',NULL::text),
  ('orders','customer_email','text',true,'','',NULL::text),
  ('orders','customer_phone','text',true,'','',NULL::text),
  ('orders','ship_address','text',true,'','',NULL::text),
  ('orders','ship_city','text',true,'','',NULL::text),
  ('orders','ship_province','text',true,'','',NULL::text),
  ('orders','ship_postal_code','text',true,'','',NULL::text),
  ('orders','subtotal','numeric(10,2)',true,'','',NULL::text),
  ('orders','customization_total','numeric(10,2)',true,'','',NULL::text),
  ('orders','shipping_fee','numeric(10,2)',true,'','',NULL::text),
  ('orders','total','numeric(10,2)',true,'','',NULL::text),
  ('orders','checkout_key','uuid',false,'','',NULL::text),
  ('orders','checkout_request','jsonb',false,'','',NULL::text),
  ('orders','reference_year','integer',true,'','',NULL::text),
  ('orders','reference_number','bigint',true,'','',NULL::text),
  ('orders','order_reference','text',false,'','s','02e88a824a9953f24c4cede8120b1752'),
  ('profiles','id','uuid',true,'','',NULL::text),
  ('profiles','name','text',true,'','','86e751880b3791dd7c2efae188915799'),
  ('profiles','phone','text',false,'','',NULL::text),
  ('profiles','role','text',true,'','','694a358ecca4778ce2401a726514e544'),
  ('profiles','created_at','timestamp with time zone',true,'','','75230039beb12ce952f24927f2bfa2f2'),
  ('addresses','id','uuid',true,'','','f3b72bb359a50b640590970a2ab8e514'),
  ('addresses','user_id','uuid',true,'','',NULL::text),
  ('addresses','label','text',false,'','',NULL::text),
  ('addresses','full_name','text',true,'','',NULL::text),
  ('addresses','phone','text',true,'','',NULL::text),
  ('addresses','address','text',true,'','',NULL::text),
  ('addresses','city','text',true,'','',NULL::text),
  ('addresses','province','text',true,'','',NULL::text),
  ('addresses','postal_code','text',true,'','',NULL::text),
  ('addresses','is_default','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('collections','id','text',true,'','',NULL::text),
  ('collections','slug','text',true,'','',NULL::text),
  ('collections','stone','text',true,'','',NULL::text),
  ('collections','stone_name','text',true,'','',NULL::text),
  ('collections','color','text',true,'','',NULL::text),
  ('collections','color_hex','text',true,'','',NULL::text),
  ('collections','gemstone','text',true,'','',NULL::text),
  ('collections','tagline','text',false,'','',NULL::text),
  ('collections','description','text',false,'','',NULL::text),
  ('products','id','text',true,'','',NULL::text),
  ('products','slug','text',true,'','',NULL::text),
  ('products','name','text',true,'','',NULL::text),
  ('products','type','text',true,'','',NULL::text),
  ('products','stone','text',true,'','',NULL::text),
  ('products','material','text',true,'','',NULL::text),
  ('products','price','numeric(10,2)',true,'','',NULL::text),
  ('products','stock','integer',true,'','','cfcd208495d565ef66e7dff9f98764da'),
  ('products','rating','numeric(2,1)',true,'','','cfcd208495d565ef66e7dff9f98764da'),
  ('products','review_count','integer',true,'','','cfcd208495d565ef66e7dff9f98764da'),
  ('products','is_new','boolean',true,'','','b326b5062b2f0e69046810717534cb09'),
  ('products','is_featured','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('products','customizable_size','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('products','customizable_color','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('products','customization_fee','numeric(10,2)',true,'','','cfcd208495d565ef66e7dff9f98764da'),
  ('products','sizes','text[]',true,'','','f81a5133416544064d5b9b182f73a6e1'),
  ('products','default_size','text',false,'','',NULL::text),
  ('products','short_description','text',false,'','',NULL::text),
  ('products','details','text',false,'','',NULL::text),
  ('products','images','text[]',true,'','','f81a5133416544064d5b9b182f73a6e1'),
  ('products','added_at','date',true,'','','2c030db9110271d1d8efc0664c88de15'),
  ('products','archived','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('wishlist_items','user_id','uuid',true,'','',NULL::text),
  ('wishlist_items','product_id','text',true,'','',NULL::text),
  ('wishlist_items','created_at','timestamp with time zone',true,'','','75230039beb12ce952f24927f2bfa2f2'),
  ('order_items','id','bigint',true,'a','',NULL::text),
  ('order_items','order_id','text',true,'','',NULL::text),
  ('order_items','product_id','text',true,'','',NULL::text),
  ('order_items','product_name','text',true,'','',NULL::text),
  ('order_items','product_slug','text',true,'','',NULL::text),
  ('order_items','type','text',true,'','',NULL::text),
  ('order_items','material','text',true,'','',NULL::text),
  ('order_items','stone','text',true,'','',NULL::text),
  ('order_items','color','text',true,'','',NULL::text),
  ('order_items','size','text',false,'','',NULL::text),
  ('order_items','base_price','numeric(10,2)',true,'','',NULL::text),
  ('order_items','customization_fee','numeric(10,2)',true,'','',NULL::text),
  ('order_items','unit_price','numeric(10,2)',true,'','',NULL::text),
  ('order_items','customized','boolean',true,'','','68934a3e9455fa72420237eb05902327'),
  ('order_items','quantity','integer',true,'','',NULL::text),
  ('order_reference_counters','reference_year','integer',true,'','',NULL::text),
  ('order_reference_counters','last_value','bigint',true,'','',NULL::text),
  ('store_settings','id','integer',true,'','','c4ca4238a0b923820dcc509a6f75849b'),
  ('store_settings','store_name','text',true,'','',NULL::text),
  ('store_settings','contact_email','text',true,'','',NULL::text),
  ('store_settings','shipping_fee','numeric(10,2)',true,'','',NULL::text),
  ('store_settings','free_shipping_threshold','numeric(10,2)',true,'','',NULL::text)
),
required_constraints(table_name,source_name,constraint_kind,definition_md5) AS (VALUES
  ('profiles','profiles_role_check','c','21a92c20d3eb0dcfa3b1dafce2f9ad2e'),
  ('profiles','profiles_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('profiles','profiles_id_fkey','f','0061c9fb3a9abcf2edbcd4a42467a9c3'),
  ('addresses','addresses_postal_code_check','c','0caecf01cdd789e88d3ae18d8228011d'),
  ('addresses','addresses_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('addresses','addresses_user_id_fkey','f','f52ea365e97de6e8cafd675b03a940e4'),
  ('collections','collections_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('collections','collections_slug_key','u','687397275d0e852fb2a4b50394adffee'),
  ('collections','collections_stone_key','u','c0fae434fc90eddd9e76e9ce36c31c06'),
  ('products','products_type_check','c','5a759923ca57ed25d65cf0215daa8488'),
  ('products','products_material_check','c','7fce98607ddff57f773a264a690a3c78'),
  ('products','products_price_check','c','1ccdb6e1381064188ed2c9691b61eb1a'),
  ('products','products_stock_check','c','18870c02a5f210a3d8a070168203e864'),
  ('products','products_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('products','products_slug_key','u','687397275d0e852fb2a4b50394adffee'),
  ('products','products_stone_fkey','f','0053199923c65ff7bdf4d19d8ad63654'),
  ('orders','orders_status_check','c','054d3126cc9a8fc5dc95a51f2a5dffdf'),
  ('orders','orders_payment_method_check','c','662ac7e4951a1a2562e6cf1ef3dc41b0'),
  ('orders','orders_reference_year_check','c','916e6a6e33dd5bc1bc0e9ef98452da32'),
  ('orders','orders_reference_number_check','c','208b4fca347c765dfcae138b273cdcc8'),
  ('orders','orders_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('orders','orders_user_id_fkey','f','e41ecacf5ea41303b9738fd2f85bca99'),
  ('order_items','order_items_quantity_check','c','69c3f43f565ee708c15fa04b4bb40213'),
  ('order_items','order_items_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('order_items','order_items_order_id_fkey','f','25aa7307969164af40ae7aa4a4b0d54e'),
  ('order_items','order_items_product_id_fkey','f','4b3b82bfa0607d8da9f5258ee162fe35'),
  ('wishlist_items','wishlist_items_pkey','p','9c026849748899e5341e3779596789c8'),
  ('wishlist_items','wishlist_items_user_id_fkey','f','f52ea365e97de6e8cafd675b03a940e4'),
  ('wishlist_items','wishlist_items_product_id_fkey','f','a8022d13a0749189c857e5b6c1733374'),
  ('store_settings','store_settings_id_check','c','d1e072e924883ecb3b6d452869a3d76a'),
  ('store_settings','store_settings_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
  ('order_reference_counters','order_reference_counters_reference_year_check','c','916e6a6e33dd5bc1bc0e9ef98452da32'),
  ('order_reference_counters','order_reference_counters_last_value_check','c','bf6f0e99967a0b56b8a9e67eecfe387e'),
  ('order_reference_counters','order_reference_counters_pkey','p','f3f61663d8356b929e352521b35b32d4')
),
required_functions(signature,arg_names,result_type,returns_set,definer,language_name,volatility,default_count,body_md5,mandatory,deny_browser) AS (VALUES
  ('public.customer_checkout(uuid,uuid,jsonb)',ARRAY['p_user_id','p_key','p_request'],'jsonb',false,false,'plpgsql','v',0,'0d678360d25017f3b3a17e335ff40597',true,true),
  ('public.admin_cancel_order(uuid,text)',ARRAY['p_admin_id','p_order_id'],'jsonb',false,false,'plpgsql','v',0,'44a1a3668c100ec20a2b65055c29f881',true,true),
  ('public.customer_cancel_order(uuid,text)',ARRAY['p_user_id','p_order_id'],'jsonb',false,false,'plpgsql','v',0,'13dc70fe2cd372bd098653a251bf0423',true,true),
  ('public.customer_cancellation_version()',NULL::text[],'integer',false,false,'sql','s',0,'ccb5b4481bced39454dca6d845601d54',true,true),
  ('public.assign_order_reference()',NULL::text[],'trigger',false,false,'plpgsql','v',0,'db8231ddd2cc7b40073c28f5845482a3',true,true),
  ('public.handle_new_user()',NULL::text[],'trigger',false,true,'plpgsql','v',0,'f6b50434271986a60f70bf768e118f61',true,false),
  ('public.customer_address_mutate(uuid,text,uuid,jsonb)',ARRAY['p_user_id','p_action','p_id','p_data'],'addresses',true,false,'plpgsql','v',2,'cd0c5bfa4bf13c6045d57b4fa1d3c4fc',false,true)
),
proposed_functions(function_name,signature) AS (VALUES
  ('xendit_payment_version','public.xendit_payment_version()'),
  ('payment_order_created','public.payment_order_created()'),
  ('payment_order_guard','public.payment_order_guard()'),
  ('payment_claim','public.payment_claim(uuid,text,text)'),
  ('payment_creation_unknown','public.payment_creation_unknown(text,uuid)'),
  ('payment_release_inventory','public.payment_release_inventory(text)'),
  ('payment_observe','public.payment_observe(text,text,text,jsonb)'),
  ('payment_refund_observe','public.payment_refund_observe(text,text,jsonb)'),
  ('payment_cancel_unstarted','public.payment_cancel_unstarted(text)'),
  ('payment_attach_link','public.payment_attach_link(text,uuid,text,text)'),
  ('payment_expire_unstarted','public.payment_expire_unstarted(text)')
),
-- pg_class is a shared namespace for tables, views, sequences and indexes. Check
-- the implicit PK/UNIQUE index names too, not only the four table names.
proposed_relations(object_name,object_kind) AS (VALUES
  ('payment_gateway_config','table'),('order_payments','table'),('payment_events','table'),('payment_refunds','table'),
  ('payment_gateway_config_pkey','constraint index'),('order_payments_pkey','constraint index'),
  ('order_payments_reference_id_key','constraint index'),('order_payments_session_id_key','constraint index'),
  ('order_payments_payment_request_id_key','constraint index'),('order_payments_payment_id_key','constraint index'),
  ('payment_events_pkey','constraint index'),('payment_refunds_pkey','constraint index'),
  ('order_payments_reconciliation','explicit index')
),
roles_to_check(role_name) AS (VALUES ('anon'),('authenticated'),('service_role'),('authenticator')),
browser_roles(role_name,role_oid) AS (
  SELECT r.rolname::text,r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')
),
membership_walk(browser_name,member_oid,role_oid,path) AS (
  SELECT b.role_name,b.role_oid,b.role_oid,ARRAY[b.role_oid] FROM browser_roles b
  UNION ALL
  SELECT w.browser_name,w.member_oid,m.roleid,w.path||m.roleid
  FROM membership_walk w JOIN pg_catalog.pg_auth_members m ON m.member=w.role_oid
  WHERE NOT m.roleid=ANY(w.path)
),
relations AS (
  SELECT b.table_name,c.oid,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,
    CASE WHEN c.oid IS NOT NULL AND c.relkind IN ('r','p') THEN pg_catalog.row_security_active(c.oid) ELSE true END AS inspection_rls_active
  FROM baseline_tables b LEFT JOIN pg_catalog.pg_class c
    ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',b.table_name))
),
columns_actual AS (
  SELECT e.*,a.attnum,a.attnotnull,a.attidentity::text,a.attgenerated::text,
    CASE WHEN a.attnum IS NOT NULL THEN pg_catalog.format_type(a.atttypid,a.atttypmod) END AS actual_type,
    pg_catalog.md5(pg_catalog.pg_get_expr(d.adbin,d.adrelid)) AS actual_default_md5
  FROM required_columns e LEFT JOIN relations t ON t.table_name=e.table_name
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
),
function_actual AS (
  SELECT e.*,p.oid,p.proname,p.pronamespace,p.proowner,p.proargnames,p.proretset,p.prosecdef,p.proconfig,
    p.provolatile::text,p.pronargdefaults,l.lanname,p.prokind,p.provariadic,p.proisstrict,p.proleakproof,p.proparallel,
    pg_catalog.pg_get_expr(p.proargdefaults,0) AS actual_defaults,p.prorettype,
    CASE WHEN p.oid IS NOT NULL THEN pg_catalog.format_type(p.prorettype,NULL) END AS actual_result_type,
    pg_catalog.md5(pg_catalog.btrim(pg_catalog.replace(p.prosrc,E'\r',''),E' \n\t')) AS actual_body_md5
  FROM required_functions e LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.signature)
  LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
),
required_indexes(index_name,table_name,key_columns,unique_required,predicate_text,descending_columns) AS (VALUES
  ('orders_customer_checkout_key','orders',ARRAY['user_id','checkout_key'],true,'(checkout_key IS NOT NULL)',ARRAY[]::text[]),
  ('orders_display_reference_unique','orders',ARRAY['order_reference'],true,NULL::text,ARRAY[]::text[]),
  ('one_default_address','addresses',ARRAY['user_id'],true,'is_default',ARRAY[]::text[]),
  (NULL::text,'orders',ARRAY['user_id','created_at'],false,NULL::text,ARRAY['created_at'])
),
indexes_actual AS (
  SELECT t.table_name,c.relname::text AS index_name,i.*,am.amname,
    pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate_text,
    NOT EXISTS(SELECT 1 FROM ROWS FROM (pg_catalog.unnest(i.indkey::smallint[]),pg_catalog.unnest(i.indoption::smallint[]),pg_catalog.unnest(i.indclass::oid[]),pg_catalog.unnest(i.indcollation::oid[]))
      WITH ORDINALITY k(num,opt,opclass,coll_oid,ord)
      LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num
      LEFT JOIN pg_catalog.pg_opclass oc ON oc.oid=k.opclass
      WHERE k.ord<=i.indnkeyatts AND (NOT coalesce(oc.opcdefault,false) OR k.coll_oid<>a.attcollation OR k.opt NOT IN (0,3))) AS standard_key_options,
    ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) WITH ORDINALITY k(num,ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num
      WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS key_columns,
    ARRAY(SELECT a.attname::text FROM ROWS FROM (pg_catalog.unnest(i.indkey::smallint[]),pg_catalog.unnest(i.indoption::smallint[])) WITH ORDINALITY k(num,opt,ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num
      WHERE k.ord<=i.indnkeyatts AND (k.opt & 1)=1 ORDER BY k.ord) AS descending_columns
  FROM relations t JOIN pg_catalog.pg_index i ON i.indrelid=t.oid
  JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=c.relam
),
expected_triggers(schema_name,table_name,trigger_name,function_signature,event_bits,update_columns) AS (VALUES
  ('public','orders','orders_assign_display_reference','public.assign_order_reference()',7,ARRAY[]::text[]),
  ('public','orders','orders_preserve_display_reference','public.assign_order_reference()',19,ARRAY['reference_number','reference_year']),
  ('auth','users','on_auth_user_created','public.handle_new_user()',5,ARRAY[]::text[])
),
trigger_actual AS (
  SELECT e.*,t.oid,t.tgfoid,t.tgtype,t.tgenabled,t.tgqual IS NOT NULL AS has_when,
    pg_catalog.octet_length(t.tgargs) AS argument_bytes,
    ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(t.tgattr::smallint[]) x(attnum)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.attnum ORDER BY a.attname) AS actual_update_columns
  FROM expected_triggers e LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',e.schema_name,e.table_name)) AND t.tgname=e.trigger_name AND NOT t.tgisinternal
),
crypto_ready AS (SELECT pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL AS ready),
data_safety AS (
  SELECT (SELECT pg_catalog.count(*)=9 AND pg_catalog.bool_and(CASE WHEN oid IS NOT NULL AND relkind='r'
      THEN NOT inspection_rls_active AND pg_catalog.has_table_privilege(current_user,oid,'SELECT') ELSE false END) FROM relations)
    AND pg_catalog.has_schema_privilege(current_user,'public','USAGE')
    AND NOT EXISTS(SELECT 1 FROM columns_actual WHERE attnum IS NULL OR actual_type<>type_name
      OR attnotnull<>not_null OR attidentity<>identity_kind OR attgenerated<>generated_kind
      OR actual_default_md5 IS DISTINCT FROM default_md5)
    AND (SELECT ready FROM crypto_ready) AS ready
),
-- The bridge runs this one constant SELECT only after catalog/type/visibility
-- checks pass. The salt is SQL-literal-quoted by format, never executable SQL.
data_xml AS MATERIALIZED (
  SELECT CASE WHEN d.ready THEN pg_catalog.query_to_xml(pg_catalog.format($snapshot$
    SELECT pg_catalog.jsonb_build_object(
      'orders',(SELECT pg_catalog.count(*) FROM public.orders),
      'cod_cancelled',(SELECT pg_catalog.count(*) FROM public.orders WHERE payment_method='cod' AND status='Cancelled'),
      'cod_delivered',(SELECT pg_catalog.count(*) FROM public.orders WHERE payment_method='cod' AND status='Delivered'),
      'cod_shipped',(SELECT pg_catalog.count(*) FROM public.orders WHERE payment_method='cod' AND status='Shipped'),
      'online_orders',(SELECT pg_catalog.count(*) FROM public.orders WHERE payment_method<>'cod'),
      'items',(SELECT pg_catalog.count(*) FROM public.order_items),
      'units',(SELECT coalesce(pg_catalog.sum(quantity::bigint),0) FROM public.order_items),
      'products',(SELECT pg_catalog.count(*) FROM public.products),
      'stock',(SELECT coalesce(pg_catalog.sum(stock::bigint),0) FROM public.products),
      'total',(SELECT coalesce(pg_catalog.sum(total),0) FROM public.orders),
      'legacy_orders',(SELECT pg_catalog.count(*) FROM public.orders WHERE checkout_key IS NULL AND checkout_request IS NULL),
      'bad_provenance',(SELECT pg_catalog.count(*) FROM public.orders o WHERE
        (checkout_key IS NULL)<>(checkout_request IS NULL) OR (checkout_request IS NOT NULL AND (
          pg_catalog.jsonb_typeof(checkout_request) IS DISTINCT FROM 'object'
          OR checkout_request->>'paymentMethod' IS DISTINCT FROM payment_method
          OR pg_catalog.jsonb_typeof(checkout_request->'customer') IS DISTINCT FROM 'object'
          OR pg_catalog.jsonb_typeof(checkout_request->'shipping') IS DISTINCT FROM 'object'
          OR CASE WHEN pg_catalog.jsonb_typeof(checkout_request->'items')='array' THEN pg_catalog.jsonb_array_length(checkout_request->'items') ELSE -1 END NOT BETWEEN 1 AND 50
          OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(checkout_request->'items')='array' THEN checkout_request->'items' ELSE '[]'::jsonb END) line
            WHERE pg_catalog.jsonb_typeof(line) IS DISTINCT FROM 'object' OR pg_catalog.jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number'
              OR coalesce(line->>'quantity','') !~ '^([1-9]|10)$' OR coalesce(line->>'productId','')='')
        ))),
      'duplicate_checkout_keys',(SELECT pg_catalog.count(*) FROM (SELECT user_id,checkout_key FROM public.orders WHERE checkout_key IS NOT NULL GROUP BY user_id,checkout_key HAVING pg_catalog.count(*)>1) d),
      'provenance_item_mismatches',(SELECT pg_catalog.count(*) FROM public.orders o WHERE checkout_request IS NOT NULL AND
        (SELECT coalesce(pg_catalog.jsonb_object_agg(product_id,qty),'{}'::jsonb) FROM
          (SELECT product_id,pg_catalog.sum(quantity::bigint) qty FROM public.order_items WHERE order_id=o.id GROUP BY product_id) i)
        IS DISTINCT FROM (SELECT coalesce(pg_catalog.jsonb_object_agg(product_id,qty),'{}'::jsonb) FROM
          (SELECT line->>'productId' product_id,
            pg_catalog.sum(CASE WHEN coalesce(line->>'quantity','') ~ '^([1-9]|10)$' THEN (line->>'quantity')::bigint ELSE 0 END) qty
            FROM pg_catalog.jsonb_array_elements(CASE WHEN pg_catalog.jsonb_typeof(o.checkout_request->'items')='array' THEN o.checkout_request->'items' ELSE '[]'::jsonb END) line
            GROUP BY line->>'productId') q WHERE product_id IS NOT NULL)),
      'invalid_items',(SELECT pg_catalog.count(*) FROM public.order_items i LEFT JOIN public.orders o ON o.id=i.order_id LEFT JOIN public.products p ON p.id=i.product_id
        WHERE o.id IS NULL OR p.id IS NULL OR i.quantity IS NULL OR i.quantity NOT BETWEEN 1 AND 10),
      'bad_money',(SELECT pg_catalog.count(*) FROM public.orders WHERE total IS NULL OR total::text IN ('NaN','Infinity','-Infinity') OR total<0
        OR subtotal<0 OR customization_total<0 OR shipping_fee<0
        OR subtotal::text IN ('NaN','Infinity','-Infinity') OR customization_total::text IN ('NaN','Infinity','-Infinity')
        OR shipping_fee::text IN ('NaN','Infinity','-Infinity') OR total IS DISTINCT FROM subtotal+customization_total+shipping_fee),
      'snapshot_amount_mismatches',(SELECT pg_catalog.count(*) FROM public.orders o LEFT JOIN (
        SELECT order_id,pg_catalog.sum(base_price*quantity) sub,pg_catalog.sum(customization_fee*quantity) custom FROM public.order_items GROUP BY order_id
        ) i ON i.order_id=o.id WHERE i.sub IS DISTINCT FROM o.subtotal OR i.custom IS DISTINCT FROM o.customization_total),
      'invalid_references',(SELECT pg_catalog.count(*) FROM public.orders WHERE reference_year IS NULL OR reference_number IS NULL OR reference_number<=0
        OR reference_year<>extract(year FROM created_at AT TIME ZONE 'UTC')::integer
        OR order_reference IS DISTINCT FROM 'AVG-'||pg_catalog.lpad(reference_year::text,4,'0')||'-'||pg_catalog.lpad(reference_number::text,greatest(4,pg_catalog.length(reference_number::text)),'0')),
      'duplicate_references',(SELECT pg_catalog.count(*) FROM (SELECT order_reference FROM public.orders GROUP BY order_reference HAVING pg_catalog.count(*)>1) d),
      'bad_counters',(SELECT pg_catalog.count(*) FROM (SELECT reference_year,max(reference_number) maximum FROM public.orders GROUP BY reference_year) o
        LEFT JOIN public.order_reference_counters c ON c.reference_year=o.reference_year WHERE c.last_value IS NULL OR c.last_value<o.maximum),
      'extra_counters',(SELECT pg_catalog.count(*) FROM public.order_reference_counters c LEFT JOIN (SELECT DISTINCT reference_year FROM public.orders) o USING(reference_year) WHERE o.reference_year IS NULL),
      'ahead_counters',(SELECT pg_catalog.count(*) FROM public.order_reference_counters c JOIN
        (SELECT reference_year,max(reference_number) maximum FROM public.orders GROUP BY reference_year) o USING(reference_year) WHERE c.last_value>o.maximum),
      'settings_rows',(SELECT pg_catalog.count(*) FROM public.store_settings WHERE id=1),
      'orders_fingerprint',CASE WHEN %2$L::boolean THEN (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(%1$L||coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) ORDER BY o.id COLLATE "C"),'[]'::jsonb)::text,'UTF8')),'hex') FROM (SELECT "id", "user_id", "created_at" AT TIME ZONE 'UTC' AS "created_at", "status", "payment_method", "customer_name", "customer_email", "customer_phone", "ship_address", "ship_city", "ship_province", "ship_postal_code", "subtotal", "customization_total", "shipping_fee", "total", "checkout_key", "checkout_request", "reference_year", "reference_number", "order_reference" FROM public.orders) o) END,
      'items_fingerprint',CASE WHEN %2$L::boolean THEN (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(%1$L||coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM (SELECT "id", "order_id", "product_id", "product_name", "product_slug", "type", "material", "stone", "color", "size", "base_price", "customization_fee", "unit_price", "customized", "quantity" FROM public.order_items) i) END,
      'products_fingerprint',CASE WHEN %2$L::boolean THEN (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(%1$L||coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.id COLLATE "C"),'[]'::jsonb)::text,'UTF8')),'hex') FROM (SELECT "id", "slug", "name", "type", "stone", "material", "price", "stock", "rating", "review_count", "is_new", "is_featured", "customizable_size", "customizable_color", "customization_fee", "sizes", "default_size", "short_description", "details", "images", "added_at", "archived" FROM public.products) p) END,
      'counters_fingerprint',CASE WHEN %2$L::boolean THEN (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(%1$L||coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.reference_year),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.order_reference_counters c) END
    )::text AS payload
  $snapshot$,s.snapshot_salt,s.salt_ready),false,false,'') ELSE NULL::xml END AS doc
  FROM settings s CROSS JOIN data_safety d
),
data_snapshot AS MATERIALIZED (
  SELECT x.payload::jsonb AS payload FROM data_xml d,
    XMLTABLE('/table/row' PASSING d.doc COLUMNS payload text PATH 'payload') x
),
checks(check_id,status,summary,evidence) AS (
  SELECT 'A00/inspection','INFO','Verify dashboard project reference; database name alone is not project identity.',
    pg_catalog.jsonb_build_object('database',pg_catalog.current_database(),'inspection_role',current_user,'session_role',session_user,
      'version',pg_catalog.current_setting('server_version'),'captured_at',pg_catalog.statement_timestamp(),
      'session_read_only',pg_catalog.current_setting('transaction_read_only'),'installer_role',s.intended_deployment_role,
      'candidate_sql_sha256','3679b9dc033472cfed4bf425eac6b0faa1bf31966c141f72c52b72aa3dbc3b63') FROM settings s
  UNION ALL SELECT 'A01/installation-role','REVIEW','Attest that intended_deployment_role is the actual future executor, not just the SQL Editor reader.',
    pg_catalog.jsonb_build_object('intended_role',intended_deployment_role) FROM settings
  UNION ALL SELECT 'A02/snapshot-salt',CASE WHEN salt_ready THEN 'PASS' ELSE 'REVIEW' END,
    'A private >=32-character salt is required for repeatable restricted snapshot hashes; never share the salt.',pg_catalog.jsonb_build_object('configured',salt_ready) FROM settings
  UNION ALL SELECT 'A03/sha256',CASE WHEN ready THEN 'PASS' ELSE 'FAIL' END,'Core SHA-256 support required; no extension is installed by this script.',NULL::jsonb FROM crypto_ready
  UNION ALL
  SELECT 'B/table/'||table_name,CASE WHEN oid IS NOT NULL AND relkind='r' THEN 'PASS' ELSE 'FAIL' END,
    'Required ordinary baseline table.',pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'inspection_rls_active',inspection_rls_active) FROM relations
  UNION ALL
  SELECT 'B/column/'||table_name||'.'||column_name,
    CASE WHEN attnum IS NOT NULL AND actual_type=type_name AND attnotnull=not_null AND attidentity=identity_kind
      AND attgenerated=generated_kind AND actual_default_md5 IS NOT DISTINCT FROM default_md5 THEN 'PASS' ELSE 'FAIL' END,
    'Exact baseline type/nullability/identity/generated/default fingerprint; mismatch needs definition review.',
    pg_catalog.jsonb_build_object('expected_type',type_name,'actual_type',actual_type,'expected_not_null',not_null,'actual_not_null',attnotnull,
      'expected_default_md5',default_md5,'actual_default_md5',actual_default_md5) FROM columns_actual
  UNION ALL
  SELECT 'B/constraint/'||e.table_name||'/'||e.source_name,
    CASE WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=t.oid AND c.contype::text=e.constraint_kind
      AND c.convalidated AND pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_constraintdef(c.oid),'REFERENCES public.','REFERENCES '))=e.definition_md5
      AND (c.contype NOT IN ('p','u') OR EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indexrelid=c.conindid AND i.indisvalid AND i.indisready AND i.indisunique)))
      THEN 'PASS' ELSE 'FAIL' END,
    'Validated exact constraint definition; PK/UNIQUE backing index must be valid/ready. A renamed equivalent constraint is accepted.',
    pg_catalog.jsonb_build_object('kind',e.constraint_kind,'expected_definition_md5',e.definition_md5)
    FROM required_constraints e LEFT JOIN relations t ON t.table_name=e.table_name
  UNION ALL
  SELECT 'B/index/'||coalesce(e.index_name,e.table_name||'/owner-date'),
    CASE WHEN EXISTS(SELECT 1 FROM indexes_actual i WHERE i.table_name=e.table_name AND (e.index_name IS NULL OR i.index_name=e.index_name)
      AND i.amname='btree' AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
      AND i.indisunique=e.unique_required AND i.key_columns=e.key_columns AND i.descending_columns=e.descending_columns AND i.standard_key_options
      AND i.indnatts=i.indnkeyatts AND i.indexprs IS NULL AND i.predicate_text IS NOT DISTINCT FROM e.predicate_text)
      THEN 'PASS' ELSE 'FAIL' END,
    'Required valid/ready/live immediate B-tree index: exact keys, uniqueness, predicate and direction; no expressions or INCLUDE columns.',
    pg_catalog.jsonb_build_object('expected_keys',e.key_columns,'expected_predicate',e.predicate_text) FROM required_indexes e
  UNION ALL
  SELECT 'B/index-inventory/'||table_name||'/'||index_name,
    CASE WHEN NOT (indisvalid AND indisready AND indislive) THEN 'FAIL'
      WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conindid=i.indexrelid AND c.conrelid=i.indrelid)
        OR EXISTS(SELECT 1 FROM required_indexes e WHERE e.table_name=i.table_name AND
          ((e.index_name IS NOT NULL AND e.index_name=i.index_name) OR (e.index_name IS NULL AND e.key_columns=i.key_columns AND e.descending_columns=i.descending_columns)))
      THEN 'INFO' ELSE 'REVIEW' END,
    'Catalog index inventory; unexpected definitions require private compatibility review.',
    pg_catalog.jsonb_build_object('keys',key_columns,'unique',indisunique,'valid',indisvalid,'ready',indisready,
      'definition_md5',pg_catalog.md5(pg_catalog.pg_get_indexdef(indexrelid))) FROM indexes_actual i
  UNION ALL
  SELECT 'B/extra-constraint/'||t.table_name||'/'||c.conname,'REVIEW',
    'Additional constraint can change future checkout/COD behavior; inspect privately.',
    pg_catalog.jsonb_build_object('validated',c.convalidated,'kind',c.contype,'definition_md5',pg_catalog.md5(pg_catalog.pg_get_constraintdef(c.oid)))
    FROM relations t JOIN pg_catalog.pg_constraint c ON c.conrelid=t.oid
    WHERE NOT EXISTS(SELECT 1 FROM required_constraints e WHERE e.table_name=t.table_name AND e.constraint_kind=c.contype::text
      AND e.definition_md5=pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_constraintdef(c.oid),'REFERENCES public.','REFERENCES ')))
  UNION ALL
  SELECT 'B/extra-columns/'||t.table_name,'REVIEW','Additional baseline columns are not covered by the approved manifest; inspect privately.',
    pg_catalog.jsonb_build_object('column',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'default_md5',pg_catalog.md5(pg_catalog.pg_get_expr(d.adbin,d.adrelid)))
    FROM relations t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE NOT EXISTS(SELECT 1 FROM required_columns e WHERE e.table_name=t.table_name AND e.column_name=a.attname)
  UNION ALL
  SELECT 'C/function/'||signature,
    CASE WHEN oid IS NULL AND NOT mandatory THEN 'REVIEW'
      WHEN oid IS NOT NULL AND proargnames IS NOT DISTINCT FROM arg_names
        AND CASE WHEN result_type='addresses' THEN prorettype=pg_catalog.to_regtype('public.addresses')::oid ELSE actual_result_type=result_type END
        AND proretset=returns_set AND prosecdef=definer AND lanname=language_name AND provolatile=volatility
        AND prokind='f' AND provariadic=0 AND NOT proisstrict AND NOT proleakproof AND proparallel='u'
        AND actual_defaults IS NOT DISTINCT FROM CASE WHEN default_count=2 THEN 'NULL::uuid, ''{}''::jsonb'::text ELSE NULL::text END
        AND pronargdefaults=default_count AND proconfig=ARRAY['search_path=""']::text[] AND actual_body_md5=body_md5
        AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc q WHERE q.pronamespace=f.pronamespace AND q.proname=f.proname)=1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN mandatory THEN 'Required exact signature/arguments/result/security/language/volatility/default count/body; no overloads.'
      ELSE 'Saved-address RPC is optional for payment DDL, but its absence/drift needs full-app scope review.' END,
    pg_catalog.jsonb_build_object('present',oid IS NOT NULL,'owner',pg_catalog.pg_get_userbyid(proowner),'actual_arg_names',proargnames,
      'actual_result',actual_result_type,'actual_setof',proretset,'actual_definer',prosecdef,'actual_config',proconfig,
      'expected_body_md5',body_md5,'actual_body_md5',actual_body_md5) FROM function_actual f
  UNION ALL
  SELECT 'D/conflict/relation/'||e.object_name,CASE WHEN c.oid IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'Proposed '||e.object_kind||' name must be absent in public before FIRST installation.',
    pg_catalog.jsonb_build_object('present',c.oid IS NOT NULL,'existing_kind',c.relkind,'existing_owner',pg_catalog.pg_get_userbyid(c.relowner))
    FROM proposed_relations e LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',e.object_name))
  UNION ALL
  SELECT 'D/conflict/function/'||e.function_name,CASE WHEN pg_catalog.count(p.oid)=0 THEN 'PASS' ELSE 'FAIL' END,
    'No public function/procedure overload may share this proposed function name.',pg_catalog.jsonb_build_object('expected_signature',e.signature,'existing_count',pg_catalog.count(p.oid))
    FROM proposed_functions e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name GROUP BY e.function_name,e.signature
  UNION ALL
  SELECT 'D/conflict/type/'||e.object_name,
    CASE WHEN pg_catalog.to_regtype(pg_catalog.format('public.%I',e.object_name)) IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'A standalone type/domain can also block CREATE TABLE even when pg_class has no matching relation.',NULL::jsonb
    FROM proposed_relations e WHERE e.object_kind='table'
  UNION ALL
  SELECT 'D/conflict/column/orders.payment_state',CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('public.orders') AND attname='payment_state' AND attnum>0 AND NOT attisdropped) THEN 'PASS' ELSE 'FAIL' END,
    'The proposed nullable summary column must not already exist.',NULL::jsonb
  UNION ALL
  SELECT 'D/conflict/trigger/'||e.name,CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=pg_catalog.to_regclass('public.orders') AND tgname=e.name) THEN 'PASS' ELSE 'FAIL' END,
    'Proposed order trigger name must be absent, including disabled/internal conflicts.',NULL::jsonb
    FROM (VALUES ('payment_order_created'),('payment_order_guard')) e(name)
  UNION ALL
  SELECT 'E/trigger/'||schema_name||'.'||trigger_name,
    CASE WHEN oid IS NOT NULL AND tgfoid=pg_catalog.to_regprocedure(function_signature) AND tgtype=event_bits AND tgenabled='O'
      AND NOT has_when AND argument_bytes=0 AND actual_update_columns=update_columns THEN 'PASS' ELSE 'FAIL' END,
    'Expected enabled row trigger: exact relation, function, timing/events, UPDATE columns; no added WHEN/arguments.',
    pg_catalog.jsonb_build_object('function',function_signature,'actual_event_bits',tgtype,'actual_enabled',tgenabled,'actual_update_columns',actual_update_columns) FROM trigger_actual
  UNION ALL
  SELECT 'E/extra-trigger/'||n.nspname||'.'||c.relname||'/'||t.tgname,'REVIEW',
    'Unexpected user trigger: review source/dependencies privately for COD, inventory, profile and reference side effects.',
    pg_catalog.jsonb_build_object('enabled',t.tgenabled,'event_bits',t.tgtype,'function',t.tgfoid::regprocedure::text,
      'owner',pg_catalog.pg_get_userbyid(p.proowner),'definer',p.prosecdef,'body_md5',pg_catalog.md5(pg_catalog.btrim(pg_catalog.replace(p.prosrc,E'\r',''),E' \n\t')),
      'trigger_md5',pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid)))
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal
      AND (t.tgrelid IN (SELECT oid FROM relations) OR t.tgrelid=pg_catalog.to_regclass('auth.users'))
      AND NOT EXISTS(SELECT 1 FROM expected_triggers e WHERE e.schema_name=n.nspname AND e.table_name=c.relname AND e.trigger_name=t.tgname)
  UNION ALL
  SELECT 'E/rule/'||t.table_name||'/'||r.rulename,'REVIEW','Unexpected rewrite rule; inspect privately, do not execute its action.',
    pg_catalog.jsonb_build_object('enabled',r.ev_enabled,'definition_md5',pg_catalog.md5(pg_catalog.pg_get_ruledef(r.oid))) FROM relations t JOIN pg_catalog.pg_rewrite r ON r.ev_class=t.oid
  UNION ALL
  SELECT 'E/event-trigger/'||e.evtname,'REVIEW',
    'Database DDL event trigger can add migration-time side effects; review before any installation.',
    pg_catalog.jsonb_build_object('enabled',e.evtenabled,'event',e.evtevent,'tags',e.evttags,'function',e.evtfoid::regprocedure::text,
      'owner',pg_catalog.pg_get_userbyid(e.evtowner),'definer',p.prosecdef,'body_md5',pg_catalog.md5(pg_catalog.btrim(pg_catalog.replace(p.prosrc,E'\r',''),E' \n\t')))
    FROM pg_catalog.pg_event_trigger e JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
  UNION ALL
  SELECT 'E/external-reference/'||c.oid::text,'REVIEW',
    'Foreign key from an unmanifested table references a baseline table; review update/delete and inventory side effects privately.',
    pg_catalog.jsonb_build_object('from_table',c.conrelid::regclass::text,'to_table',c.confrelid::regclass::text,
      'validated',c.convalidated,'definition_md5',pg_catalog.md5(pg_catalog.pg_get_constraintdef(c.oid)))
    FROM pg_catalog.pg_constraint c WHERE c.contype='f' AND c.confrelid IN (SELECT oid FROM relations)
      AND c.conrelid NOT IN (SELECT oid FROM relations WHERE oid IS NOT NULL)
  UNION ALL
  SELECT 'F/role/'||e.role_name,CASE WHEN r.oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,'Required platform role must exist.',
    pg_catalog.jsonb_build_object('superuser',r.rolsuper,'inherit',r.rolinherit,'bypass_rls',r.rolbypassrls,'login',r.rolcanlogin,
      'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication)
    FROM roles_to_check e LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.role_name
  UNION ALL
  SELECT 'F/browser-role-safety/'||b.role_name,
    CASE WHEN r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolcanlogin THEN 'FAIL' ELSE 'PASS' END,
    'Browser roles must not have direct login, role/database creation, replication, superuser or RLS-bypass capabilities.',NULL::jsonb
    FROM browser_roles b JOIN pg_catalog.pg_roles r ON r.oid=b.role_oid
  UNION ALL
  SELECT 'F/browser-dangerous-membership/'||w.browser_name||'/'||r.rolname,'FAIL',
    'Browser role can reach a superuser, RLS-bypass, service role or baseline object owner; membership is conservatively unsafe even with NOINHERIT.',
    pg_catalog.jsonb_build_object('reachable_role',r.rolname,'direct_or_transitive',true)
    FROM membership_walk w JOIN pg_catalog.pg_roles r ON r.oid=w.role_oid
    WHERE r.rolsuper OR r.rolbypassrls OR r.rolname='service_role' OR r.oid IN
      (SELECT relowner FROM relations UNION SELECT proowner FROM function_actual WHERE oid IS NOT NULL UNION SELECT installer_oid FROM settings)
  UNION ALL
  SELECT 'F/membership/'||pg_catalog.pg_get_userbyid(m.member)||'/'||pg_catalog.pg_get_userbyid(m.roleid),'REVIEW',
    'Record role-edge inheritance/SET/admin semantics; NOINHERIT alone is not a privilege boundary.',
    pg_catalog.jsonb_build_object('admin_option',m.admin_option,'inherit_option',pg_catalog.to_jsonb(m)->'inherit_option','set_option',pg_catalog.to_jsonb(m)->'set_option')
    FROM pg_catalog.pg_auth_members m WHERE m.member IN (SELECT role_oid FROM membership_walk UNION SELECT installer_oid FROM settings UNION SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('service_role','authenticator'))
  UNION ALL
  SELECT 'F/browser-function/'||b.role_name||'/'||f.signature,
    CASE WHEN pg_catalog.has_function_privilege(b.role_oid,f.oid,'EXECUTE') THEN 'FAIL' ELSE 'PASS' END,
    'Effective EXECUTE includes PUBLIC and inherited grants; browser must not invoke this privileged prerequisite.',
    pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(f.proowner),'effective_execute',pg_catalog.has_function_privilege(b.role_oid,f.oid,'EXECUTE'))
    FROM function_actual f CROSS JOIN browser_roles b WHERE f.oid IS NOT NULL AND f.deny_browser
  UNION ALL
  SELECT 'F/auth-profile-trigger-owner','REVIEW',
    'handle_new_user is intentionally SECURITY DEFINER and may have PUBLIC EXECUTE in the baseline; trigger return prevents ordinary calls. Confirm trusted ownership and Auth trigger binding, never browser ownership/membership.',
    pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(proowner),'body_matches',actual_body_md5=body_md5) FROM function_actual WHERE signature='public.handle_new_user()'
  UNION ALL
  SELECT 'F/backend-function/'||f.signature,CASE WHEN r.oid IS NOT NULL AND pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE') THEN 'PASS' ELSE 'FAIL' END,
    'Actual backend role requires effective prerequisite EXECUTE.',NULL::jsonb FROM function_actual f
    LEFT JOIN pg_catalog.pg_roles r ON r.rolname='service_role' WHERE f.oid IS NOT NULL AND f.deny_browser
  UNION ALL
  SELECT 'F/backend-table/'||t.table_name,
    CASE WHEN t.oid IS NULL OR t.relkind<>'r' THEN 'FAIL'
      WHEN r.oid IS NOT NULL AND pg_catalog.has_schema_privilege(r.oid,'public','USAGE')
      AND pg_catalog.has_table_privilege(r.oid,t.oid,'SELECT') AND pg_catalog.has_table_privilege(r.oid,t.oid,'INSERT') AND pg_catalog.has_table_privilege(r.oid,t.oid,'UPDATE')
      AND (r.rolsuper OR r.rolbypassrls OR (r.oid=t.relowner AND NOT t.relforcerowsecurity)) THEN 'PASS' ELSE 'FAIL' END,
    'Backend baseline SELECT/INSERT/UPDATE and unfiltered RLS visibility required; FOR UPDATE needs UPDATE privilege.',
    pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(t.relowner),'backend_bypass_rls',r.rolbypassrls)
    FROM relations t LEFT JOIN pg_catalog.pg_roles r ON r.rolname='service_role'
  UNION ALL
  SELECT 'F/backend-identity-sequence',
    CASE WHEN s.oid IS NOT NULL AND s.relkind='S' AND r.oid IS NOT NULL
      AND pg_catalog.has_sequence_privilege(r.oid,s.oid,'USAGE') THEN 'PASS' ELSE 'FAIL' END,
    'order_items identity sequence must exist with effective backend USAGE; no nextval/setval is called.',
    pg_catalog.jsonb_build_object('sequence',s.oid::regclass::text,'owner',pg_catalog.pg_get_userbyid(s.relowner))
    FROM columns_actual a LEFT JOIN relations t ON t.table_name=a.table_name
    LEFT JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_class'::regclass AND d.refclassid='pg_catalog.pg_class'::regclass
      AND d.refobjid=t.oid AND d.refobjsubid=a.attnum AND d.deptype='i'
    LEFT JOIN pg_catalog.pg_class s ON s.oid=d.objid LEFT JOIN pg_catalog.pg_roles r ON r.rolname='service_role'
    WHERE a.table_name='order_items' AND a.column_name='id'
  UNION ALL
  SELECT 'F/browser-schema-create/'||b.role_name,
    CASE WHEN pg_catalog.has_schema_privilege(b.role_oid,'public','CREATE') THEN 'FAIL' ELSE 'PASS' END,
    'Browser must not create objects in the application schema.',NULL::jsonb FROM browser_roles b
  UNION ALL
  SELECT 'F/browser-other-definer/'||b.role_name||'/'||p.oid::regprocedure::text,'REVIEW',
    'Other executable SECURITY DEFINER routine: review trusted ownership/body/dependencies for indirect data or privilege access.',
    pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(p.proowner),'config',p.proconfig,'body_md5',pg_catalog.md5(pg_catalog.btrim(pg_catalog.replace(p.prosrc,E'\r',''),E' \n\t')))
    FROM pg_catalog.pg_proc p CROSS JOIN browser_roles b WHERE p.pronamespace=pg_catalog.to_regnamespace('public') AND p.prosecdef
      AND pg_catalog.has_function_privilege(b.role_oid,p.oid,'EXECUTE') AND p.oid IS DISTINCT FROM pg_catalog.to_regprocedure('public.handle_new_user()')
  UNION ALL
  SELECT 'F/browser-baseline/'||b.role_name||'/'||t.table_name,
    CASE WHEN t.oid IS NULL OR t.relkind<>'r' THEN 'FAIL'
      WHEN pg_catalog.has_table_privilege(b.role_oid,t.oid,'TRUNCATE') THEN 'FAIL'
      WHEN NOT t.relrowsecurity AND (pg_catalog.has_any_column_privilege(b.role_oid,t.oid,'SELECT') OR pg_catalog.has_any_column_privilege(b.role_oid,t.oid,'INSERT') OR pg_catalog.has_any_column_privilege(b.role_oid,t.oid,'UPDATE') OR pg_catalog.has_table_privilege(b.role_oid,t.oid,'DELETE')) THEN 'FAIL'
      WHEN NOT t.relrowsecurity THEN 'REVIEW' ELSE 'PASS' END,
    'Private financial/profile tables require RLS; effective grants alone do not prove row access is denied. Review applicable policies below.',
    CASE WHEN t.oid IS NOT NULL AND t.relkind='r' THEN pg_catalog.jsonb_build_object('select',pg_catalog.has_table_privilege(b.role_oid,t.oid,'SELECT'),'insert',pg_catalog.has_table_privilege(b.role_oid,t.oid,'INSERT'),
      'update',pg_catalog.has_table_privilege(b.role_oid,t.oid,'UPDATE'),'delete',pg_catalog.has_table_privilege(b.role_oid,t.oid,'DELETE'),'truncate',pg_catalog.has_table_privilege(b.role_oid,t.oid,'TRUNCATE'),
      'references',pg_catalog.has_table_privilege(b.role_oid,t.oid,'REFERENCES'),'trigger',pg_catalog.has_table_privilege(b.role_oid,t.oid,'TRIGGER'),
      'any_column_select',pg_catalog.has_any_column_privilege(b.role_oid,t.oid,'SELECT'),
      'any_column_update',pg_catalog.has_any_column_privilege(b.role_oid,t.oid,'UPDATE')) END
    FROM relations t CROSS JOIN browser_roles b WHERE t.table_name NOT IN ('products','collections')
  UNION ALL
  SELECT 'F/browser-policy/'||b.role_name||'/'||t.table_name||'/'||p.polname,'REVIEW',
    'Applicable private-table policy: inspect predicate/function dependencies privately; catalog grant checks cannot certify it.',
    pg_catalog.jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,'using_md5',pg_catalog.md5(pg_catalog.pg_get_expr(p.polqual,p.polrelid)),'check_md5',pg_catalog.md5(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)))
    FROM relations t JOIN pg_catalog.pg_policy p ON p.polrelid=t.oid CROSS JOIN browser_roles b
    WHERE t.table_name NOT IN ('products','collections') AND EXISTS(SELECT 1 FROM pg_catalog.unnest(p.polroles) x(oid)
      WHERE CASE WHEN x.oid=0 THEN true ELSE pg_catalog.pg_has_role(b.role_oid,x.oid,'MEMBER') END)
  UNION ALL
  SELECT 'F/proposed-payment-access/'||e.object_name||'/'||b.role_name,
    CASE WHEN c.oid IS NULL THEN 'PASS' WHEN c.relkind NOT IN ('r','p','v','m','f') THEN 'FAIL'
      WHEN pg_catalog.has_any_column_privilege(b.role_oid,c.oid,'SELECT') OR pg_catalog.has_any_column_privilege(b.role_oid,c.oid,'INSERT')
      OR pg_catalog.has_any_column_privilege(b.role_oid,c.oid,'UPDATE') OR pg_catalog.has_table_privilege(b.role_oid,c.oid,'DELETE') OR pg_catalog.has_table_privilege(b.role_oid,c.oid,'TRUNCATE')
      OR pg_catalog.has_any_column_privilege(b.role_oid,c.oid,'REFERENCES') OR pg_catalog.has_table_privilege(b.role_oid,c.oid,'TRIGGER') THEN 'FAIL' ELSE 'PASS' END,
    'Absent table means no current data access, NOT a verification of future grants. Any existing table is separately a first-install conflict.',
    pg_catalog.jsonb_build_object('present',c.oid IS NOT NULL)
    FROM proposed_relations e CROSS JOIN browser_roles b LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(pg_catalog.format('public.%I',e.object_name)) WHERE e.object_kind='table'
  UNION ALL
  SELECT 'F/proposed-function-access/'||e.function_name||'/'||b.role_name,
    CASE WHEN pg_catalog.count(p.oid) FILTER(WHERE pg_catalog.has_function_privilege(b.role_oid,p.oid,'EXECUTE'))=0 THEN 'PASS' ELSE 'FAIL' END,
    'Check every existing overload for effective browser EXECUTE; absent functions still require post-install ACL verification.',pg_catalog.jsonb_build_object('existing_overloads',pg_catalog.count(p.oid))
    FROM proposed_functions e CROSS JOIN browser_roles b LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=pg_catalog.to_regnamespace('public') AND p.proname=e.function_name GROUP BY e.function_name,b.role_name,b.role_oid
  UNION ALL
  SELECT 'F/installer-role',CASE WHEN r.oid IS NOT NULL AND pg_catalog.has_schema_privilege(r.oid,'public','CREATE') AND pg_catalog.has_schema_privilege(r.oid,'public','USAGE')
      AND EXISTS(SELECT 1 FROM relations t WHERE t.table_name='orders' AND (r.rolsuper OR r.oid=t.relowner OR pg_catalog.pg_has_role(r.oid,t.relowner,'USAGE')))
      AND EXISTS(SELECT 1 FROM relations t WHERE t.table_name='orders' AND pg_catalog.has_table_privilege(r.oid,t.oid,'REFERENCES'))
      AND EXISTS(SELECT 1 FROM relations t WHERE t.table_name='profiles' AND pg_catalog.has_table_privilege(r.oid,t.oid,'REFERENCES')) THEN 'PASS' ELSE 'FAIL' END,
    'Future executor must create in public, alter orders and reference order/profile keys; never change role/grants to make this report pass.',
    pg_catalog.jsonb_build_object('role',s.intended_deployment_role,'superuser',r.rolsuper) FROM settings s LEFT JOIN pg_catalog.pg_roles r ON r.oid=s.installer_oid
  UNION ALL
  SELECT 'F/owner-review/'||t.table_name,'REVIEW','Confirm expected owner and all paths to owner privileges; ordinary revokes do not constrain trusted owners/superusers.',
    pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(t.relowner),'owner_is_installer',t.relowner=s.installer_oid) FROM relations t CROSS JOIN settings s WHERE t.oid IS NOT NULL
  UNION ALL
  SELECT 'F/backend-future-owner',
    CASE WHEN r.oid IS NULL OR s.installer_oid IS NULL THEN 'FAIL'
      WHEN r.rolsuper OR pg_catalog.pg_has_role(r.oid,s.installer_oid,'MEMBER') THEN 'FAIL' ELSE 'PASS' END,
    'Backend must not be the future payment-object owner or reach that owner role; owner privileges would bypass append-only audit revokes.',
    pg_catalog.jsonb_build_object('backend_role','service_role','future_owner',s.intended_deployment_role)
    FROM settings s LEFT JOIN pg_catalog.pg_roles r ON r.rolname='service_role'
  UNION ALL
  SELECT 'F/default-acl/'||pg_catalog.pg_get_userbyid(d.defaclrole)||'/'||coalesce(n.nspname,'GLOBAL')||'/'||d.defaclobjtype::text||'/'||a.grantee||'/'||a.privilege_type,
    'REVIEW','Default ACLs belong to the actual object creator, not just the inspection role. Review GLOBAL plus public and inherited grantees; the migration resets direct service_role table grants but cannot erase inherited grants.',
    pg_catalog.jsonb_build_object('creator',pg_catalog.pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'object_kind',d.defaclobjtype,
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable,
      'actual_installer_defaults',d.defaclrole=s.installer_oid)
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a CROSS JOIN settings s WHERE d.defaclnamespace=0 OR n.nspname='public'
  UNION ALL
  SELECT 'F/inherited-default-risk/'||pg_catalog.pg_get_userbyid(a.grantee)||'/'||a.privilege_type,'FAIL',
    'Actual installer table defaults grant an inherited role privileges the migration does not directly revoke. Browser grants or backend audit mutation can survive direct revokes; review before installation.',
    pg_catalog.jsonb_build_object('creator',pg_catalog.pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),
      'grantee',pg_catalog.pg_get_userbyid(a.grantee),'privilege',a.privilege_type)
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a CROSS JOIN settings s
    WHERE d.defaclrole=s.installer_oid AND d.defaclobjtype='r' AND (d.defaclnamespace=0 OR n.nspname='public')
      AND a.grantee<>0 AND a.grantee NOT IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
      AND (EXISTS(SELECT 1 FROM browser_roles b WHERE pg_catalog.pg_has_role(b.role_oid,a.grantee,'MEMBER'))
        OR (a.privilege_type IN ('UPDATE','DELETE','TRUNCATE','TRIGGER') AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles r
          WHERE r.rolname='service_role' AND pg_catalog.pg_has_role(r.oid,a.grantee,'MEMBER'))))
  UNION ALL
  SELECT 'F/default-acl-builtins','REVIEW','No pg_default_acl row means built-in defaults, including PUBLIC function EXECUTE, not an empty ACL. Attest defaults for the actual installer and verify effective post-install privileges.',NULL::jsonb
  UNION ALL
  SELECT 'G/data-visible',CASE WHEN ready THEN 'PASS' ELSE 'FAIL' END,
    'Exact data checks run only with compatible baseline columns/defaults and unfiltered inspection visibility; otherwise NOT VERIFIED.',NULL::jsonb FROM data_safety
  UNION ALL
  SELECT 'G/snapshot','INFO','Restricted aggregate snapshot and private-salted SHA-256 hashes; no customer rows returned. Reuse salt and approved field lists for comparisons.',payload FROM data_snapshot
  UNION ALL
  SELECT 'G/known-order-baseline',CASE WHEN (payload->>'orders')::bigint=5 AND (payload->>'cod_cancelled')::bigint=2
      AND (payload->>'cod_delivered')::bigint=1 AND (payload->>'cod_shipped')::bigint=2 AND (payload->>'online_orders')::bigint=0 THEN 'PASS' ELSE 'FAIL' END,
    'Compare with supplied five-COD baseline. Drift requires a refreshed approved snapshot, never data repair.',
    payload-ARRAY['orders_fingerprint','items_fingerprint','products_fingerprint','counters_fingerprint'] FROM data_snapshot
  UNION ALL
  SELECT 'G/invariant/'||e.key,CASE WHEN (d.payload->>e.key)::bigint=0 THEN 'PASS' ELSE 'FAIL' END,e.explanation,
    pg_catalog.jsonb_build_object('violations',d.payload->e.key) FROM data_snapshot d CROSS JOIN (VALUES
      ('bad_provenance','Checkout metadata must be paired, well-shaped and match the order method.'),
      ('provenance_item_mismatches','Stored checkout product/quantity totals must match historical item snapshots; this cannot prove original stock deduction.'),
      ('duplicate_checkout_keys','No duplicated owner/checkout key.'),('invalid_items','Items must reference existing orders/products with valid quantities.'),
      ('bad_money','Historical totals must be finite/nonnegative and arithmetically consistent.'),
      ('invalid_references','Generated references, positive numbers and UTC years must agree.'),('duplicate_references','No repeated display reference.'),
      ('bad_counters','Each referenced year requires a positive counter at least its allocated maximum. Never reset it.')) e(key,explanation)
  UNION ALL
  SELECT 'G/legacy-provenance',CASE WHEN (payload->>'legacy_orders')::bigint=0 THEN 'PASS' ELSE 'REVIEW' END,
    'Legacy orders with BOTH checkout fields NULL do not prove a prior deduction and must not acquire invented provenance.',pg_catalog.jsonb_build_object('legacy_orders',payload->'legacy_orders') FROM data_snapshot
  UNION ALL
  SELECT 'G/historical-pricing',CASE WHEN (payload->>'snapshot_amount_mismatches')::bigint=0 THEN 'PASS' ELSE 'REVIEW' END,
    'Review item/order snapshot discrepancies without repricing historical orders from today''s catalog.',pg_catalog.jsonb_build_object('mismatches',payload->'snapshot_amount_mismatches') FROM data_snapshot
  UNION ALL
  SELECT 'G/reference-counter-extras',CASE WHEN (payload->>'extra_counters')::bigint=0 AND (payload->>'ahead_counters')::bigint=0 THEN 'PASS' ELSE 'REVIEW' END,
    'A counter ahead of current rows can reflect reserved/deleted history; never lower it automatically.',
    pg_catalog.jsonb_build_object('years_without_orders',payload->'extra_counters','years_ahead_of_maximum',payload->'ahead_counters') FROM data_snapshot
  UNION ALL
  SELECT 'G/store-settings',CASE WHEN (payload->>'settings_rows')::bigint=1 THEN 'PASS' ELSE 'FAIL' END,'Exactly one ID=1 settings row is required.',pg_catalog.jsonb_build_object('rows',payload->'settings_rows') FROM data_snapshot
  UNION ALL
  SELECT 'H/COD-side-effects','REVIEW','The proposed BEFORE UPDATE guard queries/locks order_payments on EVERY order update, including COD. Verify backend SELECT/UPDATE on that future table and trigger compatibility. Install must not restock the two Cancelled orders; no mutation smoke test is part of this report.',NULL::jsonb
  UNION ALL
  SELECT 'H/locks/'||t.table_name||'/'||l.mode,'REVIEW','Other sessions currently hold/wait for relation locks. New orders DDL needs an approved quiet window; five rows does not guarantee lock availability.',
    pg_catalog.jsonb_build_object('held',pg_catalog.count(*) FILTER(WHERE l.granted),'waiting',pg_catalog.count(*) FILTER(WHERE NOT l.granted))
    FROM relations t JOIN pg_catalog.pg_locks l ON l.relation=t.oid AND l.pid IS DISTINCT FROM pg_catalog.pg_backend_pid() GROUP BY t.table_name,l.mode
  UNION ALL
  SELECT 'H/manual-approval','REVIEW','Project identity, actual deployment-role attestation, backup/restore evidence, immutable checkout/stock provenance, approved artifact/window, hosted Supabase/PostgREST validation and explicit shared-project approval remain human requirements. No PASS authorizes installation or payment enablement.',NULL::jsonb
  UNION ALL
  SELECT 'H/flags','REVIEW','SQL cannot inspect server environment flags. Obtain operator evidence that XENDIT_PAYMENTS_ENABLED and XENDIT_DEPLOYMENT_VALIDATED remain false; this script never changes them.',NULL::jsonb
),
report AS (
  SELECT * FROM checks
  UNION ALL
  SELECT 'Z99/decision',CASE WHEN pg_catalog.count(*) FILTER(WHERE status='FAIL')>0 THEN 'FAIL' ELSE 'REVIEW' END,
    CASE WHEN pg_catalog.count(*) FILTER(WHERE status='FAIL')>0 THEN 'NO-GO: failed technical checks. Do not install.'
      ELSE 'Technical checks passed; NO-GO pending documented human review/approval. This is NOT deployment authorization.' END,
    pg_catalog.jsonb_build_object('pass',pg_catalog.count(*) FILTER(WHERE status='PASS'),'fail',pg_catalog.count(*) FILTER(WHERE status='FAIL'),
      'review',pg_catalog.count(*) FILTER(WHERE status='REVIEW'),'info',pg_catalog.count(*) FILTER(WHERE status='INFO'),
      'data_snapshot_emitted',EXISTS(SELECT 1 FROM data_snapshot),'script_mode','SELECT_ONLY_PRE_INSTALL') FROM checks
)
SELECT check_id,status,summary,evidence FROM report ORDER BY check_id,status;
