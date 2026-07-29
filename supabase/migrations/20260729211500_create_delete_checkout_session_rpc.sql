-- Permite ao admin remover manualmente uma sessão do funil.

create or replace function public.delete_checkout_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  delete from public.checkout_sessions
  where session_id = target_session_id;
end;
$$;

revoke all on function public.delete_checkout_session(uuid) from public;
grant execute on function public.delete_checkout_session(uuid) to authenticated;
