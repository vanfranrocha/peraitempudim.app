-- Registra o último progresso relevante na etapa de recebimento sem armazenar endereço completo.

alter table public.checkout_sessions
add column if not exists last_completed_field text;

alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_last_completed_field_check;

alter table public.checkout_sessions
  add constraint checkout_sessions_last_completed_field_check
  check (
    last_completed_field is null or last_completed_field in (
      'delivery_mode_selected',
      'cep_started',
      'cep_found',
      'delivery_calculated',
      'delivery_to_confirm',
      'number_filled',
      'name_filled',
      'phone_filled',
      'optional_section_opened',
      'details_completed'
    )
  );

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
  v_last_completed_field text;
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
  v_last_completed_field := nullif(left(trim(coalesce(payload->>'last_completed_field', '')), 40), '');

  if v_status not in ('cart_started','details_started','checkout_viewed','completed','abandoned') then
    raise exception 'Status de checkout inválido.' using errcode = '22023';
  end if;
  if v_current_step not in ('cart','details','checkout','success') then
    raise exception 'Etapa de checkout inválida.' using errcode = '22023';
  end if;
  if v_last_completed_field is not null and v_last_completed_field not in (
    'delivery_mode_selected',
    'cep_started',
    'cep_found',
    'delivery_calculated',
    'delivery_to_confirm',
    'number_filled',
    'name_filled',
    'phone_filled',
    'optional_section_opened',
    'details_completed'
  ) then
    raise exception 'Progresso de checkout inválido.' using errcode = '22023';
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
    last_completed_field,
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
    v_last_completed_field,
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
    last_completed_field = coalesce(excluded.last_completed_field, checkout_sessions.last_completed_field),
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

drop function if exists public.get_checkout_sessions(timestamptz, timestamptz);

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
  last_completed_field text,
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
    cs.last_completed_field,
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
