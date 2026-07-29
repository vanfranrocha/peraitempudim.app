-- Lista sessões de checkout para a página de funil do admin.

create or replace function public.get_checkout_sessions(start_date timestamptz, end_date timestamptz)
returns table (
  session_id uuid,
  status text,
  current_step text,
  last_activity_at timestamptz,
  started_at timestamptz,
  checkout_viewed_at timestamptz,
  completed_at timestamptz,
  order_id uuid,
  items_quantity integer,
  cart_subtotal numeric,
  order_mode text,
  fulfillment_type text,
  customer_name text,
  customer_phone text,
  cart_items jsonb,
  is_abandoned boolean
)
language sql
security definer
set search_path = public
as $$
  select
    cs.session_id,
    cs.status,
    cs.current_step,
    cs.last_activity_at,
    cs.started_at,
    cs.checkout_viewed_at,
    cs.completed_at,
    cs.order_id,
    cs.items_quantity,
    cs.cart_subtotal,
    cs.order_mode,
    cs.fulfillment_type,
    cs.customer_name,
    cs.customer_phone,
    cs.cart_items,
    (cs.status <> 'completed' and cs.last_activity_at < now() - interval '2 hours') as is_abandoned
  from public.checkout_sessions cs
  where public.is_admin()
    and cs.created_at >= start_date
    and cs.created_at < end_date
  order by cs.last_activity_at desc
  limit 200;
$$;

revoke all on function public.get_checkout_sessions(timestamptz, timestamptz) from public;
grant execute on function public.get_checkout_sessions(timestamptz, timestamptz) to authenticated;
