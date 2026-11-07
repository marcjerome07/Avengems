-- Avengems database schema. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Accounts (passwords, email codes, Google sign-in) are handled by Supabase Auth (auth.users).

-- Profiles: one row per Supabase Auth user
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

-- Create a profile automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  label text, full_name text not null, phone text not null,
  address text not null, city text not null, province text not null,
  postal_code text not null check (postal_code ~ '^\d{4}$'),
  is_default boolean not null default false
);
create unique index one_default_address on addresses (user_id) where is_default;

create table collections (
  id text primary key, slug text unique not null, stone text unique not null,
  stone_name text not null, color text not null, color_hex text not null,
  gemstone text not null, tagline text, description text
);

create table products (
  id text primary key,
  slug text unique not null,
  name text not null,
  type text not null check (type in ('Ring','Necklace','Bracelet','Earrings')),
  stone text not null references collections (stone),
  material text not null check (material in ('925 Sterling Silver','Stainless Steel')),
  price numeric(10,2) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  rating numeric(2,1) not null default 0,
  review_count int not null default 0,
  is_new boolean not null default true,
  is_featured boolean not null default false,
  customizable_size boolean not null default false,
  customizable_color boolean not null default false,
  customization_fee numeric(10,2) not null default 0,
  sizes text[] not null default '{}',
  default_size text,
  short_description text, details text,
  images text[] not null default '{}',
  added_at date not null default current_date,
  archived boolean not null default false
);

create table orders (
  id text primary key,  -- e.g. AVG-2026-10412
  user_id uuid not null references profiles,
  created_at timestamptz not null default now(),
  status text not null default 'Pending'
    check (status in ('Pending','Processing','Shipped','Delivered','Cancelled')),
  payment_method text not null check (payment_method in ('gcash','maya','cod','card')),
  customer_name text not null, customer_email text not null, customer_phone text not null,
  ship_address text not null, ship_city text not null,
  ship_province text not null, ship_postal_code text not null,
  subtotal numeric(10,2) not null, customization_total numeric(10,2) not null,
  shipping_fee numeric(10,2) not null, total numeric(10,2) not null
);
create index on orders (user_id, created_at desc);

create table order_items (
  id bigint generated always as identity primary key,
  order_id text not null references orders on delete cascade,
  product_id text not null references products,
  product_name text not null, product_slug text not null,
  type text not null, material text not null,
  stone text not null, color text not null, size text,
  base_price numeric(10,2) not null, customization_fee numeric(10,2) not null,
  unit_price numeric(10,2) not null, customized boolean not null default false,
  quantity int not null check (quantity between 1 and 10)
);

create table wishlist_items (
  user_id uuid references profiles on delete cascade,
  product_id text references products on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table store_settings (
  id int primary key default 1 check (id = 1),
  store_name text not null, contact_email text not null,
  shipping_fee numeric(10,2) not null, free_shipping_threshold numeric(10,2) not null
);
insert into store_settings values (1, 'Avengems', 'avengems2026@gmail.com', 120, 2000);

-- Row Level Security: the public key can only read products and collections.
-- Everything else goes through the backend, which uses the secret key.
alter table profiles enable row level security;
alter table addresses enable row level security;
alter table collections enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table wishlist_items enable row level security;
alter table store_settings enable row level security;

create policy "public read" on collections for select using (true);
create policy "public read" on products for select using (not archived);
