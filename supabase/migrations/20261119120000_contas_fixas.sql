-- 0.9.3: contas fixas pelo app (editar, criar e tirar).
-- As contas fixas ficam na foto manual mais nova (fin_snapshots, kind 'manual'), em data -> 'contasFixas', e o
-- fin_painel as junta às faturas em contasPagar. Estas funções mudam só essa lista, no lugar, e só a conta dona grava.
-- A parcela de um financiamento (com 'passivo') não muda por aqui: o financiamento acha as parcelas pagas pela
-- categoria dela, e o app a tira da lista no mês seguinte ao da última parcela.
-- Cada conta: id, n (nome), v (valor), dia (vencimento), met (forma de pagamento), cat (grupo, para o ícone),
-- txCat (categoria do extrato que a quita, opcional), estimado (valor que muda todo mês), desde (mês 'AAAA-MM' em
-- que uma conta nova começa a contar), criada (dia 'AAAA-MM-DD' em que uma conta nova deste mês foi criada: um débito
-- de antes, como o de uma conta tirada, não a quita) e antes (m: o mês; l: os campos que achavam o pagamento antes de
-- cada edição desse mês, para o pagamento que já saiu continuar valendo). Outras chaves ficam como estão.
-- Conta com flex ou sem valor não aparece no app e não prende categoria.
-- O dia e o mês das contas viram às 3 h no horário de Brasília, como no app.
-- A lista passa a ser do app: uma foto manual nova herda a lista da foto anterior (gatilho no fim deste arquivo).
-- Pode ser colado de novo: só cria ou troca funções e o gatilho.

-- Dia de hoje para as contas (o diaNow do app).
create or replace function private.fin_hoje() returns date
language sql stable set search_path = '' as $$
  select ((now() at time zone 'America/Sao_Paulo') - interval '3 hours')::date
$$;

-- Categorias que as contas da lista usam: a de agora (atual) e as que acharam o pagamento delas no mês p_mes, antes
-- de uma edição (antes). Só as contas que aparecem no app.
create or replace function private.fin_contas_cats(p_arr jsonb, p_mes text)
returns table (conta text, categoria text, atual boolean)
language sql immutable set search_path = '' as $$
  with c as (
    select e from jsonb_array_elements(case when jsonb_typeof(p_arr) = 'array' then p_arr else '[]'::jsonb end) e
     where jsonb_typeof(e) = 'object' and coalesce(e -> 'v', 'null'::jsonb) <> 'null'::jsonb
       and coalesce(e -> 'flex', 'null'::jsonb) in ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb))
  select c.e ->> 'id', c.e ->> 'txCat', true from c where c.e ->> 'txCat' is not null
  union all
  select c.e ->> 'id', a ->> 'txCat', false
    from c cross join lateral jsonb_array_elements(case when c.e -> 'antes' ->> 'm' = p_mes and jsonb_typeof(c.e -> 'antes' -> 'l') = 'array'
                                                        then c.e -> 'antes' -> 'l' else '[]'::jsonb end) a
   where jsonb_typeof(a) = 'object' and a ->> 'txCat' is not null
$$;

-- Uma conta com a categoria de para no lugar de de (na de agora e nas de antes).
create or replace function private.fin_conta_renomeia(e jsonb, de text, para text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(e) <> 'object' then e else
    (case when e ->> 'txCat' = de then e || jsonb_build_object('txCat', para) else e end)
    || case when jsonb_typeof(e -> 'antes' -> 'l') = 'array'
              and exists (select 1 from jsonb_array_elements(e -> 'antes' -> 'l') a where a ->> 'txCat' = de)
            then jsonb_build_object('antes', (e -> 'antes') || jsonb_build_object('l', (
                   select jsonb_agg(case when a ->> 'txCat' = de then a || jsonb_build_object('txCat', para) else a end order by o)
                     from jsonb_array_elements(e -> 'antes' -> 'l') with ordinality w(a, o))))
            else '{}'::jsonb end
  end
$$;

create or replace function public.fin_conta_salvar(p_id text, p_nome text, p_valor numeric, p_dia int, p_met text,
  p_categoria text default null, p_varia boolean default false, p_desde text default null, p_base jsonb default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  sid bigint;
  arr jsonb;
  i int;
  velho jsonb;
  novo jsonb;
  campos jsonb;
  agora jsonb;
  lista jsonb;
  usada boolean;
  nid text := p_id;
  nome text := left(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 80);
  cat text := nullif(btrim(coalesce(p_categoria, '')), '');
  hoje date := private.fin_hoje();
  mes text;
begin
  perform private.fin_dono();
  mes := to_char(hoje, 'YYYY-MM');
  if length(nome) = 0 then raise exception 'nome_invalido'; end if;
  if p_valor is null or p_valor <= 0 or p_valor >= 1000000 then raise exception 'valor_invalido'; end if;
  if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'dia_invalido'; end if;
  -- Uma mudança na lista por vez, também contra uma foto manual nova gravada ao mesmo tempo (o gatilho espera esta).
  perform pg_advisory_xact_lock(20261119);
  select x.id, x.data -> 'contasFixas' into sid, arr
    from public.fin_snapshots x
   where x.kind = 'manual'
   order by x.created_at desc, x.id desc
   limit 1
   for update;
  if sid is null then raise exception 'sem_foto'; end if;
  if arr is null or jsonb_typeof(arr) <> 'array' then arr := '[]'::jsonb; end if;
  if p_id is not null then
    select z.o - 1, z.e into i, velho
      from jsonb_array_elements(arr) with ordinality z(e, o)
     where z.e ->> 'id' = p_id
     limit 1;
    if i is null then raise exception 'conta_nao_existe'; end if;
    if velho ? 'passivo' then raise exception 'conta_do_financiamento'; end if;
    -- O app manda a conta como a viu: se ela mudou nesse meio-tempo (outro aparelho), não grava por cima.
    if p_base is not null and ((velho -> 'n') is distinct from (p_base -> 'n') or (velho -> 'v') is distinct from (p_base -> 'v')
        or (velho -> 'dia') is distinct from (p_base -> 'dia') or (velho -> 'met') is distinct from (p_base -> 'met')
        or (velho -> 'txCat') is distinct from (p_base -> 'txCat') or (velho -> 'estimado') is distinct from (p_base -> 'estimado')) then
      raise exception 'conta_mudou';
    end if;
  end if;
  -- A forma e a categoria que a conta já tem continuam valendo, mesmo fora da lista do app ou do plano de contas.
  if p_met is null or (p_met not in ('Boleto', 'Pix', 'Débito automático', 'Cartão') and p_met is distinct from velho ->> 'met') then
    raise exception 'forma_invalida';
  end if;
  if cat is not null and cat is distinct from velho ->> 'txCat' then
    if not exists (select 1 from public.fin_plano x where x.nome = cat) then raise exception 'categoria_nao_existe'; end if;
    -- Um lançamento só quita uma conta: duas contas na mesma categoria ficariam pagas pelo mesmo débito. Vale também a
    -- categoria em que outra conta foi paga neste mês, antes de ser editada (o pagamento dela está nela).
    select bool_or(u.atual) into usada from private.fin_contas_cats(arr, mes) u where u.categoria = cat and u.conta is distinct from p_id;
    if usada then raise exception 'categoria_ja_usada'; end if;
    if usada is not null then raise exception 'categoria_quitou_no_mes'; end if;
  end if;
  if p_id is null and p_desde is not null and p_desde !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'desde_invalido'; end if;
  novo := jsonb_build_object('n', nome, 'v', round(p_valor, 2), 'dia', p_dia, 'met', p_met,
    'cat', case when cat is null then 'Outros' when position(':' in cat) > 0 then btrim(split_part(cat, ':', 1)) else cat end);
  if cat is not null then novo := novo || jsonb_build_object('txCat', cat); end if;
  if coalesce(p_varia, false) then novo := novo || jsonb_build_object('estimado', true); end if;
  if p_id is null then
    loop
      nid := 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (select 1 from jsonb_array_elements(arr) e where e ->> 'id' = nid);
    end loop;
    novo := jsonb_build_object('id', nid) || novo;
    -- Começa num mês que vem (desde) ou hoje (criada: um débito de antes, como o de uma conta tirada, não a quita).
    if p_desde > mes then novo := novo || jsonb_build_object('desde', p_desde);
    else novo := novo || jsonb_build_object('criada', to_char(hoje, 'YYYY-MM-DD'));
    end if;
    arr := arr || jsonb_build_array(novo);
  else
    -- Os campos que acham o pagamento, como estavam antes desta edição, entram na lista do mês (antes): o pagamento
    -- deste mês achado por eles continua valendo depois da edição, mesmo com mais de uma edição no mês.
    campos := jsonb_strip_nulls(jsonb_build_object('v', velho -> 'v', 'dia', velho -> 'dia', 'txCat', velho -> 'txCat',
      'estimado', case when velho -> 'estimado' = 'true'::jsonb then 'true'::jsonb end, 'txValor', velho -> 'txValor'));
    lista := case when velho -> 'antes' ->> 'm' = mes and jsonb_typeof(velho -> 'antes' -> 'l') = 'array' then velho -> 'antes' -> 'l' else '[]'::jsonb end;
    -- Só uma conta com categoria do extrato acha o pagamento sozinha; uma que só começa num mês que vem (desde) não foi
    -- paga neste. Nas outras, não há o que guardar.
    if nullif(velho ->> 'txCat', '') is not null and coalesce(velho ->> 'desde', '') <= mes
       and not exists (select 1 from jsonb_array_elements(lista) a where a = campos) then
      lista := lista || jsonb_build_array(campos);
    end if;
    novo := (velho - 'n' - 'v' - 'dia' - 'met' - 'cat' - 'txCat' - 'estimado' - 'antes') || novo;
    -- Com a mesma categoria do extrato, o grupo (e o ícone) que a conta já tinha fica.
    if velho ? 'cat' and cat is not distinct from nullif(velho ->> 'txCat', '') then novo := novo || jsonb_build_object('cat', velho -> 'cat'); end if;
    -- txValor: o pagamento precisa bater esse valor. Acompanha o valor novo; numa conta de valor que muda, sai.
    if coalesce(p_varia, false) then novo := novo - 'txValor';
    elsif velho ? 'txValor' then novo := novo || jsonb_build_object('txValor', round(p_valor, 2));
    end if;
    -- Os campos de agora já acham o pagamento: na lista ficam só os outros.
    agora := jsonb_strip_nulls(jsonb_build_object('v', novo -> 'v', 'dia', novo -> 'dia', 'txCat', novo -> 'txCat',
      'estimado', case when novo -> 'estimado' = 'true'::jsonb then 'true'::jsonb end, 'txValor', novo -> 'txValor'));
    lista := coalesce((select jsonb_agg(a order by o) from jsonb_array_elements(lista) with ordinality w(a, o) where a <> agora), '[]'::jsonb);
    if jsonb_array_length(lista) > 0 then novo := novo || jsonb_build_object('antes', jsonb_build_object('m', mes, 'l', lista)); end if;
    arr := jsonb_set(arr, array[i::text], novo);
  end if;
  update public.fin_snapshots s set data = jsonb_set(s.data, '{contasFixas}', arr) where s.id = sid;
  return nid;
end $$;

-- Tira a conta da lista (não devo mais). Devolve false se ela já não estava lá.
create or replace function public.fin_conta_apagar(p_id text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  sid bigint;
  arr jsonb;
  velho jsonb;
begin
  perform private.fin_dono();
  perform pg_advisory_xact_lock(20261119);
  select x.id, x.data -> 'contasFixas' into sid, arr
    from public.fin_snapshots x
   where x.kind = 'manual'
   order by x.created_at desc, x.id desc
   limit 1
   for update;
  if sid is null or arr is null or jsonb_typeof(arr) <> 'array' then return false; end if;
  select e into velho from jsonb_array_elements(arr) e where e ->> 'id' = p_id limit 1;
  if velho is null then return false; end if;
  if velho ? 'passivo' then raise exception 'conta_do_financiamento'; end if;
  update public.fin_snapshots s
     set data = jsonb_set(s.data, '{contasFixas}', coalesce((
           select jsonb_agg(z.e order by z.o)
             from jsonb_array_elements(arr) with ordinality z(e, o)
            where z.e ->> 'id' is distinct from p_id), '[]'::jsonb))
   where s.id = sid;
  return true;
end $$;

-- Igual à de 20261106220000_reclassificar, mais: a categoria que quita uma conta fixa não sai do plano (a conta
-- deixaria de ficar paga sozinha).
create or replace function public.fin_categoria_apagar(p_nome text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.fin_dono();
  if exists (select 1 from public.fin_plano x where x.nome = p_nome and x.sistema) then raise exception 'categoria_do_sistema'; end if;
  if exists (select 1 from public.fin_lancamentos l where l.categoria = p_nome or l.categoria_auto = p_nome)
     or exists (select 1 from public.fin_rules r where r.categoria = p_nome)
     or exists (select 1 from public.fin_categorias_pluggy m where m.categoria = p_nome) then
    raise exception 'categoria_em_uso';
  end if;
  if exists (select 1
               from (select x.data -> 'contasFixas' as a from public.fin_snapshots x
                      where x.kind = 'manual' order by x.created_at desc, x.id desc limit 1) f
              cross join lateral private.fin_contas_cats(f.a, null) u
              where u.atual and u.categoria = p_nome) then
    raise exception 'categoria_de_conta';
  end if;
  delete from public.fin_plano x where x.nome = p_nome;
  return found;
end $$;

-- ---------- Renomear e juntar categorias ----------
-- Igual à de 20261107120000_categoria_icones, mais: renomear leva junto a categoria das contas de antes de uma edição
-- (antes), e juntar duas categorias que quitam contas fixas diferentes é recusado (juntar_contas).
create or replace function public.fin_categoria_salvar(p_antigo text, p_nome text, p_tipo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  velho public.fin_plano;
  destino public.fin_plano;
  t text;
  juntou boolean := false;
  contas jsonb;
  mes text := to_char(private.fin_hoje(), 'YYYY-MM');
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
      -- Juntar duas categorias que quitam contas fixas diferentes deixaria um débito para duas contas.
      select x.data -> 'contasFixas' into contas from public.fin_snapshots x where x.kind = 'manual' order by x.created_at desc, x.id desc limit 1;
      if exists (select 1 from private.fin_contas_cats(contas, mes) u1 join private.fin_contas_cats(contas, mes) u2 on u1.conta is distinct from u2.conta
                  where u1.categoria = velho.nome and u2.categoria = destino.nome) then
        raise exception 'juntar_contas';
      end if;
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
             select jsonb_agg(private.fin_conta_renomeia(e, velho.nome, v_nome) order by o)
               from jsonb_array_elements(s.data -> 'contasFixas') with ordinality as z(e, o)))
     where s.kind = 'manual' and jsonb_typeof(s.data -> 'contasFixas') = 'array'
       and exists (select 1 from jsonb_array_elements(s.data -> 'contasFixas') e
                    where e ->> 'txCat' = velho.nome
                       or (jsonb_typeof(e -> 'antes' -> 'l') = 'array'
                           and exists (select 1 from jsonb_array_elements(e -> 'antes' -> 'l') a where a ->> 'txCat' = velho.nome)));
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

-- Foto manual nova (B3, carro, financiamento...) herda a lista de contas fixas da foto mais nova: as contas criadas,
-- mudadas ou tiradas pelo app não voltam atrás. Para trocar a lista por SQL, use as funções acima ou um update
-- depois do insert.
create or replace function private.fin_snapshots_contas()
returns trigger
language plpgsql set search_path = '' as $$
declare
  atual jsonb;
  quando timestamptz;
begin
  -- Espera uma gravação do app em andamento (fin_conta_salvar, fin_conta_apagar) e lê a lista depois dela.
  perform pg_advisory_xact_lock(20261119);
  select x.data -> 'contasFixas', x.created_at into atual, quando
    from public.fin_snapshots x
   where x.kind = 'manual'
   order by x.created_at desc, x.id desc
   limit 1;
  if jsonb_typeof(atual) = 'array' and new.created_at >= quando then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{contasFixas}', atual);
  end if;
  return new;
end $$;

create or replace trigger fin_snapshots_contas
  before insert on public.fin_snapshots
  for each row when (new.kind = 'manual')
  execute function private.fin_snapshots_contas();
