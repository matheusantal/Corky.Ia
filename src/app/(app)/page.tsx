import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ConnectButton from "@/components/ConnectButton";
import AutoRefresh from "@/components/AutoRefresh";
import { BalanceChart, CategoryChart, MonthlyChart } from "@/components/Charts";
import { currentMonthRange, formatBRL, formatDate, formatDateTime, monthLabel } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

interface RecentTx {
  id: string; description: string; amount: number; type: string; is_transfer: boolean; transaction_date: string;
  accounts: { name: string; bank_connections: { institution_name: string | null } | null } | null;
  categories: { name: string } | null;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { from, to } = currentMonthRange();

  const { data: conns } = await supabase.from("bank_connections").select("id,status,institution_name,last_synced_at");
  if (!conns || conns.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/20 text-brand-light"><Landmark aria-hidden /></div>
        <h1 className="text-xl font-semibold">Conecte sua primeira conta</h1>
        <p className="mb-6 mt-2 text-sm text-ink-muted">Importamos saldos e movimentações automaticamente pelo Open Finance, sem você digitar suas senhas aqui.</p>
        <div className="flex justify-center"><ConnectButton /></div>
      </div>
    );
  }

  const [summary, byCat, series, history, accounts, recent] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: from, p_to: to }),
    supabase.rpc("expenses_by_category", { p_from: from, p_to: to }),
    supabase.rpc("monthly_series", { p_months: 6 }),
    supabase.rpc("balance_history", { p_days: 90 }),
    supabase.from("accounts").select("type,balance"),
    supabase.from("transactions")
      .select("id,description,amount,type,is_transfer,transaction_date,accounts(name,bank_connections(institution_name)),categories(name)")
      .order("transaction_date", { ascending: false }).order("occurred_at", { ascending: false }).limit(8),
  ]);

  const s = summary.data?.[0] ?? { income: 0, expense: 0, tx_count: 0 };
  const income = Number(s.income), expense = Number(s.expense);
  const bank = (accounts.data ?? []).filter((a) => a.type === "BANK").reduce((t, a) => t + Number(a.balance), 0);
  const credit = (accounts.data ?? []).filter((a) => a.type === "CREDIT").reduce((t, a) => t + Number(a.balance), 0);
  const lastSync = conns.map((c) => c.last_synced_at).filter(Boolean).sort().at(-1) as string | undefined;
  const importing = conns.some((c) => c.status === "pending" || c.status === "updating");
  const needsAction = conns.filter((c) => c.status === "needs_action" || c.status === "error");

  const catData = (byCat.data ?? []).map((r: { category_name: string; total: number }) => ({ name: r.category_name, value: Number(r.total) }));
  const monthly = (series.data ?? []).map((r: { month: string; income: number; expense: number }) => ({ month: monthLabel(r.month), Receitas: Number(r.income), Despesas: Number(r.expense) }));
  const balance = (history.data ?? []).map((r: { snapshot_date: string; total: number }) => ({ date: formatDate(r.snapshot_date).slice(0, 5), total: Number(r.total) }));
  const txs = (recent.data ?? []) as unknown as RecentTx[];

  return (
    <div className="space-y-5">
      <AutoRefresh active={importing} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="text-xs text-ink-muted">{importing ? "Importando dados…" : `Última sincronização: ${formatDateTime(lastSync)}`}</p>
      </div>

      {needsAction.length > 0 && (
        <div role="alert" className="rounded-card border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
          {needsAction.map((c) => c.institution_name ?? "Uma conta").join(", ")} precisa da sua atenção. <Link href="/accounts" className="underline">Ver contas</Link>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs text-ink-muted">Saldo atual das contas</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatBRL(bank)}</p>
          {credit !== 0 && <p className="mt-1 text-xs text-ink-muted">Cartões (valor da fatura): {formatBRL(credit)} — fora do saldo acima</p>}
        </div>
        <div className="card">
          <p className="text-xs text-ink-muted">Resultado do mês (receitas − despesas)</p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${income - expense >= 0 ? "text-income" : "text-expense"}`}>{formatBRL(income - expense)}</p>
          <p className="mt-1 text-xs text-ink-muted">{Number(s.tx_count)} transações no mês</p>
        </div>
        <div className="card"><p className="text-xs text-ink-muted">Receitas do mês</p><p className="mt-1 text-xl font-semibold tabular-nums text-income">{formatBRL(income)}</p></div>
        <div className="card"><p className="text-xs text-ink-muted">Despesas do mês</p><p className="mt-1 text-xl font-semibold tabular-nums text-expense">{formatBRL(expense)}</p></div>
      </section>
      <p className="px-1 text-xs text-ink-muted">Transferências entre suas contas e pagamentos de fatura não entram em receitas nem despesas.</p>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-medium">Despesas por categoria</h2>
          {catData.length ? <CategoryChart data={catData} /> : <p className="text-sm text-ink-muted">Sem despesas neste mês.</p>}
        </div>
        <div className="card">
          <h2 className="mb-4 text-sm font-medium">Receitas × despesas (6 meses)</h2>
          <MonthlyChart data={monthly} />
        </div>
      </section>

      <section className="card">
        <h2 className="mb-4 text-sm font-medium">Evolução do saldo</h2>
        {balance.length >= 2 ? <BalanceChart data={balance} /> : (
          <p className="text-sm text-ink-muted">O histórico do saldo é registrado a cada sincronização. O gráfico aparece a partir do segundo dia de dados.</p>
        )}
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Movimentações recentes</h2>
          <Link href="/transactions" className="text-xs text-brand-light">Ver todas</Link>
        </div>
        {txs.length === 0 ? <p className="text-sm text-ink-muted">Nenhuma movimentação importada ainda.</p> : (
          <ul>
            {txs.map((t) => {
              const Icon = t.is_transfer ? ArrowLeftRight : t.type === "income" ? ArrowDownLeft : ArrowUpRight;
              const tone = t.is_transfer ? "text-ink-muted bg-white/5" : t.type === "income" ? "text-income bg-income/10" : "text-expense bg-expense/10";
              return (
                <li key={t.id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={16} aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.description}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {t.accounts?.bank_connections?.institution_name ?? "—"} · {t.accounts?.name} · {formatDate(t.transaction_date)} · {t.categories?.name ?? "Sem categoria"}
                    </span>
                  </span>
                  <span className={`text-sm font-medium tabular-nums ${t.is_transfer ? "text-ink-muted" : t.type === "income" ? "text-income" : "text-expense"}`}>
                    {Number(t.amount) > 0 ? "+" : ""}{formatBRL(Number(t.amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
