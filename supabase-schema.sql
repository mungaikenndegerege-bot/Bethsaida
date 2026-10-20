create extension if not exists pgcrypto;

create table public.shop_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default 'Bethsaida Electronics' check (length(shop_name) between 1 and 100),
  report_email text,
  currency text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sku text not null check (length(trim(sku)) between 1 and 60),
  name text not null check (length(trim(name)) between 1 and 120),
  category text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  reorder_level integer not null default 5 check (reorder_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, sku)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_number text not null,
  total numeric(12, 2) not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, receipt_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name text not null,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index products_owner_name_idx on public.products (owner_id, name);
create index sales_owner_created_at_idx on public.sales (owner_id, created_at desc);
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index inventory_movements_owner_created_idx on public.inventory_movements (owner_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger shop_settings_set_updated_at
before update on public.shop_settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.shop_settings (owner_id, shop_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'shop_name'), ''), 'Bethsaida Electronics'))
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_product(
  p_sku text,
  p_name text,
  p_category text,
  p_unit_price numeric,
  p_initial_stock integer,
  p_reorder_level integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;
  if p_sku is null or length(trim(p_sku)) not between 1 and 60 then
    raise exception 'SKU must contain 1 to 60 characters';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Product name must contain 1 to 120 characters';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Price must be zero or greater';
  end if;
  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'Opening stock must be zero or greater';
  end if;
  if p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Alert level must be zero or greater';
  end if;

  insert into public.products (owner_id, sku, name, category, unit_price, stock, reorder_level)
  values (v_owner, trim(p_sku), trim(p_name), nullif(trim(p_category), ''), p_unit_price, p_initial_stock, p_reorder_level)
  returning * into v_product;

  if p_initial_stock > 0 then
    insert into public.inventory_movements (owner_id, product_id, sku, product_name, quantity_change, reason)
    values (v_owner, v_product.id, v_product.sku, v_product.name, p_initial_stock, 'Opening stock');
  end if;
  return v_product.id;
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Stock change must be a non-zero whole number';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 80 then
    raise exception 'A stock adjustment reason is required';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and owner_id = v_owner
  for update;

  if not found then
    raise exception 'Product not found';
  end if;
  if v_product.stock + p_delta < 0 then
    raise exception 'Stock cannot be reduced below zero';
  end if;

  update public.products set stock = stock + p_delta where id = v_product.id;
  insert into public.inventory_movements (owner_id, product_id, sku, product_name, quantity_change, reason)
  values (v_owner, v_product.id, v_product.sku, v_product.name, p_delta, trim(p_reason));
  return v_product.stock + p_delta;
end;
$$;

create or replace function public.process_sale(p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_item record;
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_receipt text;
  v_total numeric(12, 2) := 0;
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale must contain at least one item';
  end if;

  if exists (
    select product_id
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by product_id
    having count(*) > 1
  ) then
    raise exception 'Each product may only appear once in a sale';
  end if;

  for v_item in
    select item.product_id, item.quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    order by item.product_id
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Sale quantities must be positive whole numbers';
    end if;
    select * into v_product
    from public.products
    where id = v_item.product_id and owner_id = v_owner
    for update;
    if not found then
      raise exception 'A product in this sale was not found';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Not enough stock for % (available: %)', v_product.name, v_product.stock;
    end if;
    v_total := v_total + v_product.unit_price * v_item.quantity;
  end loop;

  v_receipt := 'CS-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.sales (owner_id, receipt_number, total)
  values (v_owner, v_receipt, v_total)
  returning id into v_sale_id;

  for v_item in
    select item.product_id, item.quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    order by item.product_id
  loop
    select * into v_product from public.products where id = v_item.product_id and owner_id = v_owner;
    update public.products set stock = stock - v_item.quantity where id = v_product.id;
    insert into public.sale_items (
      owner_id, sale_id, product_id, sku, product_name, quantity, unit_price, line_total
    ) values (
      v_owner, v_sale_id, v_product.id, v_product.sku, v_product.name, v_item.quantity,
      v_product.unit_price, v_product.unit_price * v_item.quantity
    );
    insert into public.inventory_movements (owner_id, product_id, sku, product_name, quantity_change, reason)
    values (v_owner, v_product.id, v_product.sku, v_product.name, -v_item.quantity, 'Sale ' || v_receipt);
  end loop;
  return v_receipt;
end;
$$;

alter table public.shop_settings enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy "Owners can read their shop settings" on public.shop_settings
for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners can create their shop settings" on public.shop_settings
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners can update their shop settings" on public.shop_settings
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Owners can read their products" on public.products
for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners can update their products" on public.products
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Owners can read their sales" on public.sales
for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners can read their sale items" on public.sale_items
for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners can read their stock movements" on public.inventory_movements
for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.shop_settings, public.products, public.sales, public.sale_items, public.inventory_movements from anon, authenticated;
grant select on public.shop_settings, public.products, public.sales, public.sale_items, public.inventory_movements to authenticated;
grant insert (owner_id, shop_name, report_email, currency) on public.shop_settings to authenticated;
grant update (shop_name, report_email, currency) on public.shop_settings to authenticated;
grant update (sku, name, category, unit_price, reorder_level) on public.products to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_product(text, text, text, numeric, integer, integer) from public, anon;
revoke all on function public.adjust_stock(uuid, integer, text) from public, anon;
revoke all on function public.process_sale(jsonb) from public, anon;
grant execute on function public.create_product(text, text, text, numeric, integer, integer) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;
grant execute on function public.process_sale(jsonb) to authenticated;
