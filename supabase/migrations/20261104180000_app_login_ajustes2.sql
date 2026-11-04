-- Segunda rodada de ajustes, depois da revisão das correções:
-- 1. Cada pagamento de fatura quita uma fatura só: a de valor mais parecido e vencimento mais perto (atraso pesa
--    o dobro). Antes, um pagamento de fevereiro podia marcar também a fatura de março com o mesmo valor.
-- 2. A ordem dos cartões desempata pelo id da conta, que não muda (o limite muda quando o banco quer).
-- 3. atualizadoEm: quando todos os bancos trouxeram dados novos, para o app saber se o saldo já mostra o que foi
--    marcado à mão. Cada conexão também manda a sua (atualizado).
-- 4. A fatura seguinte (faturaAtual) também diz se já foi paga.

-- Pagamentos de fatura e a fatura que cada um quita. Um pagamento é o crédito no próprio cartão ou o débito numa
-- conta, categoria 'Pagamento de fatura', com o valor da fatura (diferença menor que R$ 1), de 28 dias antes a 20
-- dias depois do vencimento. Quando serve para mais de uma fatura, fica com a de valor mais parecido e, empatado,
-- com a de vencimento mais perto: pagar antes do vencimento conta a distância simples; pagar depois, em dobro.
create or replace function private.fin_faturas_pagas()
returns table (bill_id text, pago_em date)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select b.id, b.account_id, b.due_date, b.total from public.fin_bills b where b.total >= 1
  ), p as (
    select l.id, l.date, l.amount, l.account_id, l.conta_tipo
      from public.fin_lancamentos l
     where l.categoria = 'Pagamento de fatura'
       and ((l.conta_tipo = 'BANK' and l.amount < 0) or (l.conta_tipo <> 'BANK' and l.amount > 0))
  ), m as (
    select p.id as pid, p.date, b.id as bid,
           row_number() over (partition by p.id
             order by round(abs(abs(p.amount) - b.total), 2),
                      case when p.date <= b.due_date then b.due_date - p.date else 2 * (p.date - b.due_date) end,
                      b.due_date, b.id) as r
      from p
      join b on abs(abs(p.amount) - b.total) < 1
            and p.date between b.due_date - 28 and b.due_date + 20
            and (p.conta_tipo = 'BANK' or p.account_id = b.account_id)
  )
  select m.bid, min(m.date) from m where m.r = 1 group by m.bid
$$;

-- A mesma regra para uma fatura só (mantida para quem já chamava esta função).
create or replace function private.fin_pago_em(p_conta text, p_vence date, p_total numeric)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select min(f.pago_em)
    from private.fin_faturas_pagas() f
    join public.fin_bills b on b.id = f.bill_id
   where b.account_id = p_conta and b.due_date = p_vence and p_total >= 1 and abs(b.total - p_total) < 1
$$;

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
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'd', l.date, 'v', l.amount, 'desc', l.description, 'conta', l.account_id,
      'cat', coalesce(l.categoria, 'Sem categoria'), 'tipo', l.tipo, 'fat', b.due_date))
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
      'como', 'Responder na planilha de categorias'));
  end if;

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
    'transacoes', tx);
end
$$;
