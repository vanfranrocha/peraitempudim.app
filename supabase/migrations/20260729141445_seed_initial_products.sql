-- =========================================================
-- Produtos iniciais do Peraí, tem pudim!
-- =========================================================

-- Chave usada pelo frontend para identificar cada combinação.
alter table public.products
add column product_key text;

alter table public.products
add column promotional_minimum_quantity integer not null default 1;

alter table public.products
add constraint products_product_key_unique
unique (product_key);

alter table public.products
add constraint products_promotional_minimum_quantity_check
check (promotional_minimum_quantity > 0);

-- =========================================================
-- Produtos normais
-- =========================================================

insert into public.products (
  product_key,
  name,
  flavor,
  variant,
  size_ml,
  weight_grams,
  price,
  promotional_price,
  is_active,
  is_featured,
  is_on_promotion,
  promotional_minimum_quantity,
  available_for_ready_delivery,
  available_for_scheduled_order,
  sort_order
)
values
  (
    'normal_tradicional_180ml',
    'Pudim Tradicional',
    'tradicional',
    'normal',
    180,
    null,
    12.00,
    9.99,
    true,
    true,
    true,
    2,
    true,
    true,
    1
  ),
  (
    'normal_tradicional_500ml',
    'Pudim Tradicional',
    'tradicional',
    'normal',
    500,
    null,
    28.00,
    24.99,
    true,
    true,
    true,
    1,
    true,
    true,
    2
  ),
  (
    'normal_tradicional_1kg',
    'Pudim Tradicional',
    'tradicional',
    'normal',
    null,
    1000,
    50.00,
    null,
    true,
    false,
    false,
    1,
    false,
    true,
    3
  ),
  (
    'normal_cafe_180ml',
    'Pudim de Café',
    'cafe',
    'normal',
    180,
    null,
    14.00,
    9.99,
    true,
    true,
    true,
    4,
    true,
    true,
    4
  ),
  (
    'normal_cafe_500ml',
    'Pudim de Café',
    'cafe',
    'normal',
    500,
    null,
    32.00,
    22.99,
    true,
    true,
    true,
    2,
    true,
    true,
    5
  ),
  (
    'normal_cafe_1kg',
    'Pudim de Café',
    'cafe',
    'normal',
    null,
    1000,
    55.00,
    null,
    true,
    false,
    false,
    1,
    false,
    true,
    6
  );

-- =========================================================
-- Produtos zero lactose
-- =========================================================

insert into public.products (
  product_key,
  name,
  flavor,
  variant,
  size_ml,
  weight_grams,
  price,
  promotional_price,
  is_active,
  is_featured,
  is_on_promotion,
  promotional_minimum_quantity,
  available_for_ready_delivery,
  available_for_scheduled_order,
  sort_order
)
values
  (
    'zero_tradicional_180ml',
    'Pudim Tradicional Zero Lactose',
    'tradicional',
    'zero_lactose',
    180,
    null,
    14.00,
    9.99,
    true,
    true,
    true,
    4,
    true,
    true,
    7
  ),
  (
    'zero_tradicional_500ml',
    'Pudim Tradicional Zero Lactose',
    'tradicional',
    'zero_lactose',
    500,
    null,
    32.00,
    24.99,
    true,
    true,
    true,
    2,
    true,
    true,
    8
  ),
  (
    'zero_tradicional_1kg',
    'Pudim Tradicional Zero Lactose',
    'tradicional',
    'zero_lactose',
    null,
    1000,
    60.00,
    null,
    true,
    false,
    false,
    1,
    false,
    true,
    9
  ),
  (
    'zero_cafe_180ml',
    'Pudim de Café Zero Lactose',
    'cafe',
    'zero_lactose',
    180,
    null,
    16.00,
    11.99,
    true,
    true,
    true,
    4,
    true,
    true,
    10
  ),
  (
    'zero_cafe_500ml',
    'Pudim de Café Zero Lactose',
    'cafe',
    'zero_lactose',
    500,
    null,
    35.00,
    27.99,
    true,
    true,
    true,
    2,
    true,
    true,
    11
  ),
  (
    'zero_cafe_1kg',
    'Pudim de Café Zero Lactose',
    'cafe',
    'zero_lactose',
    null,
    1000,
    65.00,
    null,
    true,
    false,
    false,
    1,
    false,
    true,
    12
  );

-- A promoção atual do arquivo prices.ts está ativa.
update public.store_settings
set promotion_enabled = true;