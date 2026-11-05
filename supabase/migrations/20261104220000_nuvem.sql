-- Os registros do app na nuvem: check-ins, treinos, tarefas, gastos, contas marcadas, XP e conquistas, que antes
-- ficavam só no aparelho. É um documento só, o mesmo em todos os aparelhos da conta dona (celular e computador).
-- Cada valor do documento leva quando e em qual aparelho mudou; quem grava manda a versão em que se baseou e, se
-- outra gravação chegou antes, recebe a versão da nuvem, junta as duas no aparelho e grava de novo.
-- As versões anteriores ficam guardadas (uma por hora nos últimos 3 dias e uma por dia até 60 dias), para
-- recuperar o que uma junção errada tenha perdido.

create table if not exists public.painel_estado (
  id smallint primary key default 1 check (id = 1),
  doc jsonb not null,
  rev bigint not null,
  aparelho text,
  em timestamptz not null default now()
);

create table if not exists private.painel_estado_hist (
  id bigint generated always as identity primary key,
  rev bigint not null,
  doc jsonb not null,
  aparelho text,
  em timestamptz not null
);
create index if not exists painel_estado_hist_em on private.painel_estado_hist (em);

alter table public.painel_estado enable row level security;
alter table private.painel_estado_hist enable row level security;
-- Só a conta dona lê; gravar, só pela função abaixo.
create policy dono_le on public.painel_estado for select to authenticated using (private.fin_is_owner());

-- Com p_rev igual à versão da nuvem, devolve só {rev, mesmo: true}: conferir se algo mudou custa pouco.
create or replace function public.estado_ler(p_rev bigint default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  if not private.fin_is_owner() then
    raise exception 'nao_e_dono' using hint = 'fin_reivindicar';
  end if;
  select e.rev, e.doc, e.em into r from public.painel_estado e where e.id = 1;
  if not found then
    return jsonb_build_object('rev', 0, 'doc', null, 'em', null);
  end if;
  if p_rev is not null and p_rev = r.rev then
    return jsonb_build_object('rev', r.rev, 'mesmo', true, 'em', r.em);
  end if;
  return jsonb_build_object('rev', r.rev, 'doc', r.doc, 'em', r.em);
end
$$;

-- Grava o documento se a nuvem ainda está na versão p_base. Senão devolve a versão atual (ok = false), sem gravar.
create or replace function public.estado_salvar(p_doc jsonb, p_base bigint, p_aparelho text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual record;
  ultimo timestamptz;
  agora timestamptz := now();
begin
  if not private.fin_is_owner() then
    raise exception 'nao_e_dono' using hint = 'fin_reivindicar';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'doc_invalido';
  end if;
  if octet_length(p_doc::text) > 5000000 then
    raise exception 'doc_grande';
  end if;

  select e.rev, e.doc, e.aparelho, e.em into atual from public.painel_estado e where e.id = 1 for update;
  if not found then
    -- Primeira gravação: vale qualquer base (o aparelho pode ter gravado antes numa nuvem que foi zerada).
    insert into public.painel_estado (id, doc, rev, aparelho, em) values (1, p_doc, 1, left(p_aparelho, 60), agora)
      on conflict (id) do nothing;
    if not found then
      select e.rev, e.doc, e.em into atual from public.painel_estado e where e.id = 1;
      return jsonb_build_object('ok', false, 'rev', atual.rev, 'doc', atual.doc, 'em', atual.em);
    end if;
    return jsonb_build_object('ok', true, 'rev', 1, 'em', agora);
  end if;

  if p_base is null or atual.rev <> p_base then
    return jsonb_build_object('ok', false, 'rev', atual.rev, 'doc', atual.doc, 'em', atual.em);
  end if;

  -- Guarda a versão que sai: no máximo uma por hora.
  select max(h.em) into ultimo from private.painel_estado_hist h;
  if ultimo is null or ultimo < agora - interval '1 hour' then
    insert into private.painel_estado_hist (rev, doc, aparelho, em) values (atual.rev, atual.doc, atual.aparelho, atual.em);
    delete from private.painel_estado_hist h where h.em < agora - interval '60 days';
    -- Depois de 3 dias, fica só a última de cada dia.
    delete from private.painel_estado_hist h
      where h.em < agora - interval '3 days'
        and exists (select 1 from private.painel_estado_hist h2
                    where (h2.em at time zone 'America/Sao_Paulo')::date = (h.em at time zone 'America/Sao_Paulo')::date
                      and h2.em > h.em);
  end if;

  update public.painel_estado set doc = p_doc, rev = atual.rev + 1, aparelho = left(p_aparelho, 60), em = agora where id = 1;
  return jsonb_build_object('ok', true, 'rev', atual.rev + 1, 'em', agora);
end
$$;
