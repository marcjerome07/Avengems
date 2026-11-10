-- Order status email notifications + shipping/cancellation details.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run, and it
-- upgrades a table created by an earlier draft of this file (3-column unique key).
-- Order status updates keep working before this runs; emails are only recorded and
-- sent once order_notifications exists.
begin;

alter table public.orders
  add column if not exists tracking_number text
    check (tracking_number is null or length(tracking_number) between 4 and 50),
  add column if not exists tracking_carrier text
    check (tracking_carrier is null or tracking_carrier in ('J&T Express','LBC','Ninja Van','Flash Express','Other')),
  add column if not exists cancellation_reason text
    check (cancellation_reason is null or length(cancellation_reason) between 1 and 500);

-- One row per (order, status, recipient, kind). The unique key is what makes sending
-- idempotent: retries, checkout replays and the startup sweep reuse the same row, while a
-- customer email and a store alert stay separate even if they share an address.
create table if not exists public.order_notifications (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  status text not null check (status in ('Pending','Processing','Shipped','Delivered','Cancelled')),
  recipient text not null check (length(recipient) between 3 and 254),
  kind text not null default 'customer' check (kind in ('customer','store')),
  sent_at timestamptz,
  error text check (error is null or length(error) <= 300),
  attempts int not null default 0 check (attempts >= 0),
  channel text check (channel is null or channel in ('smtp','console')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_notifications_once unique (order_id, status, recipient, kind)
);

-- Upgrade path for a table created by an earlier draft: add any missing columns, then
-- replace a unique key that does not include kind. Widening a unique key cannot conflict
-- with existing rows.
alter table public.order_notifications
  add column if not exists kind text not null default 'customer' check (kind in ('customer','store')),
  add column if not exists channel text check (channel is null or channel in ('smtp','console')),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
do $$
declare existing text;
begin
  select pg_get_constraintdef(oid) into existing from pg_constraint
    where conrelid = 'public.order_notifications'::regclass and conname = 'order_notifications_once';
  if existing is not null and existing <> 'UNIQUE (order_id, status, recipient, kind)' then
    alter table public.order_notifications drop constraint order_notifications_once;
    existing := null;
  end if;
  if existing is null then
    alter table public.order_notifications
      add constraint order_notifications_once unique (order_id, status, recipient, kind);
  end if;
end $$;

create index if not exists order_notifications_unsent on public.order_notifications (id) where sent_at is null;

-- Server-only table: the Express secret-key client bypasses RLS; browsers get nothing.
alter table public.order_notifications enable row level security;
revoke all on public.order_notifications from public, anon, authenticated;

commit;

-- Verify (read-only):
-- select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.order_notifications'::regclass and contype = 'u';
-- Expected: UNIQUE (order_id, status, recipient, kind)
