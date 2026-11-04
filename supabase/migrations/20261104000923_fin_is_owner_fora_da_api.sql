-- A checagem de dono não precisa ficar exposta como RPC na API: vai para um schema fora do public.
-- As políticas continuam apontando para a mesma função, agora private.fin_is_owner().
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.fin_is_owner() set schema private;
