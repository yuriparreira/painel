-- Painel: finanças pessoais vindas do Open Finance (Meu Pluggy).
-- Tabelas no schema public com prefixo fin_ (a API do Supabase já expõe o public).
-- Só estrutura. Nenhum dado real vive neste repositório: as linhas chegam pela função pluggy-sync,
-- que roda com a chave de serviço e grava aqui. Quem lê é o app, logado, e só o dono vê.

-- Dono único do painel. A linha é inserida depois do primeiro login (fora do repositório).
create table if not exists public.fin_owner (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.fin_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_owner o where o.user_id = auth.uid());
$$;

-- Uma conexão do Meu Pluggy (um banco). O id é o itemId da Pluggy.
create table if not exists public.fin_items (
  id text primary key,
  connector text,
  status text,
  execution_status text,
  consent_expires_at timestamptz,
  last_updated_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  raw jsonb
);

create table if not exists public.fin_accounts (
  id text primary key,
  item_id text not null references public.fin_items (id) on delete cascade,
  type text,              -- BANK ou CREDIT
  subtype text,           -- CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD
  name text,
  number text,
  balance numeric(14, 2),
  currency text,
  credit_limit numeric(14, 2),
  available_credit numeric(14, 2),
  close_date date,
  due_date date,
  updated_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists public.fin_transactions (
  id text primary key,
  account_id text not null references public.fin_accounts (id) on delete cascade,
  date date not null,
  description text,
  amount numeric(14, 2) not null,   -- negativo = saída, como no extrato
  type text,                         -- DEBIT ou CREDIT
  status text,                       -- PENDING ou POSTED
  category text,                     -- categoria da Pluggy
  categoria_auto text,               -- categoria do Painel pelas regras do banco (fin_rules)
  categoria text,                    -- escolha manual do dono; quando existe, vale esta
  installment text,                  -- "3/10" quando for parcela
  bill_id text,
  updated_at timestamptz not null default now(),
  raw jsonb
);
create index if not exists fin_transactions_account_date on public.fin_transactions (account_id, date desc);

create table if not exists public.fin_bills (
  id text primary key,
  account_id text not null references public.fin_accounts (id) on delete cascade,
  due_date date,
  total numeric(14, 2),
  minimum numeric(14, 2),
  updated_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists public.fin_investments (
  id text primary key,
  item_id text not null references public.fin_items (id) on delete cascade,
  type text,
  subtype text,
  name text,
  balance numeric(14, 2),
  quantity numeric,
  updated_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists public.fin_loans (
  id text primary key,
  item_id text not null references public.fin_items (id) on delete cascade,
  product text,
  contract_amount numeric(14, 2),
  outstanding numeric(14, 2),
  installments_total int,
  installments_paid int,
  due_date date,
  updated_at timestamptz not null default now(),
  raw jsonb
);

-- O que não vem do Open Finance (posição da B3, valores a receber, veículo, notas): um JSON por vez.
create table if not exists public.fin_snapshots (
  id bigint generated always as identity primary key,
  kind text not null default 'arquivo',
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists public.fin_sync_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  trigger text,            -- webhook, cron, manual
  item_id text,
  ok boolean,
  detail jsonb
);

-- RLS: anon não tem política, então não lê nada; o dono lê. Só a função de sincronização (service role) escreve.
alter table public.fin_owner enable row level security;
alter table public.fin_items enable row level security;
alter table public.fin_accounts enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_bills enable row level security;
alter table public.fin_investments enable row level security;
alter table public.fin_loans enable row level security;
alter table public.fin_snapshots enable row level security;
alter table public.fin_sync_log enable row level security;

create policy dono_le on public.fin_owner for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_items for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_accounts for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_transactions for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_bills for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_investments for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_loans for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_snapshots for select to authenticated using (public.fin_is_owner());
create policy dono_le on public.fin_sync_log for select to authenticated using (public.fin_is_owner());

-- O dono pode corrigir a categoria de um lançamento pelo app.
create policy dono_categoriza on public.fin_transactions for update to authenticated
  using (public.fin_is_owner()) with check (public.fin_is_owner());

-- Agendamento diário e chamadas HTTP a partir do banco (ver ../cron.example.sql).
create extension if not exists pg_net;
create extension if not exists pg_cron;
