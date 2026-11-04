-- Saúde: plano de treino, fichas, plano alimentar, diário, medidas, exames e histórico, vindos do Notion (e, depois,
-- do próprio app e do Apple Health). Só a estrutura fica aqui: os dados são gravados direto no banco.
-- Mesma regra das finanças: com RLS, só a conta dona lê (private.fin_is_owner()).

create table if not exists public.saude_perfil (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,  -- metas e plano periodizado (blocos, semana, cardio, regras)
  atualizado_em timestamptz not null default now()
);

create table if not exists public.saude_fichas (
  id text primary key,                       -- id da página no Notion
  treino text not null,                      -- A, B, C, Cardio, Descanso
  bloco smallint,                            -- 1 a 4; null = vale para todos
  titulo text not null,
  semanas text,
  resumo text,
  orientacao text,                           -- séries por semana, descanso, aquecimento
  exercicios jsonb not null default '[]'::jsonb,  -- [{nome, prescricao, carga}]
  cardapio jsonb not null default '[]'::jsonb,    -- [{hora, refeicao, itens}]
  observacoes jsonb not null default '[]'::jsonb, -- textos soltos da ficha
  ordem numeric
);

create table if not exists public.saude_refeicoes (
  id text primary key,
  versao text,
  ativo boolean not null default false,
  ordem numeric,
  refeicao text not null,
  horario text,
  alimentos text,
  kcal numeric,
  proteina numeric,
  carbo numeric,
  gordura numeric,
  tipos text[] not null default '{}'         -- Treino, Descanso, Refeed
);

create table if not exists public.saude_diario (
  data date primary key,
  peso numeric,
  sono numeric,
  treinou boolean,
  proteina_ok boolean,
  agua_ok boolean,
  creatina boolean,
  passos integer,
  energia smallint,
  fc_repouso numeric,
  hrv numeric,
  calorias numeric,
  proteina_g numeric,
  agua_l numeric,
  tipo_dia text,
  notas text,
  fonte text,
  notion_id text unique,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.saude_treinos (
  id text primary key,
  data date not null,
  titulo text,
  modalidade text,
  programa text,
  tipo_cardio text,
  duracao_min numeric,
  rpe numeric,
  sensacao smallint,
  fc_media numeric,
  kcal numeric,
  distancia_km numeric,
  dor boolean,
  notas text,
  fonte text
);

create table if not exists public.saude_medidas (
  id text primary key,
  data date not null,
  fonte text,
  peso numeric,
  gordura numeric,                           -- em %
  altura numeric,
  cintura numeric,
  abdomen numeric,
  peito numeric,
  ombros numeric,
  pescoco numeric,
  quadril numeric,
  biceps_d numeric,
  biceps_e numeric,
  antebraco_d numeric,
  antebraco_e numeric,
  coxa_d numeric,
  coxa_e numeric,
  panturrilha_d numeric,
  panturrilha_e numeric,
  notas text
);

create table if not exists public.saude_exames (
  id text primary key,
  data date not null,
  marcador text not null,
  categoria text,
  laboratorio text,
  resultado numeric,
  resultado_texto text,
  unidade text,
  ref_min numeric,
  ref_max numeric,
  notas text
);

create table if not exists public.saude_historico (
  mes date primary key,                      -- primeiro dia do mês
  musculacao numeric,
  cardio numeric,
  outros numeric,
  minutos numeric,
  kcal_ativas numeric,
  passos_dia numeric,
  fc_repouso numeric
);

create index if not exists saude_treinos_data on public.saude_treinos (data);
create index if not exists saude_medidas_data on public.saude_medidas (data);
create index if not exists saude_exames_data on public.saude_exames (data);

alter table public.saude_perfil enable row level security;
alter table public.saude_fichas enable row level security;
alter table public.saude_refeicoes enable row level security;
alter table public.saude_diario enable row level security;
alter table public.saude_treinos enable row level security;
alter table public.saude_medidas enable row level security;
alter table public.saude_exames enable row level security;
alter table public.saude_historico enable row level security;

create policy dono_le on public.saude_perfil for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_fichas for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_refeicoes for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_diario for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_treinos for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_medidas for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_exames for select to authenticated using (private.fin_is_owner());
create policy dono_le on public.saude_historico for select to authenticated using (private.fin_is_owner());
