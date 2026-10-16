import { createClient } from "@/lib/supabase/server";
import ConnectButton from "@/components/ConnectButton";
import ConnectionActions from "@/components/ConnectionActions";
import StatusBadge from "@/components/StatusBadge";
import AutoRefresh from "@/components/AutoRefresh";
import { formatBRL, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SUBTYPE: Record<string, string> = {
  CHECKING_ACCOUNT: "Conta corrente", SAVINGS_ACCOUNT: "Poupança", CREDIT_CARD: "Cartão de crédito",
};

export default async function AccountsPage() {
  const supabase = createClient();
  const [{ data: conns }, { data: accounts }, { data: logs }] = await Promise.all([
    supabase.from("bank_connections").select("id,institution_name,status,status_message,last_synced_at").order("created_at"),
    supabase.from("accounts").select("id,connection_id,name,type,subtype,number,balance"),
    supabase.from("sync_logs").select("connection_id,status,started_at,error_message").order("started_at", { ascending: false }).limit(30),
  ]);
  const importing = (conns ?? []).some((c) => c.status === "pending" || c.status === "updating");

  return (
    <div className="space-y-4">
      <AutoRefresh active={importing} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contas conectadas</h1>
        <ConnectButton label="Conectar outra conta" variant="ghost" />
      </div>

      {(conns ?? []).length === 0 && <p className="card text-sm text-ink-muted">Nenhuma conta conectada ainda.</p>}

      {(conns ?? []).map((c) => {
        const accs = (accounts ?? []).filter((a) => a.connection_id === c.id);
        const lastLog = (logs ?? []).find((l) => l.connection_id === c.id);
        return (
          <section key={c.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-medium">{c.institution_name ?? "Instituição"}</h2>
                <p className="text-xs text-ink-muted">Última sincronização: {formatDateTime(c.last_synced_at)}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            {c.status_message && <p className="text-sm text-ink-muted">{c.status_message}</p>}
            {lastLog?.status === "failed" && lastLog.error_message && c.status !== "needs_action" && (
              <p className="text-xs text-expense">Última tentativa falhou: {lastLog.error_message}</p>
            )}
            {accs.length > 0 && (
              <ul className="divide-y divide-line">
                {accs.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{a.name}<span className="block text-xs text-ink-muted">{SUBTYPE[a.subtype ?? ""] ?? a.type}{a.number ? ` · ${a.number}` : ""}</span></span>
                    <span className="tabular-nums">{formatBRL(Number(a.balance))}{a.type === "CREDIT" && <span className="block text-right text-xs text-ink-muted">fatura</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <ConnectionActions id={c.id} needsAction={c.status === "needs_action"} />
          </section>
        );
      })}
    </div>
  );
}
