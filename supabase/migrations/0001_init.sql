-- =====================================================================
-- Finanças Pluggy — esquema inicial
-- Aplicar com: supabase db push   (ou colar no SQL Editor do Supabase)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- utilitário: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- categories ----------
-- user_id NULL = categoria padrão (visível a todos, somente leitura)
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  type        text not null default 'expense' check (type in ('expense', 'income')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index categories_unique_name
  on public.categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index categories_user_idx on public.categories (user_id);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

insert into public.categories (user_id, name, type) values
  (null, 'Alimentação', 'expense'),
  (null, 'Transporte', 'expense'),
  (null, 'Moradia', 'expense'),
  (null, 'Compras', 'expense'),
  (null, 'Lazer', 'expense'),
  (null, 'Saúde', 'expense'),
  (null, 'Educação', 'expense'),
  (null, 'Assinaturas', 'expense'),
  (null, 'Transferências', 'expense'),
  (null, 'Salário e outras receitas', 'income'),
  (null, 'Outros', 'expense');

-- ---------- bank_connections ----------
create table public.bank_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  provider          text not null default 'pluggy',
  item_id           text not null,
  connector_id      integer,
  institution_name  text,
  -- status interno do app
  status            text not null default 'pending'
                    check (status in ('pending','updating','connected','needs_action','error','disconnected')),
  -- status bruto da Pluggy (UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT)
  provider_status   text,
  execution_status  text,
  status_message    text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, item_id)
);
create index bank_connections_user_idx on public.bank_connections (user_id);
create trigger bank_connections_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

-- ---------- accounts ----------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  connection_id         uuid not null references public.bank_connections(id) on delete cascade,
  external_account_id   text not null,
  name                  text not null,
  type                  text not null,            -- BANK | CREDIT (valores da Pluggy)
  subtype               text,                     -- CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD ...
  number                text,                     -- mascarado pela instituição
  currency_code         text not null default 'BRL',
  balance               numeric(16,2) not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (connection_id, external_account_id)
);
create index accounts_user_idx on public.accounts (user_id);
create index accounts_connection_idx on public.accounts (connection_id);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------- snapshots de saldo (histórico para o gráfico de evolução) ----------
create table public.account_balance_snapshots (
  account_id     uuid not null references public.accounts(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  snapshot_date  date not null,
  balance        numeric(16,2) not null,
  primary key (account_id, snapshot_date)
);
create index balance_snapshots_user_date_idx on public.account_balance_snapshots (user_id, snapshot_date);

-- ---------- transactions ----------
create table public.transactions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  account_id                uuid not null references public.accounts(id) on delete cascade,
  external_transaction_id   text not null,
  provider_id               text,                      -- id da instituição (só Open Finance "Regulado")
  description               text not null,
  amount                    numeric(16,2) not null,    -- com sinal: negativo = saída
  type                      text not null check (type in ('income','expense')),
  category_id               uuid references public.categories(id) on delete set null,
  category_source           text not null default 'auto' check (category_source in ('auto','user')),
  pluggy_category           text,
  is_transfer               boolean not null default false,
  transfer_source           text not null default 'auto' check (transfer_source in ('auto','user')),
  transaction_date          date not null,             -- data de calendário informada pela instituição
  occurred_at               timestamptz not null,      -- instante bruto retornado pela Pluggy
  status                    text not null default 'POSTED',
  currency_code             text not null default 'BRL',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (account_id, external_transaction_id)
);
create index transactions_user_date_idx    on public.transactions (user_id, transaction_date desc);
create index transactions_account_date_idx on public.transactions (account_id, transaction_date desc);
create index transactions_category_idx     on public.transactions (category_id);
create index transactions_user_flags_idx   on public.transactions (user_id, is_transfer, type);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Quando o usuário altera categoria/transferência, marca a origem como 'user'
-- (a sincronização nunca sobrescreve escolhas manuais) e valida a posse da categoria.
create or replace function public.transactions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null
     and new.category_id is distinct from old.category_id then
    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id and (c.user_id is null or c.user_id = new.user_id)
    ) then
      raise exception 'Categoria inválida para este usuário';
    end if;
  end if;
  if auth.uid() is not null then  -- chamada vinda do cliente (JWT), não do service role
    if new.category_id is distinct from old.category_id then
      new.category_source := 'user';
    end if;
    if new.is_transfer is distinct from old.is_transfer then
      new.transfer_source := 'user';
    end if;
  end if;
  return new;
end $$;
create trigger transactions_guard_trg before update on public.transactions
  for each row execute function public.transactions_guard();

-- ---------- sync_logs ----------
create table public.sync_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  connection_id  uuid not null references public.bank_connections(id) on delete cascade,
  trigger        text not null default 'manual',   -- connect | manual | webhook | cron
  status         text not null default 'running' check (status in ('running','success','partial','failed','skipped')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  accounts_count integer,
  transactions_count integer,
  error_message  text
);
create index sync_logs_conn_idx on public.sync_logs (connection_id, started_at desc);
create index sync_logs_user_idx on public.sync_logs (user_id);

-- ---------- webhook_events ----------
create table public.webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade,
  provider_event_id  text,
  event_type         text not null,
  connection_id      uuid references public.bank_connections(id) on delete set null,
  status             text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);
create unique index webhook_events_provider_event_uidx
  on public.webhook_events (provider_event_id) where provider_event_id is not null;
create index webhook_events_conn_idx on public.webhook_events (connection_id);
create index webhook_events_user_idx on public.webhook_events (user_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles                 enable row level security;
alter table public.categories               enable row level security;
alter table public.bank_connections         enable row level security;
alter table public.accounts                 enable row level security;
alter table public.account_balance_snapshots enable row level security;
alter table public.transactions             enable row level security;
alter table public.sync_logs                enable row level security;
alter table public.webhook_events           enable row level security;

-- Privilégios mínimos: remove os padrões do Supabase e concede só o necessário.
revoke all on public.profiles, public.categories, public.bank_connections, public.accounts,
              public.account_balance_snapshots, public.transactions, public.sync_logs,
              public.webhook_events from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select on public.bank_connections, public.accounts, public.account_balance_snapshots,
                public.sync_logs, public.webhook_events to authenticated;
grant select on public.transactions to authenticated;
-- o cliente só pode alterar estas colunas de uma transação:
grant update (category_id, is_transfer) on public.transactions to authenticated;

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- categories: padrão (user_id null) legível por todos; personalizadas só do dono
create policy categories_select on public.categories for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy categories_insert_own on public.categories for insert to authenticated
  with check (user_id = auth.uid());
create policy categories_update_own on public.categories for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete_own on public.categories for delete to authenticated
  using (user_id = auth.uid());

-- tabelas alimentadas apenas pelo backend (service role): usuário só lê o que é seu
create policy bank_connections_select_own on public.bank_connections for select to authenticated
  using (user_id = auth.uid());
create policy accounts_select_own on public.accounts for select to authenticated
  using (user_id = auth.uid());
create policy snapshots_select_own on public.account_balance_snapshots for select to authenticated
  using (user_id = auth.uid());
create policy sync_logs_select_own on public.sync_logs for select to authenticated
  using (user_id = auth.uid());
create policy webhook_events_select_own on public.webhook_events for select to authenticated
  using (user_id = auth.uid());

-- transactions: leitura própria + edição de categoria/transferência
create policy transactions_select_own on public.transactions for select to authenticated
  using (user_id = auth.uid());
create policy transactions_update_own on public.transactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Funções para o dashboard (SECURITY INVOKER => RLS continua valendo)
-- Transferências próprias (is_transfer) ficam fora de receitas/despesas.
-- =====================================================================
create or replace function public.dashboard_summary(p_from date, p_to date)
returns table (income numeric, expense numeric, tx_count bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(sum(amount) filter (where type = 'income'  and not is_transfer), 0)::numeric,
    coalesce(-sum(amount) filter (where type = 'expense' and not is_transfer), 0)::numeric,
    count(*)
  from public.transactions
  where transaction_date between p_from and p_to
$$;

create or replace function public.expenses_by_category(p_from date, p_to date)
returns table (category_id uuid, category_name text, total numeric)
language sql stable security invoker set search_path = public as $$
  select t.category_id,
         coalesce(c.name, 'Outros') as category_name,
         (-sum(t.amount))::numeric as total
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.type = 'expense' and not t.is_transfer
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name
  order by total desc
$$;

create or replace function public.monthly_series(p_months integer default 6)
returns table (month date, income numeric, expense numeric)
language sql stable security invoker set search_path = public as $$
  with months as (
    select (date_trunc('month', current_date) - (n || ' month')::interval)::date as month
    from generate_series(0, greatest(p_months, 1) - 1) n
  )
  select m.month,
         coalesce(sum(t.amount) filter (where t.type = 'income'  and not t.is_transfer), 0)::numeric,
         coalesce(-sum(t.amount) filter (where t.type = 'expense' and not t.is_transfer), 0)::numeric
  from months m
  left join public.transactions t
    on t.transaction_date >= m.month
   and t.transaction_date <  (m.month + interval '1 month')::date
  group by m.month
  order by m.month
$$;

-- Evolução do saldo total das contas bancárias (BANK), a partir dos snapshots
create or replace function public.balance_history(p_days integer default 90)
returns table (snapshot_date date, total numeric)
language sql stable security invoker set search_path = public as $$
  select s.snapshot_date, sum(s.balance)::numeric
  from public.account_balance_snapshots s
  join public.accounts a on a.id = s.account_id
  where a.type = 'BANK' and s.snapshot_date >= current_date - p_days
  group by s.snapshot_date
  order by s.snapshot_date
$$;

revoke all on function public.dashboard_summary(date, date), public.expenses_by_category(date, date),
  public.monthly_series(integer), public.balance_history(integer) from public, anon;
grant execute on function public.dashboard_summary(date, date), public.expenses_by_category(date, date),
  public.monthly_series(integer), public.balance_history(integer) to authenticated;
