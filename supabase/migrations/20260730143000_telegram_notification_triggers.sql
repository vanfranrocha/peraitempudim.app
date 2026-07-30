-- Liga eventos do banco à Edge Function telegram-notify sem armazenar segredos no código.
-- Antes de testar em produção, cadastre no Supabase Vault um secret chamado:
-- telegram_webhook_secret
-- com o mesmo valor de TELEGRAM_WEBHOOK_SECRET da Edge Function.

create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

alter table public.orders
add column if not exists order_notification_sent_at timestamptz;

alter table public.checkout_sessions
add column if not exists details_notification_sent_at timestamptz,
add column if not exists abandonment_notification_sent_at timestamptz;

create or replace function public.get_telegram_webhook_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'telegram_webhook_secret'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_telegram_webhook_secret() from public;

create or replace function public.telegram_notify_edge(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  v_secret := public.get_telegram_webhook_secret();

  if nullif(v_secret, '') is null then
    raise warning 'telegram-notify skipped: missing telegram_webhook_secret in Vault';
    return;
  end if;

  select net.http_post(
    url := 'https://qykvcokasjknuybvipqg.supabase.co/functions/v1/telegram-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) into v_request_id;

exception
  when others then
    raise warning 'telegram-notify request failed: %', sqlstate;
end;
$$;

revoke all on function public.telegram_notify_edge(jsonb) from public;

create or replace function public.telegram_notify_new_order_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_notification_sent_at is not null then
    return new;
  end if;

  perform public.telegram_notify_edge(jsonb_build_object(
    'type', 'INSERT',
    'table', 'orders',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  ));

  return new;
exception
  when others then
    raise warning 'telegram new order trigger skipped: %', sqlstate;
    return new;
end;
$$;

revoke all on function public.telegram_notify_new_order_trigger() from public;

drop trigger if exists telegram_notify_new_order on public.orders;
create trigger telegram_notify_new_order
after insert on public.orders
for each row
execute function public.telegram_notify_new_order_trigger();

create or replace function public.telegram_notify_checkout_details_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_contact boolean;
  v_transitioned_to_details boolean;
  v_contact_was_added boolean;
begin
  if new.details_notification_sent_at is not null then
    return new;
  end if;

  if new.status = 'completed' or new.current_step = 'success' then
    return new;
  end if;

  v_has_contact :=
    nullif(trim(coalesce(new.customer_name, '')), '') is not null
    or nullif(trim(coalesce(new.customer_phone, '')), '') is not null;

  if not v_has_contact then
    return new;
  end if;

  v_transitioned_to_details :=
    (new.status = 'details_started' and old.status is distinct from new.status)
    or (new.current_step = 'details' and old.current_step is distinct from new.current_step);

  v_contact_was_added :=
    (
      nullif(trim(coalesce(old.customer_name, '')), '') is null
      and nullif(trim(coalesce(new.customer_name, '')), '') is not null
    )
    or (
      nullif(trim(coalesce(old.customer_phone, '')), '') is null
      and nullif(trim(coalesce(new.customer_phone, '')), '') is not null
    );

  if not (v_transitioned_to_details or v_contact_was_added) then
    return new;
  end if;

  perform public.telegram_notify_edge(jsonb_build_object(
    'type', 'UPDATE',
    'table', 'checkout_sessions',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  ));

  return new;
exception
  when others then
    raise warning 'telegram checkout details trigger skipped: %', sqlstate;
    return new;
end;
$$;

revoke all on function public.telegram_notify_checkout_details_trigger() from public;

drop trigger if exists telegram_notify_checkout_details on public.checkout_sessions;
create trigger telegram_notify_checkout_details
after update on public.checkout_sessions
for each row
execute function public.telegram_notify_checkout_details_trigger();
