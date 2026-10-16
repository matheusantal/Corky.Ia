"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Unplug } from "lucide-react";
import ConnectButton from "./ConnectButton";

export default function ConnectionActions({ id, needsAction }: { id: string; needsAction: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "del" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy("sync"); setMsg(null);
    try {
      const res = await fetch(`/api/connections/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const s = data.sync?.status;
      setMsg(
        s === "success" ? "Dados atualizados."
        : s === "skipped" ? "Sincronização em andamento. Atualizo sozinho quando terminar."
        : data.sync?.message ?? "Não foi possível sincronizar agora.",
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "Falha ao sincronizar.");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    if (!confirm("Desconectar esta conta? O consentimento será revogado e os dados importados dela serão apagados do app.")) return;
    setBusy("del"); setMsg(null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "Falha ao desconectar.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={sync} disabled={busy !== null} className="btn-ghost">
          <RefreshCw size={16} className={busy === "sync" ? "animate-spin" : ""} aria-hidden /> Sincronizar
        </button>
        {needsAction && <ConnectButton connectionId={id} label="Reconectar" variant="ghost" />}
        <button onClick={disconnect} disabled={busy !== null} className="btn-danger"><Unplug size={16} aria-hidden /> Desconectar</button>
      </div>
      {msg && <p role="status" className="text-sm text-ink-muted">{msg}</p>}
    </div>
  );
}
