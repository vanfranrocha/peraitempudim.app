-- Admin Auth para o painel Peraí, tem pudim!
-- Não libera escrita para anon. Escrita administrativa depende de Supabase Auth
-- e da presença do usuário em public.admin_users.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "Admins can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can read all products"
on public.products
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert products"
on public.products
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update products"
on public.products
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete products"
on public.products
for delete
to authenticated
using (public.is_admin());

create policy "Admins can write product availability"
on public.product_availability
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can write store settings"
on public.store_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can write store hours"
on public.store_hours
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can write delivery ranges"
on public.delivery_ranges
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage orders"
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage order items"
on public.order_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage delivery addresses"
on public.delivery_addresses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
