"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";

export interface TxView {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  is_transfer: boolean;
  status: string;
  transaction_date: string;
  category_id: string | null;
  category_source: string;
  pluggy_category: string | null;
  institution: string;
  account: string;
  category: string;
}

export default function TransactionRow({ tx, categories }: { tx: TxView; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: { category_id?: string | null; is_transfer?: boolean }) {
    setSaving(true); setError(null);
    // Cliente do navegador: quem garante o acesso é a RLS (e o grant só permite estas 2 colunas).
    const { error } = await createClient().from("transactions").update(patch).eq("id", tx.id);
    setSaving(false);
    if (error) setError("Não foi possível salvar a alteração.");
    else router.refresh();
  }

  const Icon = tx.is_transfer ? ArrowLeftRight : tx.type === "income" ? ArrowDownLeft : ArrowUpRight;
  const tone = tx.is_transfer ? "text-ink-muted bg-white/5" : tx.type === "income" ? "text-income bg-income/10" : "text-expense bg-expense/10";

  return (
    <li className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={16} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{tx.description}</span>
          <span className="block truncate text-xs text-ink-muted">
            {formatDate(tx.transaction_date)} · {tx.category}{tx.status === "PENDING" ? " · pendente" : ""}
          </span>
        </span>
        <span className={`text-sm font-medium tabular-nums ${tx.is_transfer ? "text-ink-muted" : tx.type === "income" ? "text-income" : "text-expense"}`}>
          {tx.amount > 0 ? "+" : ""}{formatBRL(tx.amount)}
        </span>
        <ChevronDown size={16} className={`text-ink-muted transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="mb-3 space-y-3 rounded-xl bg-bg p-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-ink-muted">Instituição</dt><dd>{tx.institution}</dd>
            <dt className="text-ink-muted">Conta</dt><dd>{tx.account}</dd>
            <dt className="text-ink-muted">Data</dt><dd>{formatDate(tx.transaction_date)}</dd>
            <dt className="text-ink-muted">Situação</dt><dd>{tx.status === "PENDING" ? "Pendente" : "Efetivada"}</dd>
            {tx.pluggy_category && (<><dt className="text-ink-muted">Categoria da Pluggy</dt><dd>{tx.pluggy_category}</dd></>)}
          </dl>
          <div>
            <label className="label" htmlFor={`cat-${tx.id}`}>Categoria {tx.category_source === "user" && "(definida por você)"}</label>
            <select id={`cat-${tx.id}`} className="input" disabled={saving} value={tx.category_id ?? ""} onChange={(e) => update({ category_id: e.target.value || null })}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" disabled={saving} checked={tx.is_transfer} onChange={(e) => update({ is_transfer: e.target.checked })} />
            Transferência entre minhas contas / pagamento de fatura (não conta como receita nem despesa)
          </label>
          {error && <p role="alert" className="text-xs text-expense">{error}</p>}
        </div>
      )}
    </li>
  );
}
