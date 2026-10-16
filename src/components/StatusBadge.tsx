const MAP: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectada", cls: "bg-income/10 text-income" },
  updating: { label: "Atualizando", cls: "bg-brand-light/10 text-brand-light" },
  pending: { label: "Importando", cls: "bg-brand-light/10 text-brand-light" },
  needs_action: { label: "Requer ação", cls: "bg-amber-400/10 text-amber-300" },
  error: { label: "Erro", cls: "bg-expense/10 text-expense" },
  disconnected: { label: "Desconectada", cls: "bg-white/5 text-ink-muted" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, cls: "bg-white/5 text-ink-muted" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
