-- FORWARD ONLY, PROPOSED. Never run against the shared project from this task.
-- Requires the four installed checkout/cancellation/reference migrations.
-- No existing records are backfilled or relabeled. Installed functions are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.payment_gateway_config (
  id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.payment_gateway_config(id,enabled) values(true,false);
alter table public.orders add column payment_state text;
create table public.order_payments (
  order_id text primary key references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  reference_id text not null unique default ('avgpay_'||replace(gen_random_uuid()::text,'-','')),
  environment text not null default 'test' check(environment='test'),
  amount_cents bigint not null check(amount_cents>0 and amount_cents<=9999999999),
  currency text not null default 'PHP' check(currency='PHP'),
  method text not null check(method in ('gcash','maya','card')),
  status text not null default 'created' check(status in
    ('created','creating','unknown','pending','paid','failed','expired','cancelled','refunded','review')),
  inventory_released boolean not null default false,
  business_id text, session_id text unique, payment_request_id text unique, payment_id text unique,
  checkout_url text, claim_token uuid, claimed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '30 minutes'),
  paid_at timestamptz, updated_at timestamptz not null default clock_timestamp(),
  refunded_cents bigint not null default 0 check(refunded_cents>=0 and refunded_cents<=amount_cents),
  last_attempt_status text, review_reason text
);
create index order_payments_reconciliation on public.order_payments(status,expires_at);
create table public.payment_events (
  event_key text primary key check(length(event_key) between 1 and 200),
  order_id text not null references public.order_payments(order_id),
  received_at timestamptz not null default clock_timestamp(),
  source text not null, result text not null, observation jsonb not null
);
create table public.payment_refunds (
  refund_id text primary key, order_id text not null references public.order_payments(order_id),
  amount_cents bigint not null check(amount_cents>0),
  status text not null check(status in ('PENDING','FAILED','SUCCEEDED')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.payment_gateway_config enable row level security;
alter table public.order_payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_refunds enable row level security;
revoke all on public.payment_gateway_config,public.order_payments,public.payment_events from public,anon,authenticated;
revoke all on public.payment_refunds from public,anon,authenticated;
-- Hosted projects can default-grant ALL to service_role. Reset those effective
-- table grants too before defining the append-only audit permissions explicitly.
revoke all on public.payment_gateway_config,public.order_payments,public.payment_events,public.payment_refunds from service_role;
grant select,update on public.payment_gateway_config to service_role;
grant select,insert,update on public.order_payments to service_role;
grant select,insert on public.payment_events to service_role;
grant select,insert,update on public.payment_refunds to service_role;

create function public.xendit_payment_version() returns integer language sql stable
security invoker set search_path='' as $$
  select case when enabled then 1 else 0 end from public.payment_gateway_config where id;
$$;

-- Every new online order is tracked, including calls from an older application.
-- An unenabled database gate rolls the ENTIRE checkout back, including inventory.
create function public.payment_order_created() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
  if new.payment_method<>'cod' then
    if not coalesce((select enabled from public.payment_gateway_config where id),false) then
      raise exception 'Online payments disabled' using errcode='P4000';
    end if;
    if new.checkout_key is null or jsonb_typeof(new.checkout_request) is distinct from 'object'
      or new.total is null or new.total::text in ('NaN','Infinity','-Infinity') or new.total<=0 then
      raise exception 'Trusted positive checkout required' using errcode='P4001';
    end if;
    insert into public.order_payments(order_id,customer_id,amount_cents,method)
      values(new.id,new.user_id,(new.total*100)::bigint,new.payment_method);
    update public.orders set payment_state='created' where id=new.id;
  end if;
  return new;
end; $$;
create trigger payment_order_created after insert on public.orders
for each row execute function public.payment_order_created();

-- Existing cancel RPCs already own the order lock. This trigger serializes them
-- against payment observations and prevents their restock path while money is at risk.
create function public.payment_order_guard() returns trigger language plpgsql
security invoker set search_path='' as $$
declare p public.order_payments;
begin
  select * into p from public.order_payments where order_id=old.id for update;
  if found then
    if (new.user_id,new.total,new.payment_method,new.checkout_key,new.checkout_request)
      is distinct from (old.user_id,old.total,old.payment_method,old.checkout_key,old.checkout_request) then
      raise exception 'Payment order immutable' using errcode='P4001';
    end if;
    new.payment_state:=p.status;
    if new.status='Cancelled' and old.status<>'Cancelled'
      and p.status not in ('failed','expired','cancelled') then
      raise exception 'Close payment before cancellation' using errcode='P4002';
    end if;
  end if;
  if new.payment_method<>'cod' and new.status is distinct from old.status
    and new.status in ('Processing','Shipped','Delivered')
    and (p.status is distinct from 'paid' or coalesce(p.inventory_released,false)) then
    raise exception 'Verified payment required' using errcode='P4003';
  end if;
  return new;
end; $$;
create trigger payment_order_guard before update on public.orders
for each row execute function public.payment_order_guard();

-- Lock order everywhere: owner profile -> order -> payment -> items -> products
-- (ascending product ID). No provider I/O occurs inside a database transaction.
create function public.payment_claim(p_user_id uuid,p_order_id text,p_business_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.order_payments; claimed boolean:=false;
begin
  perform 1 from public.profiles where id=p_user_id and role='customer' for share;
  if not found then raise exception 'Customer required' using errcode='P4004'; end if;
  select * into o from public.orders where id=p_order_id and user_id=p_user_id for update;
  if not found then raise exception 'Order not found' using errcode='P4005'; end if;
  select * into p from public.order_payments where order_id=o.id for update;
  if not found then raise exception 'No managed payment' using errcode='P4001'; end if;
  if o.status<>'Pending' then raise exception 'Order not payable' using errcode='P4002'; end if;
  if p.status='created' and p.expires_at>clock_timestamp() then
    update public.order_payments set status='creating',claim_token=gen_random_uuid(),
      claimed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 minutes',
      business_id=p_business_id,updated_at=clock_timestamp() where order_id=o.id returning * into p;
    update public.orders set payment_state=p.status where id=o.id;
    insert into public.payment_events(event_key,order_id,source,result,observation)
      values('claim:'||p.claim_token,o.id,'initiation','creating','{}');
    claimed:=true;
  end if;
  return to_jsonb(p)||jsonb_build_object('claimed',claimed,'customer_name',o.customer_name,'customer_email',o.customer_email);
end; $$;

create function public.payment_creation_unknown(p_order_id text,p_claim_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.orders where id=p_order_id for update;
  update public.order_payments set status='unknown',review_reason='creation_outcome_unknown',updated_at=clock_timestamp()
    where order_id=p_order_id and claim_token=p_claim_token and status='creating';
  if found then
    insert into public.payment_events(event_key,order_id,source,result,observation)
      values('unknown:'||p_claim_token,p_order_id,'initiation','unknown','{}') on conflict do nothing;
  end if;
  update public.orders set payment_state=(select status from public.order_payments where order_id=p_order_id) where id=p_order_id;
end; $$;

-- Internal service-only helper; re-locks and checks the terminal payment state.
create function public.payment_release_inventory(p_order_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.order_payments; line record;
begin
  select * into o from public.orders where id=p_order_id for update;
  select * into p from public.order_payments where order_id=p_order_id for update;
  if p.status not in ('failed','expired','cancelled') then raise exception 'Unsafe release' using errcode='P4002'; end if;
  if p.inventory_released then return; end if;
  -- A prior existing cancellation already restored inventory. Never do it twice.
  if o.status<>'Cancelled' then
    if o.status<>'Pending' then raise exception 'Order already in fulfillment' using errcode='P4002'; end if;
    perform 1 from public.order_items where order_id=p_order_id order by id for update;
    if (select count(*) from public.order_items where order_id=p_order_id) not between 1 and 50
      or exists(select 1 from public.order_items where order_id=p_order_id and (quantity not between 1 and 10 or product_id is null)) then
      raise exception 'Invalid inventory provenance' using errcode='P4001';
    end if;
    perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_order_id) order by id for update;
    for line in select product_id,sum(quantity)::bigint quantity from public.order_items where order_id=p_order_id group by product_id order by product_id loop
      update public.products set stock=stock+line.quantity where id=line.product_id and stock<=2147483647-line.quantity;
      if not found then raise exception 'Release failed' using errcode='P4001'; end if;
    end loop;
    update public.orders set status='Cancelled' where id=p_order_id;
  end if;
  update public.order_payments set inventory_released=true where order_id=p_order_id;
end; $$;

create function public.payment_observe(p_order_id text,p_event_key text,p_source text,p_observation jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders; p public.order_payments; who uuid; next_state text; reason text; duplicate boolean;
begin
  select customer_id into who from public.order_payments where order_id=p_order_id;
  if not found then raise exception 'Payment not found' using errcode='P4005'; end if;
  perform 1 from public.profiles where id=who for share;
  select * into o from public.orders where id=p_order_id for update;
  select * into p from public.order_payments where order_id=p_order_id for update;
  if exists(select 1 from public.payment_events where event_key=p_event_key) then return to_jsonb(p); end if;
  if p_observation->>'referenceId' is distinct from p.reference_id
    or p_observation->>'currency' is distinct from p.currency
    or p_observation->>'businessId' is distinct from p.business_id
    or coalesce(p_observation->>'amountCents','') !~ '^[0-9]{1,10}$'
    or (case when p_observation->>'amountCents' ~ '^[0-9]{1,10}$'
      then (p_observation->>'amountCents')::bigint else -1 end) <>p.amount_cents
    or coalesce(p_observation->>'sessionId','') !~ '^ps-[A-Za-z0-9-]{1,100}$'
    or (p.session_id is not null and p.session_id is distinct from p_observation->>'sessionId') then
    insert into public.payment_events values(p_event_key,p.order_id,clock_timestamp(),p_source,'rejected','{"reason":"identity_or_amount_mismatch"}');
    return to_jsonb(p)||'{"rejected":true}'::jsonb;
  end if;
  next_state:=p_observation->>'state';
  if next_state not in ('pending','paid','expired','cancelled','review') or next_state is null then
    raise exception 'Invalid observation' using errcode='P4001';
  end if;
  if next_state='paid' and (p_observation->>'sessionStatus' is distinct from 'COMPLETED'
    or p_observation->>'requestStatus' is distinct from 'SUCCEEDED'
    or coalesce(p_observation->>'paymentRequestId','') !~ '^pr-[A-Za-z0-9-]{1,100}$') then
    raise exception 'Successful payment request required' using errcode='P4001';
  end if;
  if next_state='paid' and p.paid_at is not null and p.payment_request_id is not null
    and p.payment_request_id is distinct from p_observation->>'paymentRequestId' then
    next_state:='review'; reason:='multiple_successful_payment_requests';
  elsif next_state='paid' and p.status<>'refunded' and (o.status='Cancelled' or p.inventory_released or p.status in ('expired','cancelled','failed')) then
    next_state:='review'; reason:='late_success_inventory_not_reserved';
  elsif p.status in ('paid','refunded') then
    next_state:=p.status; -- Old expiry/failure/pending delivery cannot undo payment.
  elsif p.status='review' and (p.inventory_released or p.review_reason in ('late_success_inventory_not_reserved','partial_refund','multiple_successful_payment_requests')) then
    next_state:='review'; reason:=p.review_reason; -- An incident requires explicit operator resolution.
  elsif p.status in ('expired','cancelled','failed') and next_state='pending' then
    next_state:=p.status;
  end if;
  update public.order_payments set status=next_state,session_id=p_observation->>'sessionId',
    payment_request_id=case when paid_at is not null then coalesce(payment_request_id,p_observation->>'paymentRequestId') else coalesce(p_observation->>'paymentRequestId',payment_request_id) end,
    payment_id=case when paid_at is not null then coalesce(payment_id,p_observation->>'paymentId') else coalesce(p_observation->>'paymentId',payment_id) end,
    last_attempt_status=p_observation->>'requestStatus',
    review_reason=case when next_state='review' then coalesce(reason,'provider_state_requires_review') else null end,
    paid_at=case when p_observation->>'state'='paid' then coalesce(paid_at,clock_timestamp()) else paid_at end,
    updated_at=clock_timestamp() where order_id=p_order_id returning * into p;
  update public.orders set payment_state=p.status where id=p_order_id;
  if p.status in ('expired','cancelled','failed') then perform public.payment_release_inventory(p_order_id); end if;
  insert into public.payment_events(event_key,order_id,source,result,observation)
    values(p_event_key,p_order_id,p_source,p.status,p_observation);
  select * into p from public.order_payments where order_id=p_order_id;
  return to_jsonb(p);
end; $$;

create function public.payment_refund_observe(p_order_id text,p_payment_id text,p_refunds jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.order_payments; who uuid; item jsonb; refunded bigint; amount bigint;
begin
  select customer_id into who from public.order_payments where order_id=p_order_id;
  perform 1 from public.profiles where id=who for share;
  perform 1 from public.orders where id=p_order_id for update;
  select * into p from public.order_payments where order_id=p_order_id for update;
  if p.payment_id is distinct from p_payment_id or p.paid_at is null
    or jsonb_typeof(p_refunds) is distinct from 'array' or jsonb_array_length(p_refunds)>1000 then
    raise exception 'Refund mismatch' using errcode='P4001';
  end if;
  for item in select value from jsonb_array_elements(p_refunds) loop
    if coalesce(item->>'id','') !~ '^rfd-[0-9a-f-]{36}$'
      or coalesce(item->>'status','') not in ('PENDING','FAILED','SUCCEEDED')
      or coalesce(item->>'amountCents','') !~ '^[0-9]{1,10}$' then
      raise exception 'Invalid refund' using errcode='P4001';
    end if;
    amount:=(item->>'amountCents')::bigint;
    if amount<=0 or amount>p.amount_cents then raise exception 'Invalid refund amount' using errcode='P4001'; end if;
    insert into public.payment_refunds(refund_id,order_id,amount_cents,status)
      values(item->>'id',p_order_id,amount,item->>'status')
      on conflict(refund_id) do update set status=case when payment_refunds.status='SUCCEEDED' then 'SUCCEEDED' else excluded.status end,
        updated_at=clock_timestamp() where payment_refunds.order_id=p_order_id and payment_refunds.amount_cents=amount;
    if not found then raise exception 'Refund ownership conflict' using errcode='P4001'; end if;
    insert into public.payment_events(event_key,order_id,source,result,observation)
      values('refund:'||(item->>'id')||':'||(item->>'status'),p_order_id,'refund-reconciliation','observed',item)
      on conflict do nothing;
  end loop;
  select coalesce(sum(amount_cents),0) into refunded from public.payment_refunds where order_id=p_order_id and status='SUCCEEDED';
  if refunded>p.amount_cents then raise exception 'Excess refund requires review' using errcode='P4001'; end if;
  update public.order_payments set refunded_cents=refunded,
    status=case when review_reason='multiple_successful_payment_requests' then 'review' when refunded=amount_cents then 'refunded' when refunded>0 then 'review' else status end,
    review_reason=case when review_reason='multiple_successful_payment_requests' then review_reason when refunded=amount_cents then null when refunded>0 then 'partial_refund' else review_reason end,
    updated_at=clock_timestamp() where order_id=p_order_id returning * into p;
  update public.orders set payment_state=p.status where id=p_order_id;
  -- Money returned is NOT an inventory return. No item/product/order-status writes.
  insert into public.payment_events(event_key,order_id,source,result,observation)
    values('refund-total:'||p_order_id||':'||refunded,p_order_id,'refund-reconciliation',p.status,
      jsonb_build_object('refundedCents',refunded)) on conflict do nothing;
  return to_jsonb(p);
end; $$;

create function public.payment_cancel_unstarted(p_order_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare who uuid;
begin
  select customer_id into who from public.order_payments where order_id=p_order_id;
  perform 1 from public.profiles where id=who for share;
  perform 1 from public.orders where id=p_order_id for update;
  perform 1 from public.order_payments where order_id=p_order_id for update;
  update public.order_payments set status='cancelled',updated_at=clock_timestamp()
    where order_id=p_order_id and status='created' and claim_token is null;
  if found then
    update public.orders set payment_state='cancelled' where id=p_order_id;
    perform public.payment_release_inventory(p_order_id);
    insert into public.payment_events(event_key,order_id,source,result,observation)
      values('unstarted-cancel:'||p_order_id,p_order_id,'cancellation','cancelled','{}') on conflict do nothing;
  end if;
end; $$;

create function public.payment_attach_link(p_order_id text,p_claim_token uuid,p_session_id text,p_url text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.orders where id=p_order_id for update;
  update public.order_payments set session_id=p_session_id,checkout_url=p_url
    where order_id=p_order_id and claim_token=p_claim_token and (session_id is null or session_id=p_session_id);
  if not found then raise exception 'Payment claim conflict' using errcode='P4001'; end if;
end; $$;

create function public.payment_expire_unstarted(p_order_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare who uuid;
begin
  select customer_id into who from public.order_payments where order_id=p_order_id;
  perform 1 from public.profiles where id=who for share;
  perform 1 from public.orders where id=p_order_id for update;
  perform 1 from public.order_payments where order_id=p_order_id for update;
  update public.order_payments set status='expired',updated_at=clock_timestamp()
    where order_id=p_order_id and status='created' and claim_token is null and expires_at<=clock_timestamp();
  if found then
    update public.orders set payment_state='expired' where id=p_order_id;
    perform public.payment_release_inventory(p_order_id);
    insert into public.payment_events(event_key,order_id,source,result,observation)
      values('unstarted:'||p_order_id,p_order_id,'sweeper','expired','{}') on conflict do nothing;
  end if;
end; $$;

-- RPCs are invoker functions. Internal release needs execution from trusted RPCs
-- so service_role has it too; it re-locks and verifies terminal state itself.
revoke all on function public.xendit_payment_version(),public.payment_order_created(),public.payment_order_guard(),
  public.payment_claim(uuid,text,text),public.payment_creation_unknown(text,uuid),public.payment_release_inventory(text),
  public.payment_observe(text,text,text,jsonb),public.payment_attach_link(text,uuid,text,text),public.payment_expire_unstarted(text),public.payment_cancel_unstarted(text),public.payment_refund_observe(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.xendit_payment_version(),public.payment_order_created(),public.payment_order_guard(),
  public.payment_claim(uuid,text,text),public.payment_creation_unknown(text,uuid),public.payment_release_inventory(text),
  public.payment_observe(text,text,text,jsonb),public.payment_attach_link(text,uuid,text,text),public.payment_expire_unstarted(text),public.payment_cancel_unstarted(text),public.payment_refund_observe(text,text,jsonb)
  to service_role;
notify pgrst,'reload schema';
commit;
