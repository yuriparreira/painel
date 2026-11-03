-- Agendamento diário da sincronização (rodar no SQL Editor, trocando os dois valores).
-- Não versionar com os valores reais.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'painel-pluggy-diario',
  '20 11 * * *',  -- 08:20 em Brasília, depois da atualização diária do Meu Pluggy
  $$ select net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/pluggy-sync',
       headers := jsonb_build_object('Authorization', 'Bearer <ANON_OU_PUBLISHABLE_KEY>', 'Content-Type', 'application/json'),
       body := '{"trigger":"cron"}'::jsonb) $$
);
