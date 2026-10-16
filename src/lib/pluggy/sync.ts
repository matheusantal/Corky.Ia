import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PluggyError,
  getItem,
  listAccounts,
  listAllTransactions,
  triggerItemUpdate,
} from "./client";
import { DEFAULT_CATEGORY, detectOwnTransfers, mapCategoryName, normalizeTransaction, type TransferCandidate } from "./normalize";
import type { PluggyItem } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, "public", any>;
export type SyncTrigger = "connect" | "manual" | "webhook" | "cron";

export interface SyncResult {
  status: "success" | "skipped" | "failed";
  message?: string;
  accounts?: number;
  transactions?: number;
}

const LOCK_WINDOW_MS = 4 * 60 * 1000;
const CHUNK = 500;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Mensagem segura para guardar/exibir: nunca inclui tokens, corpos de resposta ou stack traces. */
function safeMessage(e: unknown): string {
  if (e instanceof PluggyError) return e.message.slice(0, 200);
  return "Erro inesperado durante a sincronização";
}

function mapStatus(item: PluggyItem): { status: string; message: string | null } {
  switch (item.status) {
    case "UPDATED":
      return { status: "connected", message: null };
    case "UPDATING":
      return { status: "updating", message: "Atualização em andamento na instituição." };
    case "WAITING_USER_INPUT":
      return { status: "needs_action", message: "A instituição pediu uma confirmação adicional. Reconecte para continuar." };
    case "LOGIN_ERROR":
      return { status: "needs_action", message: "Autorização inválida ou expirada. Reconecte a conta." };
    default:
      return { status: "error", message: "A última atualização na instituição falhou. Tente sincronizar novamente." };
  }
}

/** Atualiza o status da conexão a partir do Item real na Pluggy (nunca presume sucesso). */
export async function refreshConnectionStatus(admin: Admin, connectionId: string, item?: PluggyItem) {
  const { data: conn } = await admin.from("bank_connections").select("item_id").eq("id", connectionId).single();
  if (!conn) return null;
  const it = item ?? (await getItem(conn.item_id));
  const { status, message } = mapStatus(it);
  await admin
    .from("bank_connections")
    .update({
      status,
      status_message: message,
      provider_status: it.status,
      execution_status: it.executionStatus,
      institution_name: it.connector?.name ?? null,
      connector_id: it.connector?.id ?? null,
    })
    .eq("id", connectionId);
  return it;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error("Falha ao ler dados do banco");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Solicita ao banco (via Pluggy) uma nova coleta. Itens MeuPluggy/Open Finance podem recusar: não é erro fatal. */
export async function requestProviderRefresh(itemId: string): Promise<boolean> {
  try {
    await triggerItemUpdate(itemId);
    return true;
  } catch (e) {
    if (e instanceof PluggyError && [400, 404, 409].includes(e.status)) return false;
    throw e;
  }
}

export async function syncConnection(admin: Admin, connectionId: string, trigger: SyncTrigger): Promise<SyncResult> {
  const { data: conn } = await admin.from("bank_connections").select("*").eq("id", connectionId).single();
  if (!conn) return { status: "failed", message: "Conexão não encontrada" };
  if (conn.status === "disconnected") return { status: "skipped", message: "Conexão desconectada" };

  // trava simples: evita duas sincronizações simultâneas da mesma conexão (webhook + manual)
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  const { data: running } = await admin
    .from("sync_logs").select("id").eq("connection_id", connectionId).eq("status", "running").gte("started_at", since).limit(1);
  if (running && running.length > 0) return { status: "skipped", message: "Já existe uma sincronização em andamento" };

  const { data: log } = await admin
    .from("sync_logs").insert({ user_id: conn.user_id, connection_id: connectionId, trigger, status: "running" }).select("id").single();
  const finish = (patch: Record<string, unknown>) =>
    log ? admin.from("sync_logs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", log.id) : Promise.resolve();

  try {
    const item = await refreshConnectionStatus(admin, connectionId);
    if (!item) throw new Error("item ausente");

    if (item.status !== "UPDATED") {
      const { message } = mapStatus(item);
      await finish({ status: item.status === "UPDATING" ? "skipped" : "failed", error_message: message });
      return { status: item.status === "UPDATING" ? "skipped" : "failed", message: message ?? undefined };
    }

    const userId: string = conn.user_id;

    // categorias padrão + personalizadas do usuário
    const { data: cats } = await admin.from("categories").select("id,name,user_id").or(`user_id.is.null,user_id.eq.${userId}`);
    const catByName = new Map<string, string>();
    for (const c of cats ?? []) if (c.user_id === null) catByName.set(c.name, c.id);
    const otherId = catByName.get(DEFAULT_CATEGORY.other) ?? null;

    // ---- contas ----
    const remoteAccounts = await listAccounts(conn.item_id);
    const accountRows = remoteAccounts.map((a) => ({
      user_id: userId,
      connection_id: connectionId,
      external_account_id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype ?? null,
      number: a.number ?? null,
      currency_code: a.currencyCode ?? "BRL",
      balance: Math.round(Number(a.balance) * 100) / 100,
    }));
    if (accountRows.length === 0) {
      await finish({ status: "success", accounts_count: 0, transactions_count: 0 });
      await admin.from("bank_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", connectionId);
      return { status: "success", accounts: 0, transactions: 0 };
    }
    const { data: savedAccounts, error: accErr } = await admin
      .from("accounts").upsert(accountRows, { onConflict: "connection_id,external_account_id" }).select("id,external_account_id,balance");
    if (accErr || !savedAccounts) throw new Error("Falha ao salvar contas");

    // snapshot diário do saldo (alimenta o gráfico de evolução)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    await admin.from("account_balance_snapshots").upsert(
      savedAccounts.map((a) => ({ account_id: a.id, user_id: userId, snapshot_date: today, balance: a.balance })),
      { onConflict: "account_id,snapshot_date" },
    );

    // ---- transações ----
    let txTotal = 0;
    for (const acc of savedAccounts) {
      const remote = await listAllTransactions(acc.external_account_id);
      const normalized = remote.map(normalizeTransaction);
      // dedup defensivo dentro do próprio lote
      const unique = new Map(normalized.map((n) => [n.external_transaction_id, n]));

      const existing = await fetchAll<{ external_transaction_id: string; category_source: string; transfer_source: string }>(
        (from, to) =>
          admin.from("transactions").select("external_transaction_id,category_source,transfer_source").eq("account_id", acc.id).range(from, to),
      );
      const existingMap = new Map(existing.map((e) => [e.external_transaction_id, e]));

      // agrupa por conjunto de colunas preservadas (escolhas manuais do usuário nunca são sobrescritas)
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const n of unique.values()) {
        const ex = existingMap.get(n.external_transaction_id);
        const keepCategory = ex?.category_source === "user";
        const keepTransfer = ex?.transfer_source === "user";
        const row: Record<string, unknown> = {
          user_id: userId,
          account_id: acc.id,
          external_transaction_id: n.external_transaction_id,
          provider_id: n.provider_id,
          description: n.description,
          amount: n.amount,
          type: n.type,
          pluggy_category: n.pluggy_category,
          transaction_date: n.transaction_date,
          occurred_at: n.occurred_at,
          status: n.status,
          currency_code: n.currency_code,
        };
        if (!keepCategory) {
          const catName = n.is_transfer ? DEFAULT_CATEGORY.transfers : mapCategoryName(n.pluggy_category, n.type);
          row.category_id = catByName.get(catName) ?? otherId;
          row.category_source = "auto";
        }
        if (!keepTransfer) {
          row.is_transfer = n.is_transfer;
          row.transfer_source = "auto";
        }
        const sig = `${keepCategory ? "C" : "-"}${keepTransfer ? "T" : "-"}`;
        (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(row);
      }
      for (const rows of groups.values()) {
        for (const part of chunk(rows, CHUNK)) {
          const { error } = await admin.from("transactions").upsert(part, { onConflict: "account_id,external_transaction_id" });
          if (error) throw new Error("Falha ao salvar transações");
        }
      }
      txTotal += unique.size;

      // Reconciliação: remove o que a instituição deixou de informar (ex.: cartão recria ids no fechamento
      // da fatura). Só roda se a coleta completou e trouxe dados — nunca esvazia por resposta vazia.
      if (unique.size > 0) {
        const stale = existing.filter((e) => !unique.has(e.external_transaction_id)).map((e) => e.external_transaction_id);
        for (const part of chunk(stale, 100)) {
          await admin.from("transactions").delete().eq("account_id", acc.id).in("external_transaction_id", part);
        }
      }
    }

    await markOwnTransfers(admin, userId, catByName.get(DEFAULT_CATEGORY.transfers) ?? null);

    await admin
      .from("bank_connections")
      .update({ status: "connected", status_message: null, last_synced_at: new Date().toISOString() })
      .eq("id", connectionId);
    await finish({ status: "success", accounts_count: savedAccounts.length, transactions_count: txTotal });
    return { status: "success", accounts: savedAccounts.length, transactions: txTotal };
  } catch (e) {
    const message = safeMessage(e);
    await admin.from("bank_connections").update({ status: "error", status_message: message }).eq("id", connectionId);
    await finish({ status: "failed", error_message: message });
    return { status: "failed", message };
  }
}

/** Detecta transferências entre contas do mesmo usuário nos últimos 120 dias. */
async function markOwnTransfers(admin: Admin, userId: string, transfersCategoryId: string | null) {
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const rows = await fetchAll<TransferCandidate>((a, b) =>
    admin.from("transactions").select("id,account_id,amount,transaction_date,is_transfer,transfer_source")
      .eq("user_id", userId).gte("transaction_date", from).range(a, b),
  );
  const ids = detectOwnTransfers(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  for (const part of chunk(ids, 100)) {
    await admin.from("transactions").update({ is_transfer: true, transfer_source: "auto" }).in("id", part);
    if (transfersCategoryId) {
      await admin.from("transactions").update({ category_id: transfersCategoryId }).in("id", part).eq("category_source", "auto");
    }
  }
}
