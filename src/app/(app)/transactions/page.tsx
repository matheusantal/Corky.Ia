import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TransactionRow, { type TxView } from "@/components/TransactionRow";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SP = Record<string, string | undefined>;

interface Row {
  id: string; description: string; amount: number; type: "income" | "expense"; is_transfer: boolean; status: string;
  transaction_date: string; category_id: string | null; category_source: string; pluggy_category: string | null;
  accounts: { name: string; bank_connections: { institution_name: string | null } | null } | null;
  categories: { name: string } | null;
}

export default async function TransactionsPage({ searchParams }: { searchParams: SP }) {
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const from = DATE_RE.test(searchParams.from ?? "") ? searchParams.from! : "";
  const to = DATE_RE.test(searchParams.to ?? "") ? searchParams.to! : "";
  const category = searchParams.category ?? "";
  const account = UUID_RE.test(searchParams.account ?? "") ? searchParams.account! : "";
  const type = ["income", "expense", "transfer"].includes(searchParams.type ?? "") ? searchParams.type! : "";
  const sort = searchParams.sort === "amount" ? "amount" : "transaction_date";
  const asc = searchParams.dir === "asc";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const [{ data: cats }, { data: accs }] = await Promise.all([
    supabase.from("categories").select("id,name,user_id").order("name"),
    supabase.from("accounts").select("id,name,bank_connections(institution_name)").order("name"),
  ]);

  let query = supabase
    .from("transactions")
    .select("id,description,amount,type,is_transfer,status,transaction_date,category_id,category_source,pluggy_category,accounts(name,bank_connections(institution_name)),categories(name)", { count: "exact" });

  if (q) query = query.ilike("description", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (from) query = query.gte("transaction_date", from);
  if (to) query = query.lte("transaction_date", to);
  if (category === "none") query = query.is("category_id", null);
  else if (UUID_RE.test(category)) query = query.eq("category_id", category);
  if (account) query = query.eq("account_id", account);
  if (type === "transfer") query = query.eq("is_transfer", true);
  else if (type) query = query.eq("type", type).eq("is_transfer", false);

  query = query.order(sort, { ascending: asc });
  if (sort === "amount") query = query.order("transaction_date", { ascending: false });
  else query = query.order("occurred_at", { ascending: asc });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const rows = ((data ?? []) as unknown as Row[]).map<TxView>((r) => ({
    id: r.id, description: r.description, amount: Number(r.amount), type: r.type, is_transfer: r.is_transfer, status: r.status,
    transaction_date: r.transaction_date, category_id: r.category_id, category_source: r.category_source, pluggy_category: r.pluggy_category,
    institution: r.accounts?.bank_connections?.institution_name ?? "—", account: r.accounts?.name ?? "—",
    category: r.categories?.name ?? "Sem categoria",
  }));
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, from, to, category, account, type, sort, dir: asc ? "asc" : "desc" })) if (v) u.set(k, v);
    u.set("page", String(p));
    return `/transactions?${u.toString()}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Transações</h1>

      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2"><label className="label" htmlFor="q">Buscar descrição</label><input id="q" name="q" defaultValue={q} className="input" placeholder="Ex.: mercado" /></div>
        <div><label className="label" htmlFor="from">De</label><input id="from" type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="to">Até</label><input id="to" type="date" name="to" defaultValue={to} className="input" /></div>
        <div><label className="label" htmlFor="category">Categoria</label>
          <select id="category" name="category" defaultValue={category} className="input">
            <option value="">Todas</option><option value="none">Sem categoria</option>
            {(cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="account">Conta</label>
          <select id="account" name="account" defaultValue={account} className="input">
            <option value="">Todas</option>
            {(accs ?? []).map((a) => {
              const inst = (a as unknown as { bank_connections: { institution_name: string | null } | null }).bank_connections?.institution_name;
              return <option key={a.id} value={a.id}>{inst ? `${inst} · ` : ""}{a.name}</option>;
            })}
          </select></div>
        <div><label className="label" htmlFor="type">Tipo</label>
          <select id="type" name="type" defaultValue={type} className="input">
            <option value="">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option><option value="transfer">Transferências</option>
          </select></div>
        <div><label className="label" htmlFor="sort">Ordenar por</label>
          <div className="flex gap-2">
            <select id="sort" name="sort" defaultValue={sort} className="input"><option value="transaction_date">Data</option><option value="amount">Valor</option></select>
            <select name="dir" defaultValue={asc ? "asc" : "desc"} aria-label="Sentido" className="input"><option value="desc">↓</option><option value="asc">↑</option></select>
          </div></div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn-primary">Filtrar</button>
          <Link href="/transactions" className="btn-ghost">Limpar</Link>
        </div>
      </form>

      <section className="card">
        {error ? <p role="alert" className="text-sm text-expense">Não foi possível carregar as transações.</p>
          : rows.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">Nenhuma transação encontrada.</p>
          : <ul>{rows.map((r) => <TransactionRow key={r.id} tx={r} categories={(cats ?? []).map((c) => ({ id: c.id, name: c.name }))} />)}</ul>}
      </section>

      <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
        {page > 1 ? <Link className="btn-ghost" href={qs(page - 1)}>← Anterior</Link> : <span />}
        <span className="text-ink-muted">Página {page} de {pages} · {total} transações</span>
        {page < pages ? <Link className="btn-ghost" href={qs(page + 1)}>Próxima →</Link> : <span />}
      </nav>
    </div>
  );
}
