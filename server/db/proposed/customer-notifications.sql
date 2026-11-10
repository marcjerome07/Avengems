-- In-app customer notifications (header bell). One row per order status change.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Until this runs, order status changes keep working and the bell shows no notifications.
begin;

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id text not null references public.orders (id) on delete cascade,
  type text not null check (type in ('placed','processing','shipped','delivered','cancelled')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- Each order status produces one notification, even if the change is replayed.
  constraint customer_notifications_once unique (order_id, type)
);

-- If the table already existed without the unique key (e.g. created by hand), add it.
do $$
begin
  if not exists (select 1 from pg_constraint
      where conrelid = 'public.customer_notifications'::regclass and conname = 'customer_notifications_once') then
    alter table public.customer_notifications
      add constraint customer_notifications_once unique (order_id, type);
  end if;
end $$;

-- Bell list (latest first) and unread count, both per customer.
create index if not exists customer_notifications_user_recent
  on public.customer_notifications (user_id, created_at desc, id desc);
create index if not exists customer_notifications_user_unread
  on public.customer_notifications (user_id) where read_at is null;

-- Server-only: Express (secret key) reads and writes, always scoped to the signed-in
-- customer. RLS on with no policies and no grants means browsers can never read rows.
alter table public.customer_notifications enable row level security;
revoke all on public.customer_notifications from public, anon, authenticated;

commit;

-- Verify (read-only):
-- select relrowsecurity from pg_class where oid = 'public.customer_notifications'::regclass;  -- expect true
-- select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.customer_notifications'::regclass and contype = 'u';            -- expect UNIQUE (order_id, type)
