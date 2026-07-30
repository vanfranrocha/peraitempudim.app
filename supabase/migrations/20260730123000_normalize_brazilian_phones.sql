-- Centraliza normalização de telefone BR para funil e pedidos.

create or replace function public.normalize_br_phone(raw_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_normalized text;
begin
  v_digits := regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g');

  if char_length(v_digits) > 13 then
    v_digits := left(v_digits, 13);
  end if;

  if char_length(v_digits) in (12, 13) and left(v_digits, 2) = '55' then
    v_normalized := substring(v_digits from 3);
  else
    v_normalized := v_digits;
  end if;

  if char_length(v_normalized) in (10, 11) then
    return v_normalized;
  end if;

  return null;
end;
$$;

revoke all on function public.normalize_br_phone(text) from public;
grant execute on function public.normalize_br_phone(text) to anon, authenticated;

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
  v_customer_phone := public.normalize_br_phone(payload->>'customer_phone');
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


create or replace function public.create_public_order(payload jsonb)
returns table (
  order_id uuid,
  order_number bigint,
  total numeric,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
  v_customer_phone text;
  v_order_type text;
  v_fulfillment_type text;
  v_requested_date date;
  v_requested_time text;
  v_customer_notes text;
  v_client_request_id uuid;
  v_checkout_session_id uuid;
  v_items jsonb;
  v_delivery jsonb;
  v_subtotal numeric(10,2) := 0;
  v_delivery_fee numeric(10,2) := 0;
  v_distance_km numeric(8,2);
  v_order_id uuid;
  v_order_number bigint;
  v_total numeric(10,2);
  v_created_at timestamptz;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_promotion_applied boolean;
  v_unit_price numeric(10,2);
  v_line_total numeric(10,2);
  v_existing public.orders%rowtype;
  v_has_large_pudding boolean := false;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or length(payload::text) > 12000 then
    raise exception 'Payload do pedido inválido.' using errcode = '22023';
  end if;

  v_customer_name := nullif(trim(payload->>'customer_name'), '');
  v_customer_phone := public.normalize_br_phone(payload->>'customer_phone');
  v_order_type := payload->>'order_type';
  v_fulfillment_type := payload->>'fulfillment_type';
  v_requested_time := nullif(left(trim(coalesce(payload->>'requested_time', '')), 40), '');
  v_customer_notes := nullif(left(trim(coalesce(payload->>'customer_notes', '')), 500), '');
  v_items := payload->'items';
  v_delivery := payload->'delivery';
  if payload ? 'checkout_session_id' and nullif(payload->>'checkout_session_id', '') is not null then
    v_checkout_session_id := (payload->>'checkout_session_id')::uuid;
  end if;

  if payload ? 'client_request_id' and nullif(payload->>'client_request_id', '') is not null then
    v_client_request_id := (payload->>'client_request_id')::uuid;
    select * into v_existing from public.orders where client_request_id = v_client_request_id;
    if found then
      order_id := v_existing.id;
      order_number := v_existing.order_number;
      total := v_existing.total;
      status := v_existing.status;
      created_at := v_existing.created_at;
      return next;
      return;
    end if;
  end if;

  if v_customer_name is null or char_length(v_customer_name) < 2 or char_length(v_customer_name) > 120 then
    raise exception 'Informe um nome válido.' using errcode = '22023';
  end if;

  if v_customer_phone is null or char_length(v_customer_phone) not between 10 and 11 then
    raise exception 'Informe um telefone válido.' using errcode = '22023';
  end if;

  if v_order_type not in ('ready_delivery', 'scheduled') then
    raise exception 'Tipo de pedido inválido.' using errcode = '22023';
  end if;

  if v_fulfillment_type not in ('pickup', 'delivery') then
    raise exception 'Forma de entrega inválida.' using errcode = '22023';
  end if;

  if v_order_type = 'scheduled' then
    if nullif(payload->>'requested_date', '') is null then
      raise exception 'Informe a data desejada.' using errcode = '22023';
    end if;
    v_requested_date := (payload->>'requested_date')::date;
  else
    v_requested_date := coalesce(nullif(payload->>'requested_date', '')::date, current_date);
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 20 then
    raise exception 'Inclua ao menos um produto no pedido.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    v_promotion_applied := coalesce((v_item->>'promotion_applied')::boolean, false);
    if v_quantity <= 0 or v_quantity > 50 then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid;

    if not found or not v_product.is_active then
      raise exception 'Produto indisponível.' using errcode = '22023';
    end if;

    if v_order_type = 'ready_delivery' and not v_product.available_for_ready_delivery then
      raise exception 'Produto indisponível para pronta entrega.' using errcode = '22023';
    end if;

    if v_order_type = 'scheduled' and not v_product.available_for_scheduled_order then
      raise exception 'Produto indisponível para encomenda.' using errcode = '22023';
    end if;

    if v_promotion_applied
      and v_product.is_on_promotion
      and v_product.promotional_price is not null
      and v_product.promotional_minimum_quantity is not null
      and v_quantity < v_product.promotional_minimum_quantity then
      raise exception 'Quantidade mínima da promoção não atingida.' using errcode = '22023';
    end if;

    v_unit_price := case
      when v_promotion_applied and v_product.is_on_promotion and v_product.promotional_price is not null then v_product.promotional_price
      else v_product.price
    end;
    v_line_total := round(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    if v_product.size_ml = 500 then
      v_has_large_pudding := true;
    end if;
  end loop;

  if v_fulfillment_type = 'delivery' then
    if v_delivery is null or jsonb_typeof(v_delivery) <> 'object' then
      raise exception 'Endereço de entrega inválido.' using errcode = '22023';
    end if;

    if nullif(trim(coalesce(v_delivery->>'street', '')), '') is null
      or nullif(trim(coalesce(v_delivery->>'number', '')), '') is null
      or nullif(trim(coalesce(v_delivery->>'neighborhood', '')), '') is null
      or nullif(trim(coalesce(v_delivery->>'city', '')), '') is null
      or nullif(trim(coalesce(v_delivery->>'state', '')), '') is null then
      raise exception 'Endereço de entrega incompleto.' using errcode = '22023';
    end if;

    v_distance_km := nullif(v_delivery->>'distance_km', '')::numeric;
    if v_distance_km is null or v_distance_km < 0 then
      raise exception 'Distância de entrega inválida.' using errcode = '22023';
    end if;

    select fee into v_delivery_fee
    from public.delivery_ranges
    where is_active = true and v_distance_km <= max_distance_km
    order by max_distance_km asc
    limit 1;

    if v_delivery_fee is null then
      raise exception 'Entrega fora da área automática.' using errcode = '22023';
    end if;

    if v_distance_km <= 2
      or (v_has_large_pudding and v_subtotal >= 60 and v_distance_km <= 6)
      or (not v_has_large_pudding and v_subtotal >= 40 and v_distance_km <= 4) then
      v_delivery_fee := 0;
    end if;
  end if;

  v_total := round(v_subtotal + v_delivery_fee, 2);

  insert into public.orders (
    client_request_id,
    customer_name,
    customer_phone,
    order_type,
    fulfillment_type,
    requested_date,
    requested_time,
    subtotal,
    delivery_fee,
    discount,
    total,
    distance_km,
    status,
    payment_status,
    payment_method,
    customer_notes
  ) values (
    v_client_request_id,
    v_customer_name,
    v_customer_phone,
    v_order_type,
    v_fulfillment_type,
    v_requested_date,
    v_requested_time,
    v_subtotal,
    v_delivery_fee,
    0,
    v_total,
    v_distance_km,
    'pending',
    'pending',
    null,
    v_customer_notes
  ) returning id, orders.order_number, orders.created_at into v_order_id, v_order_number, v_created_at;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    v_promotion_applied := coalesce((v_item->>'promotion_applied')::boolean, false);
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_unit_price := case
      when v_promotion_applied and v_product.is_on_promotion and v_product.promotional_price is not null then v_product.promotional_price
      else v_product.price
    end;
    v_line_total := round(v_unit_price * v_quantity, 2);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      product_flavor,
      product_variant,
      product_size_ml,
      product_weight_grams,
      quantity,
      unit_price,
      total_price
    ) values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.flavor,
      v_product.variant,
      v_product.size_ml,
      v_product.weight_grams,
      v_quantity,
      v_unit_price,
      v_line_total
    );
  end loop;

  if v_fulfillment_type = 'delivery' then
    insert into public.delivery_addresses (
      order_id,
      postal_code,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      reference,
      latitude,
      longitude
    ) values (
      v_order_id,
      left(coalesce(v_delivery->>'postal_code', ''), 20),
      left(trim(v_delivery->>'street'), 160),
      left(trim(v_delivery->>'number'), 30),
      nullif(left(trim(coalesce(v_delivery->>'complement', '')), 160), ''),
      left(trim(v_delivery->>'neighborhood'), 100),
      left(trim(v_delivery->>'city'), 100),
      left(upper(trim(v_delivery->>'state')), 2),
      nullif(left(trim(coalesce(v_delivery->>'reference', '')), 200), ''),
      nullif(v_delivery->>'latitude', '')::numeric,
      nullif(v_delivery->>'longitude', '')::numeric
    );
  end if;

  if v_checkout_session_id is not null then
    update public.checkout_sessions
    set
      status = 'completed',
      current_step = 'success',
      order_id = v_order_id,
      completed_at = now(),
      last_activity_at = now(),
      customer_name = v_customer_name,
      customer_phone = v_customer_phone,
      updated_at = now()
    where session_id = v_checkout_session_id;
  end if;

  order_id := v_order_id;
  order_number := v_order_number;
  total := v_total;
  status := 'pending';
  created_at := v_created_at;
  return next;
end;
$$;


revoke all on function public.create_public_order(jsonb) from public;
grant execute on function public.create_public_order(jsonb) to anon, authenticated;
