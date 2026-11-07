-- Ícone em cada categoria do plano de contas (fin_plano.icone): aparece nas barras de Dinheiro, nos lançamentos,
-- no plano de contas e no gasto rápido. O nome é um dos ícones do app (icons.js); sem ícone, o app usa o do grupo.
-- As categorias que já existem recebem um ícone sugerido pelo nome; as novas também, e dá para trocar pelo app.
-- Todo UPDATE/DELETE tem WHERE (o safeupdate da API recusa sem).

alter table public.fin_plano add column if not exists icone text;
do $$ begin
  alter table public.fin_plano add constraint fin_plano_icone check (icone is null or icone ~ '^[a-zA-Z]{2,20}$');
exception when duplicate_object then null; end $$;

-- Sugestão pelo nome: do detalhe para o grupo (o primeiro que casar vale).
create or replace function private.fin_icone_sugerido(p_nome text) returns text
language sql immutable set search_path = '' as $$
  select case
    when n ~ 'a classificar' then 'inbox'
    when n ~ 'pagamento de fatura' then 'card'
    when n ~ 'desconsiderar' then 'eye'
    when n ~ 'entre contas|pix' then 'swap'
    when n ~ 'c[aâ]mbio' then 'globe'
    when n ~ 'estorno' then 'refresh'
    when n ~ 'cashback' then 'refresh'
    when n ~ 'financiamento|carro: entrada' then 'car'
    when n ~ 'aluguel de carro' then 'car'
    when n ~ 'd[ií]vida|parcela|empr[eé]stimo' then 'coins'
    when n ~ 'delivery' then 'bag'
    when n ~ '^alimenta' then 'utensils'
    when n ~ '^mercado' then 'cart'
    when n ~ 'eletr[oô]nic' then 'laptop'
    when n ~ 'livro' then 'book'
    when n ~ 'roupa' then 'shirt'
    when n ~ 'esporte|academia' then 'dumbbell'
    when n ~ 'apostas' then 'dice'
    when n ~ 'jogos' then 'game'
    when n ~ 'presente' then 'gift'
    when n ~ 'doa[cç]' then 'heart'
    when n ~ 'curso|^educa' then 'cap'
    when n ~ 'assinatura' then 'tv'
    when n ~ 'cripto' then 'coins'
    when n ~ 'previd' then 'shield'
    when n ~ '^investimento|rendimento' then 'trend'
    when n ~ 'sal[aá]rio' then 'briefcase'
    when n ~ 'lucro' then 'pie'
    when n ~ 'venda' then 'tag'
    when n ~ '^receita' then 'up'
    when n ~ '[aá]gua' then 'droplet'
    when n ~ 'energia|luz' then 'bolt'
    when n ~ 'g[aá]s$' then 'flame'
    when n ~ 'aluguel' then 'key'
    when n ~ 'internet|telefone|celular' then 'phone'
    when n ~ 'limpeza|bem-estar' then 'sparkle'
    when n ~ 'manuten|^servi[cç]o' then 'wrench'
    when n ~ 'seguro|plano$' then 'shield'
    when n ~ 'iptu|ipva|imposto|taxas' then 'receipt'
    when n ~ '^moradia' then 'home'
    when n ~ 'farm[aá]cia' then 'pill'
    when n ~ 'dentista' then 'tooth'
    when n ~ 'cl[ií]nica|exame' then 'flask'
    when n ~ 'consulta' then 'health'
    when n ~ '^sa[uú]de' then 'heart'
    when n ~ 'combust' then 'fuel'
    when n ~ 'estacionamento' then 'parking'
    when n ~ 'ped[aá]gio' then 'map'
    when n ~ 'p[uú]blico' then 'bus'
    when n ~ 'multa' then 'info'
    when n ~ 'documento|cnh|visto' then 'file'
    when n ~ ': app$' then 'phone'
    when n ~ '^transporte' then 'car'
    when n ~ 'hospedagem' then 'bed'
    when n ~ '^viagem|passage' then 'plane'
    when n ~ 'tarifa|juros|iof' then 'percent'
    when n ~ '^pet' then 'paw'
    when n ~ 'fam[ií]lia|amigos|rateio|terceiros' then 'users'
    when n ~ 'empresa|profissional' then 'briefcase'
    when n ~ '^lazer' then 'ticket'
    when n ~ '^compras' then 'bag'
    when n ~ '^outros' then 'tag'
  end
  from (select lower(btrim(coalesce(p_nome, ''))) as n) z;
$$;

-- Categoria nova (pelo app, pelas regras ou pelo mapa da Pluggy) já nasce com o ícone sugerido.
create or replace function private.fin_plano_icone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.icone is null then new.icone := private.fin_icone_sugerido(new.nome); end if;
  return new;
end $$;
drop trigger if exists fin_plano_icone on public.fin_plano;
create trigger fin_plano_icone before insert on public.fin_plano
  for each row execute function private.fin_plano_icone();

update public.fin_plano x set icone = private.fin_icone_sugerido(x.nome) where x.icone is null;

-- ---------- Trocar o ícone pelo app ----------
-- p_icone null: volta para o sugerido pelo nome.
create or replace function public.fin_categoria_icone(p_nome text, p_icone text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := nullif(btrim(coalesce(p_icone, '')), '');
begin
  perform private.fin_dono();
  if v is not null and v !~ '^[a-zA-Z]{2,20}$' then raise exception 'icone_invalido'; end if;
  update public.fin_plano x set icone = coalesce(v, private.fin_icone_sugerido(x.nome)) where x.nome = p_nome
  returning x.icone into v;
  if not found then raise exception 'categoria_nao_existe'; end if;
  return v;
end $$;

-- ---------- Renomear leva o ícone junto ----------
-- Igual à de 20261106220000_reclassificar; a única mudança é o icone no insert do novo nome.
create or replace function public.fin_categoria_salvar(p_antigo text, p_nome text, p_tipo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  velho public.fin_plano;
  destino public.fin_plano;
  t text;
  juntou boolean := false;
begin
  perform private.fin_dono();
  v_nome := regexp_replace(v_nome, '\s*:\s*', ': ', 'g');
  if length(v_nome) = 0 or length(v_nome) > 80 or v_nome ~ '^:' or v_nome ~ ':$' then raise exception 'nome_invalido'; end if;
  if p_tipo is not null and p_tipo not in ('despesa', 'receita', 'transferencia', 'rateio', 'pj', 'investimento',
       'terceiros', 'divida', 'receber', 'bem') then raise exception 'tipo_invalido'; end if;

  if p_antigo is null then
    if exists (select 1 from public.fin_plano x where lower(x.nome) = lower(v_nome)) then raise exception 'categoria_existe'; end if;
    insert into public.fin_plano (nome, tipo) values (v_nome, coalesce(p_tipo, 'despesa'));
    return jsonb_build_object('nome', v_nome, 'tipo', coalesce(p_tipo, 'despesa'), 'juntou', false);
  end if;

  select * into velho from public.fin_plano x where x.nome = p_antigo for update;
  if not found then raise exception 'categoria_nao_existe'; end if;

  if v_nome <> velho.nome then
    if velho.sistema then raise exception 'categoria_do_sistema'; end if;
    select * into destino from public.fin_plano x where x.nome = v_nome or (lower(x.nome) = lower(v_nome) and x.nome <> velho.nome)
     order by (x.nome = v_nome) desc limit 1;
    if found then
      juntou := true;
      v_nome := destino.nome;
      t := destino.tipo;
    else
      t := coalesce(p_tipo, velho.tipo);
      insert into public.fin_plano (nome, tipo, created_at, icone) values (v_nome, t, velho.created_at, velho.icone);
    end if;
    update public.fin_transactions x set categoria = v_nome, tipo_manual = t where x.categoria = velho.nome;
    update public.fin_manuais m set categoria = v_nome, tipo = t, updated_at = now() where m.categoria = velho.nome;
    update public.fin_categorias_pluggy m set categoria = v_nome, tipo = t where m.categoria = velho.nome;
    update public.fin_rules r set categoria = v_nome, tipo = t where r.categoria = velho.nome;
    update public.fin_snapshots s
       set data = jsonb_set(s.data, '{contasFixas}', (
             select jsonb_agg(case when e ->> 'txCat' = velho.nome then e || jsonb_build_object('txCat', v_nome) else e end
                              order by o)
               from jsonb_array_elements(s.data -> 'contasFixas') with ordinality as z(e, o)))
     where s.kind = 'manual' and jsonb_typeof(s.data -> 'contasFixas') = 'array'
       and exists (select 1 from jsonb_array_elements(s.data -> 'contasFixas') e where e ->> 'txCat' = velho.nome);
    delete from public.fin_plano x where x.nome = velho.nome;
  elsif p_tipo is not null and p_tipo <> velho.tipo then
    if velho.sistema then raise exception 'categoria_do_sistema'; end if;
    t := p_tipo;
    update public.fin_plano x set tipo = t where x.nome = velho.nome;
    update public.fin_transactions x set tipo_manual = t where x.categoria = velho.nome;
    update public.fin_manuais m set tipo = t, updated_at = now() where m.categoria = velho.nome;
    update public.fin_categorias_pluggy m set tipo = t where m.categoria = velho.nome;
    update public.fin_rules r set tipo = t where r.categoria = velho.nome;
  else
    t := velho.tipo;
  end if;
  return jsonb_build_object('nome', v_nome, 'tipo', t, 'juntou', juntou);
end $$;

-- ---------- fin_painel ----------
-- Igual à de 20261106220000_reclassificar, mais o ícone de cada categoria ('ic' em 'categorias').
-- Tudo o que a tela Dinheiro precisa, no mesmo formato do painel-dados.json (schema painel-financas/1).
-- Open Finance: contas, cartões, faturas e lançamentos. Foto manual (fin_snapshots): o que não vem pelo Open Finance.
-- Roda com as permissões de quem chama: o RLS de cada tabela continua valendo.
create or replace function public.fin_painel()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  s jsonb;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  mes1 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  sinc timestamptz;
  atual timestamptz;
  pg jsonb;
  contas jsonb;
  cartoes jsonb;
  cp jsonb;
  tx jsonb;
  gastos jsonb;
  acl jsonb;
  ncl int;
  outros jsonb;
  plano jsonb;
  regras jsonb;
  conex jsonb;
  pend jsonb;
  bens jsonb := '[]'::jsonb;
  car jsonb;
  passivos jsonb := '[]'::jsonb;
  fin jsonb;
  fin_cat text;
  ref date;
  prox0 date;
  pagas0 int;
  prazo int;
  rest0 int;
  parc numeric;
  taxa numeric;
  novas int := 0;
  pv_ref numeric;
  pv_hoje numeric;
  saldo numeric;
begin
  if not private.fin_is_owner() then
    raise exception 'nao_e_dono' using hint = 'fin_reivindicar';
  end if;

  select x.data into s from public.fin_snapshots x where x.kind = 'manual' order by x.created_at desc, x.id desc limit 1;
  s := coalesce(s, '{}'::jsonb);
  select max(i.last_sync_at) into sinc from public.fin_items i;
  -- Quando todos os bancos trouxeram dados novos (atualização do próprio Pluggy, não a cópia para cá); null se algum
  -- está com erro ou nunca atualizou. O app só deixa de descontar o que foi marcado à mão depois dessa data.
  select case when count(*) > 0 and bool_and(i.last_updated_at is not null and i.last_error is null)
              then min(i.last_updated_at) end
    into atual from public.fin_items i;
  -- Data do pagamento de cada fatura (cada pagamento quita uma fatura só).
  select coalesce(jsonb_object_agg(f.bill_id, f.pago_em), '{}'::jsonb) into pg from private.fin_faturas_pagas() f;

  -- Contas: só as que têm saldo ou movimento nos últimos 90 dias.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'n', case a.subtype when 'CHECKING_ACCOUNT' then 'Conta corrente' when 'SAVINGS_ACCOUNT' then 'Poupança' else 'Conta' end,
      'inst', private.fin_inst(a.item_id, a.raw, a.name),
      'fim', right(coalesce(a.number, ''), 4),
      'saldo', coalesce(a.balance, 0),
      'dataSaldo', (a.updated_at at time zone 'America/Sao_Paulo')::date,
      'fonte', 'Open Finance') order by a.balance desc nulls last, a.id), '[]'::jsonb)
    into contas
    from public.fin_accounts a
   where a.type = 'BANK'
     and (coalesce(a.balance, 0) <> 0
          or exists (select 1 from public.fin_transactions t where t.account_id = a.id and t.date >= hoje - 90));

  -- Cartões: o mais usado nos últimos 6 meses fechados vem primeiro (é o "principal" das telas). O app guarda a
  -- marcação à mão junto com o nome e o vencimento da fatura, então uma troca de principal não leva a marcação junto.
  with c as (
    select a.id, a.name, a.balance, a.credit_limit, a.due_date, a.updated_at,
           private.fin_inst(a.item_id, a.raw, a.name) as inst,
           right(coalesce(a.number, ''), 4) as fim,
           (select coalesce(sum(b.total), 0) from public.fin_bills b
             where b.account_id = a.id and b.due_date >= (mes1 - interval '6 months')::date and b.due_date < mes1) as uso6,
           px.id as prox_id, px.total as prox_v, px.due_date as prox_d,
           mx.id as mes_id, mx.total as mes_v, mx.due_date as mes_d
      from public.fin_accounts a
      left join lateral (select b.id, b.total, b.due_date from public.fin_bills b
                          where b.account_id = a.id and b.due_date >= hoje order by b.due_date, b.id limit 1) px on true
      left join lateral (select b.id, b.total, b.due_date from public.fin_bills b
                          where b.account_id = a.id and b.due_date >= mes1 order by b.due_date, b.id limit 1) mx on true
     where a.type = 'CREDIT'
  ), c2 as (
    select c.*,
           row_number() over (order by c.uso6 desc, c.id) as ord,
           count(*) over (partition by c.inst) as ninst
      from c
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', c2.id,
      'ord', c2.ord,
      'n', 'Cartão ' || c2.inst || case when c2.ninst > 1 then ' ' || c2.fim else '' end,
      'nome', c2.name,
      'fim', c2.fim,
      'limite', coalesce(c2.credit_limit, nullif(s -> 'limitesCartao' ->> c2.fim, '')::numeric),
      'usado', coalesce(c2.balance, 0),
      'refUsado', to_char(c2.updated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') || ' (Open Finance)',
      'vence', extract(day from coalesce(c2.prox_d, c2.mes_d, c2.due_date))::int,
      -- Faturas que já venceram, com a data do pagamento quando ele aparece no extrato (sem ela, ainda não foi paga).
      'pagamentos', (select coalesce(jsonb_agg(jsonb_build_object(
                         'd', b.due_date, 'vence', b.due_date, 'v', b.total,
                         'pagoEm', pg ->> b.id) order by b.due_date), '[]'::jsonb)
                       from public.fin_bills b where b.account_id = c2.id and b.due_date < hoje and b.total > 0),
      'faturaAtual', case when c2.prox_d is not null then jsonb_build_object('vence', c2.prox_d, 'v', c2.prox_v, 'pagoEm', pg ->> c2.prox_id) end,
      'faturaMes', case when c2.mes_d is not null then jsonb_build_object(
                     'vence', c2.mes_d, 'v', c2.mes_v, 'pagoEm', pg ->> c2.mes_id) end,
      'faturas', 'Faturas e compras pelo Open Finance'))
    order by c2.ord), '[]'::jsonb)
    into cartoes
    from c2;

  -- Faturas como contas do mês. Só conta como paga sozinha quando um pagamento de fatura bate o valor,
  -- mesmo que tenha sido feito no mês anterior ao vencimento (pagoEm).
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', case when (e ->> 'ord')::int = 1 then 'fatura' else 'fatura-' || (e ->> 'fim') end,
      'n', 'Fatura ' || (e ->> 'n'),
      'v', coalesce((e -> 'faturaMes' ->> 'v')::numeric, (e ->> 'usado')::numeric),
      'dia', (e ->> 'vence')::int,
      'met', 'Fatura',
      'cat', 'Cartão',
      'estimado', e -> 'faturaMes' is null,
      'fatura', (e ->> 'ord')::int = 1,
      'txCat', case when e -> 'faturaMes' is not null then 'Pagamento de fatura' end,
      'txValor', e -> 'faturaMes' -> 'v',
      'venceEm', e -> 'faturaMes' -> 'vence',
      'pagoEm', e -> 'faturaMes' -> 'pagoEm'))
    order by (e ->> 'ord')::int), '[]'::jsonb)
    into cp
    from jsonb_array_elements(cartoes) e
   where e ? 'vence'
     and (coalesce((e -> 'faturaMes' ->> 'v')::numeric, 0) > 0 or coalesce((e ->> 'usado')::numeric, 0) > 0);

  -- Lançamentos: compras do cartão levam o vencimento da fatura (fat).
  -- id para trocar a categoria pelo app; man = categoria escolhida à mão (auto = a que as regras dariam);
  -- m = lançamento feito à mão (cn = rótulo da conta).
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', l.id, 'd', l.date, 'v', l.amount, 'desc', l.description, 'conta', l.account_id,
      'cat', coalesce(l.categoria, 'Sem categoria'), 'tipo', l.tipo, 'fat', b.due_date,
      'man', case when not l.manual and l.categoria_manual is not null then true end,
      'auto', case when not l.manual and l.categoria_manual is not null then l.categoria_auto end,
      'm', case when l.manual then true end,
      'cn', case when l.manual then l.conta end))
    order by l.date, l.id), '[]'::jsonb)
    into tx
    from public.fin_lancamentos l
    left join public.fin_bills b on b.id = l.bill_id;

  -- Gastos por mês e categoria: conta pela data; cartão pelo mês em que a fatura vence.
  with g as (
    select case when l.conta_tipo = 'CREDIT'
                then to_char(coalesce(b.due_date, (l.date + interval '1 month')::date), 'YYYY-MM')
                else to_char(l.date, 'YYYY-MM') end as m,
           coalesce(l.categoria, 'Sem categoria') as c,
           sum(-l.amount) as v
      from public.fin_lancamentos l
      left join public.fin_bills b on b.id = l.bill_id
     where l.tipo in ('despesa', 'divida')
     group by 1, 2
  ), gm as (
    -- Valores negativos ficam (estornos maiores que as compras): o app soma por grupo antes de filtrar.
    select g.m, jsonb_object_agg(g.c, round(g.v, 2)) as o from g where abs(g.v) >= 0.01 group by g.m
  )
  select coalesce(jsonb_object_agg(gm.m, gm.o), '{}'::jsonb) into gastos from gm;

  -- Sem categoria ainda.
  select count(*) into ncl from public.fin_lancamentos l where l.categoria ilike '%classificar%';
  select coalesce(jsonb_agg(q.x order by q.n desc), '[]'::jsonb) into acl from (
    select jsonb_build_object(
             'nome', left(l.description, 40),
             'entradas', coalesce(round(sum(l.amount) filter (where l.amount > 0), 2), 0),
             'saidas', coalesce(round(-sum(l.amount) filter (where l.amount < 0), 2), 0),
             'n', count(*)) as x,
           count(*) as n
      from public.fin_lancamentos l
     where l.categoria ilike '%classificar%'
     group by left(l.description, 40)
     order by count(*) desc
     limit 12) q;
  pend := coalesce(s -> 'pendentes', '[]'::jsonb);
  if ncl > 0 then
    pend := pend || jsonb_build_array(jsonb_build_object(
      'n', 'Lançamentos sem categoria',
      'por', ncl || ' lançamentos do Open Finance ainda estão sem categoria.',
      'como', 'Em Dinheiro → Lançamentos, filtro “A classificar”: toque em cada um e escolha a categoria.'));
  end if;

  -- Plano de contas, com quantos lançamentos usam cada categoria (q) e quantas despesas nos últimos 90 dias (q90).
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'n', p.nome, 'tipo', p.tipo, 'ic', p.icone, 'sis', case when p.sistema then true end, 'q', coalesce(u.q, 0), 'q90', coalesce(u.q90, 0)))
    order by p.nome), '[]'::jsonb)
    into plano
    from public.fin_plano p
    left join (select l.categoria as c, count(*) as q,
                      count(*) filter (where l.date >= hoje - 90 and l.amount < 0) as q90
                 from public.fin_lancamentos l group by l.categoria) u on u.c = p.nome;
  -- Regras pessoais (prioridade abaixo de 50), para ver e apagar pelo app.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'p', r.padrao, 'c', r.categoria, 'ct', r.conta_tipo, 's', r.sentido, 'nota', r.nota))
    order by r.prioridade, r.id), '[]'::jsonb)
    into regras
    from public.fin_rules r where r.prioridade < 50;

  -- Renda fixa e fundos do Open Finance (ações, ETFs e FIIs vêm da B3, na foto manual).
  select coalesce(jsonb_agg(jsonb_build_object(
      'n', split_part(i.name, ' - ', 1) || ' (' || coalesce((select private.fin_inst(a.item_id, a.raw, a.name) from public.fin_accounts a where a.item_id = i.item_id order by a.type, a.id limit 1), 'Open Finance') || ')',
      'v', i.balance) order by i.balance desc), '[]'::jsonb)
    into outros
    from public.fin_investments i
   where coalesce(i.balance, 0) > 0
     and i.type not in ('EQUITY', 'ETF');

  select coalesce(jsonb_agg(jsonb_build_object(
      'inst', coalesce((select private.fin_inst(a.item_id, a.raw, a.name) from public.fin_accounts a where a.item_id = i.id order by a.type, a.id limit 1), 'Open Finance'),
      'status', i.execution_status,
      'sinc', i.last_sync_at,
      'atualizado', i.last_updated_at,
      'consentimento', (i.consent_expires_at at time zone 'America/Sao_Paulo')::date,
      'erro', i.last_error is not null) order by i.last_sync_at), '[]'::jsonb)
    into conex
    from public.fin_items i;

  -- Carro pela FIPE da foto manual.
  car := s -> 'carro';
  if car is not null then
    bens := jsonb_build_array(jsonb_build_object(
      'n', car -> 'n',
      'valor', coalesce(car -> 'fipe', car -> 'custo'),
      'base', case when car ? 'fipe'
                   then 'Tabela FIPE ' || substr(car ->> 'fipeRef', 6, 2) || '/' || left(car ->> 'fipeRef', 4) || ' (código ' || coalesce(car ->> 'fipeCodigo', '') || ')'
                   else 'custo de compra' end));
  end if;

  -- Financiamento: parcelas pagas pelo extrato e saldo levado até hoje pela taxa do contrato.
  fin := s -> 'financiamento';
  if fin is not null then
    select e ->> 'txCat' into fin_cat
      from jsonb_array_elements(coalesce(s -> 'contasFixas', '[]'::jsonb)) e
     where e ->> 'passivo' = coalesce(fin ->> 'id', 'carro')
     limit 1;
    ref := (fin ->> 'refSaldo')::date;
    prox0 := (fin ->> 'proxVenc')::date;
    pagas0 := coalesce((fin ->> 'pagas')::int, 0);
    prazo := (fin ->> 'prazo')::int;
    rest0 := coalesce((fin ->> 'restantes')::int, prazo - pagas0, 0);
    parc := (fin ->> 'parcela')::numeric;
    taxa := (fin ->> 'taxaDia')::numeric / 100;
    saldo := (fin ->> 'saldoDevedor')::numeric;
    if fin_cat is not null and ref is not null then
      select count(*) into novas
        from public.fin_lancamentos l
       where l.categoria = fin_cat and l.amount < 0 and l.date > ref;
    end if;
    novas := least(coalesce(novas, 0), rest0);
    if saldo is not null and taxa > 0 and prox0 is not null and ref is not null and rest0 > 0 and parc > 0 then
      select sum(parc / power(1 + taxa, ((prox0 + make_interval(months => k))::date - ref)))
        into pv_ref from generate_series(0, rest0 - 1) k;
      select coalesce(sum(parc / power(1 + taxa, ((prox0 + make_interval(months => k))::date - hoje))), 0)
        into pv_hoje from generate_series(novas, rest0 - 1) k;
      if pv_ref > 0 then
        saldo := round(saldo * pv_hoje / pv_ref, 2);
      end if;
    end if;
    passivos := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', coalesce(fin ->> 'id', 'carro'),
      'n', fin -> 'n',
      'inst', fin -> 'inst',
      'contratado', fin -> 'contratado',
      'parcela', parc,
      'prazo', prazo,
      'pagas', pagas0 + novas,
      'restantes', rest0 - novas,
      'proxVenc', case when prox0 is not null then (prox0 + make_interval(months => novas))::date end,
      'ultimaParcela', fin -> 'ultimaParcela',
      'saldoDevedor', saldo,
      'refSaldo', case when saldo is distinct from (fin ->> 'saldoDevedor')::numeric
                       then 'estimado para hoje pela taxa do contrato, a partir do extrato de ' || to_char(ref, 'DD/MM/YYYY')
                       else to_char(ref, 'DD/MM/YYYY') || ' (' || coalesce(fin ->> 'fonte', 'extrato do contrato') || ')' end,
      'longo', true,
      'aPagarNominal', round((rest0 - novas) * parc, 2),
      'jurosFuturos', round((rest0 - novas) * parc - saldo, 2),
      'taxaDia', fin -> 'taxaDia',
      'iof', fin -> 'iof')));
  end if;
  -- Cartões em aberto entram como dívida de curto prazo.
  select passivos || coalesce(jsonb_agg(jsonb_build_object(
      'id', 'cartao-' || (e ->> 'fim'), 'n', e ->> 'n', 'saldoDevedor', (e ->> 'usado')::numeric, 'refSaldo', e ->> 'refUsado')
    order by (e ->> 'ord')::int), '[]'::jsonb)
    into passivos
    from jsonb_array_elements(cartoes) e
   where (e ->> 'usado')::numeric > 0;

  return jsonb_build_object(
    'schema', 'painel-financas/1',
    'origem', 'supabase',
    'geradoEm', coalesce((sinc at time zone 'America/Sao_Paulo')::date, hoje),
    'sincronizadoEm', sinc,
    'atualizadoEm', atual,
    'lidoEm', now(),
    'snapshotEm', s -> 'geradoEm',
    'contas', contas,
    'caixinha', null,
    'cartoes', cartoes,
    'cartaoDetalhado', true,
    'cartaoPorMes', '{}'::jsonb,
    'faturaEstimada', cartoes -> 0 -> 'faturaAtual' -> 'v',
    'investimentos', case when s ? 'investimentosB3' then jsonb_build_object(
        'data', s -> 'investimentosB3' -> 'data', 'inst', s -> 'investimentosB3' -> 'inst', 'total', s -> 'investimentosB3' -> 'total',
        'posicoes', s -> 'investimentosB3' -> 'posicoes', 'serie', s -> 'investimentosB3' -> 'serie') end,
    'investimentosPorTipo', coalesce(s -> 'investimentosB3' -> 'porTipo', '{}'::jsonb),
    'passivos', passivos,
    'limitesNaoUsados', s -> 'limitesNaoUsados',
    'receber', '[]'::jsonb,
    'outrosAtivos', outros,
    'participacoes', coalesce(s -> 'participacoes', '[]'::jsonb),
    'bens', bens,
    'contasPagar', coalesce(s -> 'contasFixas', '[]'::jsonb) || cp,
    'gastosPorMes', gastos,
    'gruposGasto', coalesce(s -> 'gruposGasto', '{}'::jsonb),
    'aClassificar', acl,
    'serieMensal', coalesce(s -> 'serieMensal', '[]'::jsonb),
    'essenciaisMes', s -> 'essenciaisMes',
    'essenciaisLabel', s -> 'essenciaisLabel',
    'budget', coalesce(s -> 'budget', '[]'::jsonb),
    'notas', coalesce(s -> 'notas', '{}'::jsonb) || jsonb_build_object('cartoes', 'Limite, uso, faturas e compras pelo Open Finance'),
    'pendentes', pend,
    'conexoes', conex,
    'transacoes', tx,
    'categorias', plano,
    'regras', regras);
end
$$;
