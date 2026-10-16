"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Cat { id: string; name: string; type: string; user_id: string | null }

export default function CategoriesManager({ categories, userId }: { categories: Cat[]; userId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  const defaults = categories.filter((c) => c.user_id === null);
  const custom = categories.filter((c) => c.user_id !== null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.from("categories").insert({ name: name.trim(), type, user_id: userId });
    setBusy(false);
    if (error) setError(error.code === "23505" ? "Você já tem uma categoria com esse nome." : "Não foi possível criar a categoria.");
    else { setName(""); router.refresh(); }
  }

  async function rename(c: Cat, value: string) {
    const v = value.trim();
    if (!v || v === c.name) return;
    const { error } = await supabase.from("categories").update({ name: v }).eq("id", c.id);
    setError(error ? (error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível renomear.") : null);
    router.refresh();
  }

  async function remove(c: Cat) {
    if (!confirm(`Excluir "${c.name}"? As transações dela ficarão sem categoria.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    setError(error ? "Não foi possível excluir." : null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div><label className="label" htmlFor="cat-name">Nova categoria</label><input id="cat-name" required maxLength={60} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pets" /></div>
        <div><label className="label" htmlFor="cat-type">Tipo</label>
          <select id="cat-type" className="input" value={type} onChange={(e) => setType(e.target.value as "expense" | "income")}><option value="expense">Despesa</option><option value="income">Receita</option></select></div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>Adicionar</button></div>
      </form>
      {error && <p role="alert" className="text-sm text-expense">{error}</p>}

      <section className="card">
        <h2 className="mb-2 text-sm font-medium">Minhas categorias</h2>
        {custom.length === 0 ? <p className="text-sm text-ink-muted">Você ainda não criou categorias.</p> : (
          <ul className="divide-y divide-line">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <input aria-label={`Renomear ${c.name}`} className="input" defaultValue={c.name} maxLength={60} onBlur={(e) => rename(c, e.target.value)} />
                <span className="w-16 text-xs text-ink-muted">{c.type === "income" ? "Receita" : "Despesa"}</span>
                <button onClick={() => remove(c)} aria-label={`Excluir ${c.name}`} className="rounded-lg p-2 text-expense hover:bg-expense/10"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-medium">Categorias padrão</h2>
        <div className="flex flex-wrap gap-2">{defaults.map((c) => <span key={c.id} className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted">{c.name}</span>)}</div>
      </section>
    </div>
  );
}
