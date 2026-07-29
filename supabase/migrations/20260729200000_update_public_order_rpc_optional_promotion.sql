-- Atualiza a RPC para aplicar promoção somente quando o item foi comprado no fluxo promocional.

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
  v_customer_phone := regexp_replace(coalesce(payload->>'customer_phone', ''), '\D', '', 'g');
  v_order_type := payload->>'order_type';
  v_fulfillment_type := payload->>'fulfillment_type';
  v_requested_time := nullif(left(trim(coalesce(payload->>'requested_time', '')), 40), '');
  v_customer_notes := nullif(left(trim(coalesce(payload->>'customer_notes', '')), 500), '');
  v_items := payload->'items';
  v_delivery := payload->'delivery';

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

  if char_length(v_customer_phone) not between 10 and 11 then
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
