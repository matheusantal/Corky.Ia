// Valida migration + políticas RLS num Postgres em WebAssembly (PGlite), sem precisar do Supabase.
// Uso: npm run test:db   — o "controle" deve PASSAR e as 3 sabotagens devem FALHAR (prova que o teste detecta vazamentos).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
async function boot(patch) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::json ->> 'sub','')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  let mig = fs.readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url),"utf8").replace("create extension if not exists pgcrypto;","");
  mig = patch(mig);
  await db.exec(mig);
  try { await db.exec(fs.readFileSync(new URL("../supabase/tests/rls.sql", import.meta.url),"utf8")); return "PASSOU"; }
  catch (e) { return "FALHOU -> " + e.message; }
}
console.log("controle (sem sabotagem):", await boot(s => s));
console.log("sabotagem 1 (select de transactions aberto):", await boot(s => s.replace("create policy transactions_select_own on public.transactions for select to authenticated\n  using (user_id = auth.uid());","create policy transactions_select_own on public.transactions for select to authenticated using (true);")));
console.log("sabotagem 2 (libera update de amount):", await boot(s => s.replace("grant update (category_id, is_transfer) on public.transactions to authenticated;","grant update on public.transactions to authenticated;")));
console.log("sabotagem 3 (RLS desligada em accounts):", await boot(s => s.replace("alter table public.accounts                 enable row level security;","")));
