-- Ajusta a trigger do funil para notificar contato adicionado somente na etapa de dados.

create or replace function public.telegram_notify_checkout_details_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_contact boolean;
  v_is_details_step boolean;
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

  v_is_details_step :=
    new.status = 'details_started'
    or new.current_step = 'details';

  v_transitioned_to_details :=
    (new.status = 'details_started' and old.status is distinct from new.status)
    or (new.current_step = 'details' and old.current_step is distinct from new.current_step);

  v_contact_was_added :=
    v_is_details_step
    and (
      (
        nullif(trim(coalesce(old.customer_name, '')), '') is null
        and nullif(trim(coalesce(new.customer_name, '')), '') is not null
      )
      or (
        nullif(trim(coalesce(old.customer_phone, '')), '') is null
        and nullif(trim(coalesce(new.customer_phone, '')), '') is not null
      )
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
