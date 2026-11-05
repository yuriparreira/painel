-- Atalho do iPhone (app Atalhos): manda o Apple Health e os eventos do Calendário (que no iPhone já junta iCloud e
-- Google) para a função atalho, que chama atalho_receber abaixo. O atalho se identifica com um token gerado no app
-- pela conta dona; aqui fica só o SHA-256 dele, e gerar outro invalida o anterior na hora.
-- O atalho manda listas cruas das amostras dos últimos dias; quem soma (sono por noite, passos por dia) é o banco,
-- sempre a partir de todas as amostras guardadas, então uma rodada que faltou é coberta pela seguinte.

create table if not exists private.atalho_token (
  id smallint primary key default 1 check (id = 1),
  hash text not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- Amostras do Apple Health. Totais do dia (passos, energia ativa, minutos de exercício) vêm com ini = 00:00 e
-- fim = 00:00 do dia seguinte (horário de Brasília); medidas pontuais (peso, FC de repouso, VFC) com fim = ini.
create table if not exists private.saude_amostra (
  tipo text not null check (tipo in ('sono', 'peso', 'fcr', 'vfc', 'passos', 'kcal', 'exerc')),
  ini timestamptz not null,
  fim timestamptz not null,
  est text not null default '',      -- estágio do sono: core, deep, rem, asleep, awake, inbed ou ?
  fonte text not null default '',
  valor numeric,
  recebido_em timestamptz not null default now(),
  primary key (tipo, ini, fim, est, fonte)
);

-- Corpo cru das últimas chamadas (14 dias), só enquanto ATALHO_BRUTO=1 na função: serve para ajustar a leitura dos
-- formatos de data e número que o iPhone manda.
create table if not exists private.atalho_bruto (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  corpo text not null
);

create table if not exists public.atalho_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tipo text not null,
  ok boolean not null,
  detalhe jsonb
);
create index if not exists atalho_log_em on public.atalho_log (em);

create table if not exists public.agenda_eventos (
  id bigint generated always as identity primary key,
  inicio timestamptz not null,
  fim timestamptz not null,
  dia_todo boolean not null default false,
  titulo text not null,
  calendario text,
  local text,
  recebido_em timestamptz not null default now()
);
create index if not exists agenda_eventos_inicio on public.agenda_eventos (inicio);

alter table public.saude_diario
  add column if not exists kcal_ativas numeric,
  add column if not exists exercicio_min numeric,
  add column if not exists ah_em timestamptz;   -- última gravação vinda do Apple Health

alter table private.atalho_token enable row level security;
alter table private.saude_amostra enable row level security;
alter table private.atalho_bruto enable row level security;
alter table public.atalho_log enable row level security;
alter table public.agenda_eventos enable row level security;
create policy dono_le on public.atalho_log for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.agenda_eventos for select to authenticated using (private.fin_is_owner());

-- Gera o token do atalho (só a conta dona). O texto do token só existe nesta resposta.
create or replace function public.atalho_novo_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tok text;
begin
  if not private.fin_is_owner() then
    raise exception 'nao_e_dono' using hint = 'fin_reivindicar';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.atalho_token (id, hash, criado_em, usado_em)
    values (1, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), now(), null)
    on conflict (id) do update set hash = excluded.hash, criado_em = excluded.criado_em, usado_em = null;
  insert into public.atalho_log (tipo, ok, detalhe) values ('token', true, null);
  return tok;
end
$$;

-- Dia a dia, a partir de todas as amostras guardadas: sono da noite (pela data em que acordou), passos, energia
-- ativa e minutos de exercício do dia, último peso, média da FC de repouso e da VFC. Grava em saude_diario sem apagar
-- o que já estava lá (vindo do Notion ou de antes) quando o Apple Health não tem o valor.
-- p_corte: onde começou a janela que o atalho leu. Uma noite que só aparece a partir dali (nas 3 primeiras horas, sem
-- nada guardado antes) pode ter sido cortada pela janela e não conta; com o que já estava guardado, ela fica inteira.
create or replace function private.saude_recalcular(p_de date, p_ate date, p_corte timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_de is null or p_ate is null or p_de > p_ate then
    return 0;
  end if;
  with s as (
    select a.fonte, a.ini, a.fim from private.saude_amostra a
    where a.tipo = 'sono' and a.est in ('core', 'deep', 'rem', 'asleep') and a.fim > a.ini
      and a.fim >= (p_de - 1)::timestamp at time zone 'America/Sao_Paulo'
      and a.ini < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
  ),
  o as (select s.*, max(s.fim) over (partition by s.fonte order by s.ini, s.fim rows between unbounded preceding and 1 preceding) ant from s),
  u as (select o.*, count(*) filter (where o.ant is null or o.ini > o.ant) over (partition by o.fonte order by o.ini, o.fim) g from o),
  m as (select u.fonte, min(u.ini) ini, max(u.fim) fim from u group by u.fonte, u.g),
  k as (
    select z.*, count(*) filter (where z.fa is null or z.ini - z.fa > interval '3 hours') over (partition by z.fonte order by z.ini) sess
    from (select m.*, lag(m.fim) over (partition by m.fonte order by m.ini) fa from m) z
  ),
  ss as (
    select k.fonte, sum(extract(epoch from k.fim - k.ini)) / 3600.0 horas, (max(k.fim) at time zone 'America/Sao_Paulo')::date d, min(k.ini) ini0
    from k group by k.fonte, k.sess
  ),
  f as (select a.fonte, bool_or(a.est in ('core', 'deep', 'rem')) tem_fases from private.saude_amostra a where a.tipo = 'sono' group by a.fonte),
  sono as (
    select distinct on (ss.d) ss.d, round(ss.horas::numeric, 2) h
    from ss join f using (fonte)
    where ss.d between p_de and p_ate and ss.horas >= 0.5
      and not (p_corte is not null and ss.ini0 >= p_corte and ss.ini0 < p_corte + interval '3 hours')
    order by ss.d, f.tem_fases desc, ss.horas desc
  ),
  dias as (select g::date d from generate_series(p_de, p_ate, interval '1 day') g),
  tot as (
    select (a.ini at time zone 'America/Sao_Paulo')::date d,
      max(a.valor) filter (where a.tipo = 'passos') passos,
      max(a.valor) filter (where a.tipo = 'kcal') kcal,
      max(a.valor) filter (where a.tipo = 'exerc') exerc
    from private.saude_amostra a
    where a.tipo in ('passos', 'kcal', 'exerc')
      and a.ini >= p_de::timestamp at time zone 'America/Sao_Paulo' and a.ini < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ),
  pontos as (
    select (a.ini at time zone 'America/Sao_Paulo')::date d,
      (array_agg(a.valor order by a.ini desc) filter (where a.tipo = 'peso'))[1] peso,
      avg(a.valor) filter (where a.tipo = 'fcr') fcr,
      avg(a.valor) filter (where a.tipo = 'vfc') vfc
    from private.saude_amostra a
    where a.tipo in ('peso', 'fcr', 'vfc')
      and a.ini >= p_de::timestamp at time zone 'America/Sao_Paulo' and a.ini < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ),
  linhas as (
    select dias.d, sono.h sono, round(tot.passos)::integer passos, round(pontos.peso, 1) peso, round(pontos.fcr) fcr, round(pontos.vfc) vfc,
      round(tot.kcal) kcal, round(tot.exerc) exerc
    from dias
    left join sono on sono.d = dias.d
    left join tot on tot.d = dias.d
    left join pontos on pontos.d = dias.d
  )
  insert into public.saude_diario as x (data, sono, passos, peso, fc_repouso, hrv, kcal_ativas, exercicio_min, fonte, ah_em, atualizado_em)
  select l.d, l.sono, l.passos, l.peso, l.fcr, l.vfc, l.kcal, l.exerc, 'Apple Health', now(), now()
  from linhas l
  where coalesce(l.sono, l.passos, l.peso, l.fcr, l.vfc, l.kcal, l.exerc) is not null
  on conflict (data) do update set
    sono = coalesce(excluded.sono, x.sono),
    passos = coalesce(excluded.passos, x.passos),
    peso = coalesce(excluded.peso, x.peso),
    fc_repouso = coalesce(excluded.fc_repouso, x.fc_repouso),
    hrv = coalesce(excluded.hrv, x.hrv),
    kcal_ativas = coalesce(excluded.kcal_ativas, x.kcal_ativas),
    exercicio_min = coalesce(excluded.exercicio_min, x.exercicio_min),
    fonte = case when x.fonte is null or x.fonte = '' then 'Apple Health' when strpos(x.fonte, 'Apple Health') > 0 then x.fonte else x.fonte || ' + Apple Health' end,
    ah_em = now(),
    atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- Recebe o que a função atalho já normalizou (ela confere o formato; aqui confere o token). Pode ser chamada direto
-- pela API também, mas só com o token, então vale o mesmo que chamar a função.
-- p_dados: { tipo, amostras: [{tipo, ini, fim, est, fonte, valor}], dias: [{tipo, dia, valor}], sono_corte,
--            eventos: [{titulo, inicio, fim, dia_todo, calendario, local}], janela: {de, ate}, avisos: [] }
-- Devolve só as contagens do que gravou ({amostras, dias, eventos, avisos}), nunca valores já guardados.
create or replace function public.atalho_receber(p_token text, p_dados jsonb, p_bruto text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tipo text := coalesce(p_dados->>'tipo', 'tudo');
  n_am integer := 0;
  n_dias integer := 0;
  n_ev integer;
  d_min date;
  d_max date;
  d_mins jsonb;
  de timestamptz;
  ate timestamptz;
  res jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'token_invalido';
  end if;
  update private.atalho_token t set usado_em = now()
    where t.id = 1 and t.hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    raise exception 'token_invalido';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'dados_invalidos';
  end if;

  if p_bruto is not null then
    insert into private.atalho_bruto (corpo) values (left(p_bruto, 2000000));
  end if;
  delete from private.atalho_bruto b where b.em < now() - interval '14 days';

  -- Corpo que a função não conseguiu ler: fica só o motivo (o corpo, só com ATALHO_BRUTO, acima).
  if v_tipo = 'erro' then
    insert into public.atalho_log (tipo, ok, detalhe) values ('erro', false, jsonb_build_object('erro', left(coalesce(p_dados->>'erro', ''), 300)));
    return jsonb_build_object('erro', left(coalesce(p_dados->>'erro', ''), 300));
  end if;

  -- Amostras (sono, peso, FC de repouso, VFC): a mesma amostra mandada de novo só atualiza o valor.
  if jsonb_typeof(p_dados->'amostras') = 'array' then
    -- A mesma amostra duas vezes na chamada entra uma vez (senão o insert inteiro falha).
    insert into private.saude_amostra as s (tipo, ini, fim, est, fonte, valor)
    select distinct on (b.tipo, b.ini, b.fim, b.est, b.fonte) b.tipo, b.ini, b.fim, b.est, b.fonte, b.valor
    from (
      select a.tipo, a.ini, coalesce(a.fim, a.ini) fim, coalesce(a.est, '') est, left(coalesce(a.fonte, ''), 120) fonte, a.valor
      from jsonb_to_recordset(p_dados->'amostras') as a(tipo text, ini timestamptz, fim timestamptz, est text, fonte text, valor numeric)
      where a.tipo in ('sono', 'peso', 'fcr', 'vfc') and a.ini is not null
        and a.ini > now() - interval '120 days' and a.ini < now() + interval '1 day'
    ) b
    order by b.tipo, b.ini, b.fim, b.est, b.fonte
    on conflict (tipo, ini, fim, est, fonte) do update set valor = excluded.valor, recebido_em = now();
    get diagnostics n_am = row_count;
  end if;

  -- Totais do dia (passos, energia ativa, minutos de exercício): o dia de hoje ainda cresce e o primeiro dia da janela
  -- de cada tipo pode vir pela metade, então nesses dois o total guardado não diminui. Nos outros vale o que veio agora
  -- (assim um total contado a mais, como iPhone e Watch somados, pode ser corrigido).
  if jsonb_typeof(p_dados->'dias') = 'array' then
    select jsonb_object_agg(t.tipo, t.m) into d_mins from (
      select a.tipo, min(a.dia) m from jsonb_to_recordset(p_dados->'dias') as a(tipo text, dia date, valor numeric)
      where a.tipo in ('passos', 'kcal', 'exerc') and a.dia is not null and a.valor is not null group by a.tipo) t;
    insert into private.saude_amostra as s (tipo, ini, fim, est, fonte, valor)
    select distinct on (b.tipo, b.dia) b.tipo, b.dia::timestamp at time zone 'America/Sao_Paulo', (b.dia + 1)::timestamp at time zone 'America/Sao_Paulo', '', '', b.valor
    from jsonb_to_recordset(p_dados->'dias') as b(tipo text, dia date, valor numeric)
    where b.tipo in ('passos', 'kcal', 'exerc') and b.dia is not null and b.valor is not null
      and b.dia > hoje - 120 and b.dia <= hoje + 1
    order by b.tipo, b.dia, b.valor desc
    on conflict (tipo, ini, fim, est, fonte) do update set
      valor = case when (excluded.ini at time zone 'America/Sao_Paulo')::date >= hoje
          or (excluded.ini at time zone 'America/Sao_Paulo')::date <= (d_mins->>excluded.tipo)::date
        then greatest(s.valor, excluded.valor) else excluded.valor end,
      recebido_em = now();
    get diagnostics n_dias = row_count;
  end if;

  -- Dias que esta chamada tocou (sono conta pela data em que acordou), sem reescrever mais de 10 dias para trás.
  select min(d), max(d) into d_min, d_max from (
    select (a.fim at time zone 'America/Sao_Paulo')::date d
      from jsonb_to_recordset(case when jsonb_typeof(p_dados->'amostras') = 'array' then p_dados->'amostras' else '[]'::jsonb end)
        as a(ini timestamptz, fim timestamptz)
      where a.fim is not null
    union all
    select (a.ini at time zone 'America/Sao_Paulo')::date
      from jsonb_to_recordset(case when jsonb_typeof(p_dados->'amostras') = 'array' then p_dados->'amostras' else '[]'::jsonb end)
        as a(ini timestamptz)
      where a.ini is not null
    union all
    select a.dia from jsonb_to_recordset(case when jsonb_typeof(p_dados->'dias') = 'array' then p_dados->'dias' else '[]'::jsonb end)
        as a(dia date)
      where a.dia is not null
  ) t;
  if d_min is not null then
    perform private.saude_recalcular(greatest(d_min, hoje - 10), least(d_max, hoje), (p_dados->>'sono_corte')::timestamptz);
  end if;
  delete from private.saude_amostra s where s.ini < now() - interval '120 days';

  -- Agenda: a janela inteira é trocada pelo que veio (o iPhone não manda identificador dos eventos).
  if p_dados ? 'eventos' and jsonb_typeof(p_dados->'eventos') = 'array' then
    de := coalesce((p_dados->'janela'->>'de')::timestamptz, ((hoje - 1)::timestamp at time zone 'America/Sao_Paulo'));
    ate := coalesce((p_dados->'janela'->>'ate')::timestamptz, ((hoje + 15)::timestamp at time zone 'America/Sao_Paulo'));
    delete from public.agenda_eventos e where e.inicio < ate and e.fim > de;
    insert into public.agenda_eventos (inicio, fim, dia_todo, titulo, calendario, local)
    select a.inicio, greatest(coalesce(a.fim, a.inicio), a.inicio), coalesce(a.dia_todo, false), left(a.titulo, 200), left(a.calendario, 100), left(a.local, 200)
    from jsonb_to_recordset(p_dados->'eventos') as a(titulo text, inicio timestamptz, fim timestamptz, dia_todo boolean, calendario text, local text)
    where a.titulo is not null and a.titulo <> '' and a.inicio is not null and a.inicio < ate and coalesce(a.fim, a.inicio) >= de;
    get diagnostics n_ev = row_count;
    delete from public.agenda_eventos e where e.fim < now() - interval '30 days';
  end if;

  -- Só as contagens: quem tem o token manda dados, mas não lê de volta o que já estava guardado.
  select jsonb_strip_nulls(jsonb_build_object(
      'amostras', n_am, 'dias', n_dias, 'eventos', n_ev,
      'avisos', case when jsonb_typeof(p_dados->'avisos') = 'array' and jsonb_array_length(p_dados->'avisos') > 0 then p_dados->'avisos' end))
    into res;

  insert into public.atalho_log (tipo, ok, detalhe) values (left(v_tipo, 20), true, res);
  delete from public.atalho_log l where l.em < now() - interval '90 days' and l.tipo <> 'token'; -- o token vale até gerar outro
  return res;
end
$$;
