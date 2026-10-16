"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PluggyConnect } from "react-pluggy-connect";
import { Plug } from "lucide-react";

interface Props {
  /** Se informado, reconecta/atualiza essa conexão em vez de criar uma nova. */
  connectionId?: string;
  label?: string;
  variant?: "primary" | "ghost";
}

export default function ConnectButton({ connectionId, label = "Conectar minha conta bancária", variant = "primary" }: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [updateItem, setUpdateItem] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao iniciar");
      setUpdateItem(data.itemId ?? undefined);
      setToken(data.accessToken);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha ao iniciar a conexão." });
    } finally {
      setBusy(false);
    }
  }

  // O widget fechar NÃO significa conexão concluída: o backend consulta o Item real na Pluggy.
  async function onSuccess({ item }: { item: { id: string } }) {
    setToken(null);
    setBusy(true);
    setMessage({ kind: "info", text: "Conexão autorizada. Importando seus dados…" });
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao registrar a conexão");
      setMessage(
        data.sync?.status === "success"
          ? { kind: "info", text: "Conta conectada e dados importados." }
          : { kind: "info", text: "Conta conectada. A importação termina em instantes (o banco ainda está coletando)." },
      );
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha ao registrar a conexão." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={start} disabled={busy} className={variant === "primary" ? "btn-primary" : "btn-ghost"}>
        <Plug size={16} aria-hidden /> {busy ? "Aguarde…" : label}
      </button>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-expense" : "text-ink-muted"}`}>
          {message.text}
        </p>
      )}
      {token && (
        <PluggyConnect
          connectToken={token}
          updateItem={updateItem}
          includeSandbox={process.env.NEXT_PUBLIC_PLUGGY_INCLUDE_SANDBOX === "true"}
          language="pt"
          theme="dark"
          onSuccess={onSuccess}
          onError={(err) => {
            setToken(null);
            setMessage({ kind: "error", text: err?.message ? `A conexão não foi concluída: ${err.message}` : "A conexão não foi concluída." });
          }}
          onClose={() => setToken(null)}
        />
      )}
    </div>
  );
}
