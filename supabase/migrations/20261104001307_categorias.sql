-- Categorias dos lançamentos, calculadas no banco.
-- Ordem: 1) regras do dono (tabela fin_rules, que fica só no banco), 2) categoria da Pluggy,
-- 3) padrão. A escolha manual (coluna categoria) sempre vence na view fin_lancamentos.
-- Valores em moeda estrangeira: vale o valor convertido para a moeda da conta.

alter table public.fin_transactions add column if not exists tipo text;
alter table public.fin_transactions add column if not exists tipo_manual text;
alter table public.fin_transactions add column if not exists valor_original numeric(16, 2);
alter table public.fin_transactions add column if not exists moeda_original text;

-- tipo: despesa, receita, transferencia, investimento, divida, pj, terceiros, receber, rateio, bem
create table if not exists public.fin_rules (
  id bigint generated always as identity primary key,
  padrao text not null,          -- expressão regular sobre a descrição, sem diferenciar maiúsculas
  conta_tipo text,               -- BANK, CREDIT ou nulo (qualquer conta)
  sentido text,                  -- saida, entrada ou nulo (qualquer)
  categoria text not null,
  tipo text not null default 'despesa',
  prioridade int not null default 100,
  nota text,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_categorias_pluggy (
  categoria_pluggy text primary key,
  categoria text not null,
  tipo text not null
);

alter table public.fin_rules enable row level security;
alter table public.fin_categorias_pluggy enable row level security;
create policy dono_le on public.fin_rules for select to authenticated using (private.fin_is_owner());
create policy dono_cria on public.fin_rules for insert to authenticated with check (private.fin_is_owner());
create policy dono_muda on public.fin_rules for update to authenticated using (private.fin_is_owner()) with check (private.fin_is_owner());
create policy dono_apaga on public.fin_rules for delete to authenticated using (private.fin_is_owner());
create policy dono_le on public.fin_categorias_pluggy for select to authenticated using (private.fin_is_owner());

-- Uma regra com expressão inválida quebraria a sincronização: recusa na hora de gravar.
create or replace function private.fin_rules_valida() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform '' ~* new.padrao;
  if new.conta_tipo is not null and new.conta_tipo not in ('BANK', 'CREDIT') then raise exception 'conta_tipo deve ser BANK ou CREDIT'; end if;
  if new.sentido is not null and new.sentido not in ('saida', 'entrada') then raise exception 'sentido deve ser saida ou entrada'; end if;
  return new;
end $$;
create trigger fin_rules_valida before insert or update on public.fin_rules
  for each row execute function private.fin_rules_valida();

create or replace function private.fin_classifica(p_desc text, p_cat text, p_conta text, p_valor numeric,
  out categoria text, out tipo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  select r.categoria, r.tipo into categoria, tipo from public.fin_rules r
   where coalesce(p_desc, '') ~* r.padrao
     and (r.conta_tipo is null or r.conta_tipo = p_conta)
     and (r.sentido is null or (r.sentido = 'saida' and p_valor < 0) or (r.sentido = 'entrada' and p_valor > 0))
   order by r.prioridade, r.id limit 1;
  if found then return; end if;
  select m.categoria, m.tipo into categoria, tipo from public.fin_categorias_pluggy m where m.categoria_pluggy = p_cat;
  if not found then
    categoria := case when p_valor > 0 then 'Receitas' else 'Outros' end;
    tipo := case when p_valor > 0 then 'receita' else 'despesa' end;
  end if;
  -- No cartão, toda compra é despesa (a Pluggy às vezes marca compra como investimento ou transferência).
  if p_conta = 'CREDIT' and p_valor < 0 and tipo not in ('despesa', 'divida') then
    categoria := 'Compras'; tipo := 'despesa';
  end if;
end $$;

create or replace function private.fin_tx_classifica() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conta text; v_conv numeric; c record;
begin
  select a.type into v_conta from public.fin_accounts a where a.id = new.account_id;
  v_conv := nullif(new.raw->>'amountInAccountCurrency', '')::numeric;
  if v_conv is not null then
    new.valor_original := abs(nullif(new.raw->>'amount', '')::numeric);
    new.moeda_original := new.raw->>'currencyCode';
    new.amount := case when new.type = 'DEBIT' then -abs(v_conv) else abs(v_conv) end;
  end if;
  select * into c from private.fin_classifica(new.description, new.category, v_conta, new.amount);
  new.categoria_auto := c.categoria;
  new.tipo := c.tipo;
  return new;
end $$;
create trigger fin_tx_classifica before insert or update of raw, description, category, amount on public.fin_transactions
  for each row execute function private.fin_tx_classifica();

-- Regra nova, alterada ou apagada: reclassifica tudo (são poucos milhares de linhas).
create or replace function private.fin_reclassifica() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_transactions set amount = amount;
  return null;
end $$;
create trigger fin_rules_reclassifica after insert or update or delete on public.fin_rules
  for each statement execute function private.fin_reclassifica();
create trigger fin_mapa_reclassifica after insert or update or delete on public.fin_categorias_pluggy
  for each statement execute function private.fin_reclassifica();

create or replace view public.fin_lancamentos with (security_invoker = true) as
select t.id, t.account_id, a.item_id, a.type as conta_tipo, a.name as conta, t.date, t.description, t.amount,
  t.valor_original, t.moeda_original, coalesce(t.categoria, t.categoria_auto) as categoria,
  coalesce(t.tipo_manual, t.tipo) as tipo, t.categoria_auto, t.categoria as categoria_manual,
  t.category as categoria_pluggy, t.installment, t.bill_id, t.status
from public.fin_transactions t join public.fin_accounts a on a.id = t.account_id;

-- Regras genéricas de descrição (nada pessoal: o que é pessoal fica só no banco, com prioridade menor que 50).
insert into public.fin_rules (padrao, conta_tipo, sentido, categoria, tipo, prioridade, nota) values
  ('gastos? c(artao|\.)? ?(de )?cr[eé]dito|pagamento de fatura|pagto\.? fatura', 'BANK', 'saida', 'Pagamento de fatura', 'transferencia', 50, 'pagamento do cartão pela conta'),
  ('pagamentos? validos? normais|pagamento recebido|pagamento de fatura', 'CREDIT', 'entrada', 'Pagamento de fatura', 'transferencia', 50, 'pagamento visto pelo lado do cartão'),
  ('estorno', null, 'entrada', 'Estornos', 'despesa', 60, 'estorno reduz o gasto');

-- Categorias da Pluggy → Painel. "Grupo: detalhe" vira o grupo no app.
insert into public.fin_categorias_pluggy (categoria_pluggy, categoria, tipo) values
  ('Groceries', 'Mercado', 'despesa'),
  ('Food and drinks', 'Mercado', 'despesa'),
  ('Eating out', 'Alimentação fora', 'despesa'),
  ('Food delivery', 'Alimentação fora: delivery', 'despesa'),
  ('Gas stations', 'Transporte: combustível', 'despesa'),
  ('Tolls and in vehicle payment', 'Transporte: pedágio', 'despesa'),
  ('Parking', 'Transporte: estacionamento', 'despesa'),
  ('Taxi and ride-hailing', 'Transporte: app', 'despesa'),
  ('Public transportation', 'Transporte: público', 'despesa'),
  ('Car rental', 'Transporte: aluguel de carro', 'despesa'),
  ('Vehicle maintenance', 'Transporte: manutenção', 'despesa'),
  ('Vehicle ownership taxes and fees', 'Transporte: IPVA e taxas', 'despesa'),
  ('Traffic tickets', 'Transporte: multas', 'despesa'),
  ('Vehicle insurance', 'Transporte: seguro', 'despesa'),
  ('Automotive', 'Transporte', 'despesa'),
  ('Transportation', 'Transporte', 'despesa'),
  ('Bicycle', 'Transporte', 'despesa'),
  ('Pharmacy', 'Saúde: farmácia', 'despesa'),
  ('Gyms and fitness centers', 'Saúde: academia', 'despesa'),
  ('Wellness and fitness', 'Saúde: bem-estar', 'despesa'),
  ('Wellness', 'Saúde: bem-estar', 'despesa'),
  ('Sports practice', 'Saúde: esporte', 'despesa'),
  ('Healthcare', 'Saúde', 'despesa'),
  ('Dentist', 'Saúde: dentista', 'despesa'),
  ('Hospital clinics and labs', 'Saúde: clínicas e exames', 'despesa'),
  ('Optometry', 'Saúde', 'despesa'),
  ('Health insurance', 'Saúde: plano', 'despesa'),
  ('Housing', 'Moradia', 'despesa'),
  ('Rent', 'Moradia: aluguel', 'despesa'),
  ('Utilities', 'Moradia: contas', 'despesa'),
  ('Water', 'Moradia: água', 'despesa'),
  ('Electricity', 'Moradia: energia', 'despesa'),
  ('Gas', 'Moradia: gás', 'despesa'),
  ('Urban land and building tax', 'Moradia: IPTU', 'despesa'),
  ('Home insurance', 'Moradia: seguro', 'despesa'),
  ('Telecommunications', 'Moradia: telefone e internet', 'despesa'),
  ('Internet', 'Moradia: telefone e internet', 'despesa'),
  ('Mobile', 'Moradia: telefone e internet', 'despesa'),
  ('TV', 'Moradia: telefone e internet', 'despesa'),
  ('Digital services', 'Assinaturas e apps', 'despesa'),
  ('Video streaming', 'Assinaturas e apps', 'despesa'),
  ('Music streaming', 'Assinaturas e apps', 'despesa'),
  ('Gaming', 'Lazer: jogos', 'despesa'),
  ('Shopping', 'Compras', 'despesa'),
  ('Online shopping', 'Compras: online', 'despesa'),
  ('Electronics', 'Compras: eletrônicos', 'despesa'),
  ('Clothing', 'Compras: roupas', 'despesa'),
  ('Kids and toys', 'Compras', 'despesa'),
  ('Bookstore', 'Compras: livros', 'despesa'),
  ('Sports goods', 'Compras: esporte', 'despesa'),
  ('Office supplies', 'Compras', 'despesa'),
  ('Pet supplies and vet', 'Pet', 'despesa'),
  ('Travel', 'Viagem', 'despesa'),
  ('Airport and airlines', 'Viagem: passagens', 'despesa'),
  ('Accomodation', 'Viagem: hospedagem', 'despesa'),
  ('Bus tickets', 'Viagem: passagens', 'despesa'),
  ('Mileage programs', 'Viagem', 'despesa'),
  ('Leisure', 'Lazer', 'despesa'),
  ('Tickets', 'Lazer', 'despesa'),
  ('Stadiums and arenas', 'Lazer', 'despesa'),
  ('Landmarks and museums', 'Lazer', 'despesa'),
  ('Cinema, theater and concerts', 'Lazer', 'despesa'),
  ('Gambling', 'Lazer: apostas', 'despesa'),
  ('Lottery', 'Lazer: apostas', 'despesa'),
  ('Online bet', 'Lazer: apostas', 'despesa'),
  ('Education', 'Educação', 'despesa'),
  ('Online courses', 'Educação', 'despesa'),
  ('University', 'Educação', 'despesa'),
  ('School', 'Educação', 'despesa'),
  ('Kindergarten', 'Educação', 'despesa'),
  ('Services', 'Serviços', 'despesa'),
  ('Donations', 'Doações', 'despesa'),
  ('Alimony', 'Família', 'despesa'),
  ('Insurance', 'Seguros', 'despesa'),
  ('Life insurance', 'Seguros', 'despesa'),
  ('Taxes', 'Impostos e taxas', 'despesa'),
  ('Income taxes', 'Impostos e taxas', 'despesa'),
  ('Legal obligations', 'Impostos e taxas', 'despesa'),
  ('Tax on financial operations', 'Tarifas e juros: IOF', 'despesa'),
  ('Bank fees', 'Tarifas e juros', 'despesa'),
  ('Account fees', 'Tarifas e juros', 'despesa'),
  ('Wire transfer fees and ATM fees', 'Tarifas e juros', 'despesa'),
  ('Credit card fees', 'Tarifas e juros', 'despesa'),
  ('Interests charged', 'Tarifas e juros', 'despesa'),
  ('Late payment and overdraft costs', 'Tarifas e juros', 'despesa'),
  ('Loans and financing', 'Dívidas: parcelas', 'divida'),
  ('Financing', 'Dívidas: parcelas', 'divida'),
  ('Vehicle financing', 'Dívidas: parcelas', 'divida'),
  ('Real estate financing', 'Dívidas: parcelas', 'divida'),
  ('Student loan', 'Dívidas: parcelas', 'divida'),
  ('Credit card payment', 'Pagamento de fatura', 'transferencia'),
  ('Same person transfer', 'Entre contas próprias', 'transferencia'),
  ('Transfer - Internal', 'Entre contas próprias', 'transferencia'),
  ('Transfer - Investment Account', 'Entre contas próprias', 'transferencia'),
  ('Transfer - Foreign Exchange', 'Câmbio', 'transferencia'),
  ('Blocked balances', 'Entre contas próprias', 'transferencia'),
  ('Investments', 'Investimentos', 'investimento'),
  ('Automatic investment', 'Investimentos', 'investimento'),
  ('Fixed income', 'Investimentos', 'investimento'),
  ('Mutual funds', 'Investimentos', 'investimento'),
  ('Variable income', 'Investimentos', 'investimento'),
  ('Margin', 'Investimentos', 'investimento'),
  ('Pension', 'Investimentos: previdência', 'investimento'),
  ('Proceeds interests and dividends', 'Receitas: rendimentos', 'receita'),
  ('Income', 'Receitas', 'receita'),
  ('Salary', 'Receitas: salário', 'receita'),
  ('Retirement', 'Receitas', 'receita'),
  ('Entrepreneurial activities', 'Receitas: atividade própria', 'receita'),
  ('Government aid', 'Receitas', 'receita'),
  ('Non-recurring income', 'Receitas', 'receita'),
  ('Cashback', 'Receitas: cashback', 'receita'),
  ('Transfer - PIX', 'A classificar', 'terceiros'),
  ('Transfer - TED', 'A classificar', 'terceiros'),
  ('Transfer - Bank Slip', 'A classificar', 'terceiros'),
  ('Transfer - Cash', 'A classificar', 'terceiros'),
  ('Transfer - Check', 'A classificar', 'terceiros'),
  ('Transfers', 'A classificar', 'terceiros'),
  ('Third party transfers', 'A classificar', 'terceiros'),
  ('Other', 'Outros', 'despesa');
