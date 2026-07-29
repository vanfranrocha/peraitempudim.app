-- Corrige ambiguidade de nomes de retorno na RPC de tracking de checkout.

drop function if exists public.track_checkout_session(jsonb);

create or replace function public.track_checkout_session(payload jsonb)
returns table (
  tracked_session_id uuid,
  tracked_status text,
  tracked_current_step text,
  tracked_last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_status text;
  v_current_step text;
  v_items jsonb;
  v_items_quantity integer;
  v_cart_subtotal numeric(10,2);
  v_order_mode text;
  v_fulfillment_type text;
  v_customer_name text;
  v_customer_phone text;
  v_item jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or length(payload::text) > 12000 then
    raise exception 'Payload de checkout inválido.' using errcode = '22023';
  end if;

  v_session_id := (payload->>'session_id')::uuid;
  v_status := coalesce(payload->>'status', 'cart_started');
  v_current_step := coalesce(payload->>'current_step', 'cart');
  v_items := coalesce(payload->'cart_items', '[]'::jsonb);
  v_items_quantity := greatest(0, least(coalesce((payload->>'items_quantity')::integer, 0), 1000));
  v_cart_subtotal := greatest(0, round(coalesce((payload->>'cart_subtotal')::numeric, 0), 2));
  v_order_mode := nullif(left(trim(coalesce(payload->>'order_mode', '')), 30), '');
  v_fulfillment_type := nullif(left(trim(coalesce(payload->>'fulfillment_type', '')), 30), '');
  v_customer_name := nullif(left(trim(coalesce(payload->>'customer_name', '')), 120), '');
  v_customer_phone := nullif(left(regexp_replace(coalesce(payload->>'customer_phone', ''), '\D', '', 'g'), 20), '');

  if v_status not in ('cart_started','details_started','checkout_viewed','completed','abandoned') then
    raise exception 'Status de checkout inválido.' using errcode = '22023';
  end if;
  if v_current_step not in ('cart','details','checkout','success') then
    raise exception 'Etapa de checkout inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 then
    raise exception 'Itens do checkout inválidos.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    if coalesce((v_item->>'quantity')::integer, 0) < 0 or coalesce((v_item->>'quantity')::integer, 0) > 50 then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end if;
  end loop;

  insert into public.checkout_sessions (
    session_id,
    status,
    current_step,
    cart_items,
    items_quantity,
    cart_subtotal,
    order_mode,
    fulfillment_type,
    customer_name,
    customer_phone,
    checkout_viewed_at,
    last_activity_at
  ) values (
    v_session_id,
    v_status,
    v_current_step,
    v_items,
    v_items_quantity,
    v_cart_subtotal,
    v_order_mode,
    v_fulfillment_type,
    v_customer_name,
    v_customer_phone,
    case when v_status = 'checkout_viewed' then now() else null end,
    now()
  )
  on conflict (session_id) do update set
    status = case when checkout_sessions.status = 'completed' then checkout_sessions.status else excluded.status end,
    current_step = case when checkout_sessions.status = 'completed' then checkout_sessions.current_step else excluded.current_step end,
    cart_items = excluded.cart_items,
    items_quantity = excluded.items_quantity,
    cart_subtotal = excluded.cart_subtotal,
    order_mode = excluded.order_mode,
    fulfillment_type = excluded.fulfillment_type,
    customer_name = coalesce(excluded.customer_name, checkout_sessions.customer_name),
    customer_phone = coalesce(excluded.customer_phone, checkout_sessions.customer_phone),
    checkout_viewed_at = coalesce(checkout_sessions.checkout_viewed_at, excluded.checkout_viewed_at),
    last_activity_at = now(),
    updated_at = now()
  returning checkout_sessions.session_id, checkout_sessions.status, checkout_sessions.current_step, checkout_sessions.last_activity_at
  into tracked_session_id, tracked_status, tracked_current_step, tracked_last_activity_at;

  return next;
end;
$$;

revoke all on function public.track_checkout_session(jsonb) from public;
grant execute on function public.track_checkout_session(jsonb) to anon, authenticated;
