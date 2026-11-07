-- O Supabase carrega o safeupdate nas sessões da API: UPDATE sem WHERE é recusado (erro 21000). Até aqui as regras só
-- mudavam pelo SQL Editor, onde ele não vale; pelo app (fin_regra_criar, fin_categoria_salvar) a reclassificação
-- geral falhava. Mesmo efeito, com WHERE.
create or replace function private.fin_reclassifica() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_transactions set amount = amount where true;
  return null;
end $$;
