-- =====================================================================
-- Teste de isolamento RLS — rode no SQL Editor do Supabase.
-- Tudo roda dentro de uma transação que termina em ROLLBACK (nada é gravado).
-- Se qualquer verificação falhar, o script aborta com "FALHOU: ...".
-- =====================================================================
begin;

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  c1 uuid; c2 uuid; a1 uuid; a2 uuid; t1 uuid; t2 uuid; cat2 uuid;
  n integer;
begin
  -- dados de dois usuários (como superusuário/service role)
  insert into auth.users (id, email) values (u1, 'rls1@example.com'), (u2, 'rls2@example.com');
  insert into public.bank_connections (user_id, item_id) values (u1, 'item-1') returning id into c1;
  insert into public.bank_connections (user_id, item_id) values (u2, 'item-2') returning id into c2;
  insert into public.accounts (user_id, connection_id, external_account_id, name, type, balance)
    values (u1, c1, 'acc-1', 'Conta 1', 'BANK', 100) returning id into a1;
  insert into public.accounts (user_id, connection_id, external_account_id, name, type, balance)
    values (u2, c2, 'acc-2', 'Conta 2', 'BANK', 200) returning id into a2;
  insert into public.transactions (user_id, account_id, external_transaction_id, description, amount, type, transaction_date, occurred_at)
    values (u1, a1, 'tx-1', 'Compra U1', -10, 'expense', current_date, now()) returning id into t1;
  insert into public.transactions (user_id, account_id, external_transaction_id, description, amount, type, transaction_date, occurred_at)
    values (u2, a2, 'tx-2', 'Compra U2', -20, 'expense', current_date, now()) returning id into t2;
  insert into public.categories (user_id, name, type) values (u2, 'Categoria secreta U2', 'expense') returning id into cat2;
  insert into public.sync_logs (user_id, connection_id) values (u2, c2);

  -- passa a agir como o usuário 1
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) só enxerga os próprios registros
  select count(*) into n from public.bank_connections;
  if n <> 1 then raise exception 'FALHOU: bank_connections visíveis = %', n; end if;
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'FALHOU: accounts visíveis = %', n; end if;
  select count(*) into n from public.transactions;
  if n <> 1 then raise exception 'FALHOU: transactions visíveis = %', n; end if;
  select count(*) into n from public.sync_logs;
  if n <> 0 then raise exception 'FALHOU: sync_logs de outro usuário visíveis = %', n; end if;
  select count(*) into n from public.categories where user_id = u2;
  if n <> 0 then raise exception 'FALHOU: categoria de outro usuário visível'; end if;
  select count(*) into n from public.categories where user_id is null;
  if n < 11 then raise exception 'FALHOU: categorias padrão invisíveis'; end if;

  -- 2) não consegue alterar transação de outro usuário (0 linhas afetadas)
  update public.transactions set is_transfer = true where id = t2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: alterou transação alheia'; end if;

  -- 3) não consegue alterar colunas sensíveis da própria transação
  begin
    update public.transactions set amount = 999999 where id = t1;
    raise exception 'FALHOU: alterou amount pelo cliente';
  exception when insufficient_privilege then null; end;

  -- 4) não consegue gravar dados bancários pelo cliente
  begin
    insert into public.accounts (user_id, connection_id, external_account_id, name, type)
      values (u1, c1, 'forjada', 'X', 'BANK');
    raise exception 'FALHOU: inseriu account pelo cliente';
  exception when insufficient_privilege then null; end;

  -- 5) não consegue usar categoria personalizada de outro usuário
  begin
    update public.transactions set category_id = cat2 where id = t1;
    raise exception 'FALHOU: usou categoria alheia';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- 6) cria categoria própria, mas não em nome de outro usuário
  insert into public.categories (user_id, name, type) values (u1, 'Minha categoria', 'expense');
  begin
    insert into public.categories (user_id, name, type) values (u2, 'Forjada', 'expense');
    raise exception 'FALHOU: criou categoria em nome de outro usuário';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- 7) funções do dashboard respeitam RLS (só enxergam 1 transação)
  select tx_count into n from public.dashboard_summary(current_date - 1, current_date);
  if n <> 1 then raise exception 'FALHOU: dashboard_summary viu % transações', n; end if;

  -- 8) usuário anônimo não vê nada
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.transactions limit 1;
    raise exception 'FALHOU: anon conseguiu ler transactions';
  exception when insufficient_privilege then null; end;
  reset role;

  raise notice 'OK: todas as verificações de RLS passaram.';
end $$;

rollback;
